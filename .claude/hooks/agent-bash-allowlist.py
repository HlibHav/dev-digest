#!/usr/bin/env python3
"""PreToolUse(Bash) allowlist for the review and test subagents.

Wired only from agent frontmatter (`.claude/agents/*.md`), never from `settings.json`:

  hooks:
    PreToolUse:
      - matcher: "Bash"
        hooks:
          - type: command
            command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/agent-bash-allowlist.py architecture'

Profiles:

  architecture .. read-only git + `lint:boundaries` + the route-adapter-calls test
  verify ........ read-only git + the Check-table commands + targeted vitest runs
  test .......... same as verify
  security ...... read-only git + `diff` + `gh pr view`; nothing that executes repo code, not even
                  typecheck or lint (a `package.json` script or a lint config in the diff under
                  review is attacker-controlled input for this reviewer)

How a command is judged
-----------------------
The shell, not this script, runs the command after it is allowed. So the script only accepts a
command whose words the shell will pass through unchanged, and splits it itself:

  * a bare word may use only `A-Za-z0-9 _ . / : @ % + = , - ^ ~` plus `[ ]`. That excludes every
    character the shell expands or treats specially: `{ } $ * ? ( ) ! # | < > \\ " \\``, newlines;
  * `[` and `]` are glob characters too (`app/[repoId]/page.tsx`), but a Next.js route path needs
    them, so a bare word containing them is allowed and re-emitted single-quoted;
  * a single-quoted word ('…') is taken literally, as the shell takes it;
  * a bare word may not start with `~ ^ =` (tilde, zsh negation, zsh `=cmd` expansion), and `~`
    may not follow `=` or `:`;
  * `;` and `&&` split the command into segments. Every segment is judged on its own against the
    same allowlist, and the command reaches the shell with the segments joined by `&&`. `|`,
    `||` and a single `&` are refused.

The words it checks are therefore the words the program receives. The earlier version tokenised
with shlex and allowed `{`, `$'…'` and `$VAR`, so `git diff {--output=/x,HEAD}` passed the check
and reached git as `--output=/x` (2026-09-24 security review).

When the allowed command differs from what the agent typed (a `;` chain, a `[` path), the hook
returns `permissionDecision: allow` with `updatedInput` carrying the whole `tool_input` and the
rewritten `command`, so `dangerouslyDisableSandbox` survives whether the host merges or replaces
the input. A denial used to cost a full turn on a ~150k-token window; the 2026-09-26 token
profile counted 7 such turns in one plan-verifier run.

Git long options are matched with git's own abbreviation rule: `--outp` is `--output`.
`--dir` / `--prefix` must resolve to a package directory of this repo or of one of its git
worktrees; a directory merely named `server` (for example under `server/clones/`, where
DevDigest keeps third-party clones) is refused, because pnpm would run its package.json scripts.

Why a hook and not `permissionMode: plan`: the main session's `bypassPermissions`,
`acceptEdits` and `auto` modes override a subagent's `permissionMode`
(https://code.claude.com/docs/en/sub-agents). A hook runs regardless.

Stdin: the PreToolUse hook JSON. Stdout: nothing (allow) or the deny JSON. Exit code: always 0 —
a non-zero exit is a non-blocking error for PreToolUse and would never deny, so every failure
inside the script, expected or not, is turned into a deny.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

PROFILES = ("architecture", "verify", "test", "security")

BARE_CHARS = re.compile(r"[A-Za-z0-9_./:@%+=,\-^~]")
# Allowed in a bare word, but the word is re-emitted single-quoted so the shell never globs it.
QUOTE_ON_REWRITE = "[]"

GH_REPO = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.\-]*/[A-Za-z0-9][A-Za-z0-9_.\-]*")
GH_PR_REF = re.compile(rf"[0-9]+|https://github\.com/{GH_REPO.pattern}/pull/[0-9]+")
GH_JSON_FIELDS = re.compile(r"[A-Za-z]+(,[A-Za-z]+)*")
DIFF_FLAGS = re.compile(r"-[rquN]+")

GIT_READ_SUBCOMMANDS = {"diff", "log", "show", "status", "merge-base", "rev-parse", "ls-files", "blame"}
# Long options that make a read-only git subcommand write a file or run a program. Any
# abbreviation git would accept (`--outp`, `--ext`, `--textc`) is refused too.
GIT_FORBIDDEN_LONG = ("output", "ext-diff", "textconv", "exec-path", "git-dir", "work-tree", "config-env")

PACKAGES = ("server", "client", "reviewer-core", "e2e")

# Every command that executes repo code must be prefixed with this, verbatim, from the repo root.
WRAPPER = ".claude/sandbox/run-tests.sh"


class Refused(Exception):
    """The command is not on the allowlist; the message is the reason."""


class Word:
    """One argument as the program will receive it, and whether the agent quoted it."""

    __slots__ = ("text", "quoted")

    def __init__(self, text: str, quoted: bool) -> None:
        self.text, self.quoted = text, quoted

    def render(self) -> str:
        if self.quoted or not self.text or any(not BARE_CHARS.fullmatch(ch) for ch in self.text):
            return f"'{self.text}'"
        return self.text


def split_segments(command: str) -> list[list[Word]]:
    """Split like the shell would, refusing anything the shell would expand.

    Returns one word list per `;` / `&&` segment; an empty segment is refused.
    """
    segments: list[list[Word]] = []
    words: list[Word] = []
    text: list[str] = []
    quoted = False
    in_word = False
    i = 0

    def end_word() -> None:
        nonlocal text, quoted, in_word
        if in_word:
            words.append(Word("".join(text), quoted))
            text, quoted, in_word = [], False, False

    def end_segment() -> None:
        nonlocal words
        end_word()
        if not words:
            raise Refused("empty command segment (a leading, trailing or doubled ';' / '&&')")
        segments.append(words)
        words = []

    while i < len(command):
        ch = command[i]
        if ch in " \t":
            end_word()
            i += 1
            continue
        if ch == ";":
            end_segment()
            i += 1
            continue
        if ch == "&":
            if command[i + 1 : i + 2] != "&":
                raise Refused("a single '&' (background job) is not allowed")
            end_segment()
            i += 2
            continue
        if ch == "'":
            end = command.find("'", i + 1)
            if end == -1:
                raise Refused("unterminated single quote")
            literal = command[i + 1 : end]
            if "\n" in literal or "\r" in literal:
                raise Refused("newline inside quotes")
            text.append(literal)
            quoted = in_word = True
            i = end + 1
            continue
        if not BARE_CHARS.fullmatch(ch) and ch not in QUOTE_ON_REWRITE:
            raise Refused(
                f"character {ch!r} is not allowed unquoted (no braces, $, globs, backslashes, "
                "double quotes, pipes or '||'; wrap a literal argument in single quotes)"
            )
        if not text and ch in "~^=":
            raise Refused(f"a word may not start with {ch!r}")
        if ch == "~" and text and text[-1] in ("=", ":"):
            raise Refused("'~' after '=' or ':' is expanded by the shell")
        text.append(ch)
        in_word = True
        i += 1
    end_segment()
    return segments


def render(segments: list[list[Word]]) -> str:
    return " && ".join(" ".join(w.render() for w in seg) for seg in segments)


def plain_path(value: str) -> bool:
    """A path argument: no leading dash, no `..` segment, nothing under `clones/`."""
    parts = value.split("/")
    return bool(value) and not value.startswith("-") and ".." not in parts and "clones" not in parts


@lru_cache(maxsize=1)
def repo_roots() -> frozenset[Path]:
    """This checkout plus every git worktree of the same repository."""
    root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()).resolve()
    roots = {root}
    try:
        out = subprocess.run(
            ["git", "-C", str(root), "worktree", "list", "--porcelain"],
            capture_output=True, text=True, timeout=5, check=True,
        ).stdout
        roots |= {Path(line[len("worktree "):]).resolve() for line in out.splitlines() if line.startswith("worktree ")}
    except Exception:  # without the list, only this checkout's own packages are allowed
        pass
    return frozenset(roots)


def pkg_dir(value: str, allowed: tuple[str, ...]) -> bool:
    """`server`, or an absolute path to `<a worktree of this repo>/server`."""
    if not plain_path(value):
        return False
    root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()).resolve()
    target = (Path(value) if value.startswith("/") else root / value).resolve()
    return target.name in allowed and target.parent in repo_roots()


def git_option_forbidden(word: str) -> bool:
    if word.startswith("--"):
        name = word[2:].split("=", 1)[0]
        return bool(name) and any(opt.startswith(name) for opt in GIT_FORBIDDEN_LONG)
    return word.startswith(("-c", "-o", "-O"))


def git_allowed(words: list[str]) -> bool:
    rest = words[1:]
    if len(rest) >= 2 and rest[0] == "-C":
        if not plain_path(rest[1]):
            return False
        rest = rest[2:]
    if rest == ["branch", "--show-current"]:
        return True
    if not rest or rest[0] not in GIT_READ_SUBCOMMANDS:
        return False
    return not any(git_option_forbidden(w) for w in rest[1:])


def vitest_args_allowed(args: list[str]) -> bool:
    """Arguments after `vitest run`: paths, `-t <name>`, `--reporter=<word>`."""
    i = 0
    while i < len(args):
        word = args[i]
        if word == "-t" and i + 1 < len(args) and not args[i + 1].startswith("-"):
            i += 2
            continue
        if re.fullmatch(r"--reporter=[a-z-]+", word):
            i += 1
            continue
        if word == ".it.test" or not plain_path(word):
            return False
        i += 1
    return True


def code_run_allowed(words: list[str], profile: str) -> bool:
    """Commands that execute repo code: tests, and lint (its config is JavaScript).

    These run only inside `.claude/sandbox/run-tests.sh`, so `check` calls this on the words
    after the wrapper and refuses a match that isn't wrapped.
    """
    if profile == "security" or len(words) < 4:
        return False
    d, tail = words[2], words[3:]
    if words[:2] == ["pnpm", "--dir"] and pkg_dir(d, ("server",)) and tail in (
        ["lint:boundaries"],
        ["exec", "vitest", "run", "test/route-adapter-calls.test.ts"],
    ):
        return True
    if profile == "architecture":
        return False
    if words[:2] == ["pnpm", "--dir"]:
        if pkg_dir(d, ("client",)) and tail == ["test"]:
            return True
        if pkg_dir(d, ("server",)) and tail == ["exec", "vitest", "run", "--exclude", "**/*.it.test.ts"]:
            return True
        if pkg_dir(d, ("server", "client")) and tail[:3] == ["exec", "vitest", "run"] and len(tail) > 3:
            return vitest_args_allowed(tail[3:])
    if words[:2] == ["npm", "--prefix"] and pkg_dir(d, ("reviewer-core",)):
        if tail == ["test"]:
            return True
        if tail[:2] == ["test", "--"] and len(tail) > 2:
            return vitest_args_allowed(tail[2:])
    return False


def integration_suite(words: list[str], profile: str) -> bool:
    """plan-verifier's one Docker run. It can't be sandboxed: Docker access escapes any sandbox,
    so the main session reads test-writer's integration tests before this suite runs them. For
    the same reason it runs only in this checkout: another worktree's tests were read by nobody
    (2026-09-25 security review)."""
    if not (
        profile == "verify"
        and len(words) == 7
        and words[:2] == ["pnpm", "--dir"]
        and words[3:] == ["exec", "vitest", "run", ".it.test"]
        and plain_path(words[2])
    ):
        return False
    root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()).resolve()
    target = (Path(words[2]) if words[2].startswith("/") else root / words[2]).resolve()
    return target == root / "server"


def gh_pr_view_allowed(words: list[str]) -> bool:
    """`gh pr view <n|url> --json <fields> [--jq|-q <expr>] [--repo|-R <owner/repo>]`: the PR
    body and metadata as JSON, nothing that opens a browser, edits or hits the raw API."""
    if words[:3] != ["gh", "pr", "view"]:
        return False
    rest = words[3:]
    if not rest or not GH_PR_REF.fullmatch(rest[0]):
        return False
    rest, seen_json = rest[1:], False
    while rest:
        flag = rest[0]
        if flag == "--json" and len(rest) >= 2 and GH_JSON_FIELDS.fullmatch(rest[1]):
            seen_json = True
        elif flag in ("--jq", "-q") and len(rest) >= 2 and not rest[1].startswith("-"):
            pass
        elif flag in ("--repo", "-R") and len(rest) >= 2 and GH_REPO.fullmatch(rest[1]):
            pass
        else:
            return False
        rest = rest[2:]
    return seen_json


def diff_allowed(words: list[str]) -> bool:
    """`diff [-rquN…] <path> <path>` between two relative paths inside the repo; no long
    options, no absolute paths (`diff -r / /tmp` would read the whole disk)."""
    if words[0] != "diff":
        return False
    args = words[1:]
    while args and args[0].startswith("-"):
        if not DIFF_FLAGS.fullmatch(args[0]):
            return False
        args = args[1:]
    return len(args) == 2 and all(plain_path(a) and not a.startswith("/") for a in args)


def read_only_allowed(words: list[str], profile: str) -> bool:
    """Commands that read or type-check but execute no repo code."""
    if words[0] == "git":
        return git_allowed(words)
    if words == ["diff", "-rq", "server/src/vendor/shared", "client/src/vendor/shared"]:
        return True
    if profile == "security":
        # No typecheck either: `pnpm typecheck` runs a package.json script the diff may rewrite.
        return gh_pr_view_allowed(words) or diff_allowed(words)
    if profile == "verify" and (
        gh_pr_view_allowed(words) or words == ["docker", "info"] or diff_allowed(words)
    ):
        return True
    if len(words) >= 4:
        d, tail = words[2], words[3:]
        if words[:2] == ["pnpm", "--dir"] and pkg_dir(d, ("server", "client")) and tail == ["typecheck"]:
            return True
        if words[:2] == ["npm", "--prefix"] and pkg_dir(d, ("reviewer-core", "e2e")) and tail == ["run", "typecheck"]:
            return True
    return False


def check(command: str, profile: str, unsandboxed: bool) -> str:
    """Judge every segment; return the command as the shell should receive it."""
    segments = split_segments(command)
    for segment in segments:
        check_segment([w.text for w in segment], profile, unsandboxed)
    return render(segments)


def check_segment(words: list[str], profile: str, unsandboxed: bool) -> None:
    if words[0] == WRAPPER:
        if not code_run_allowed(words[1:], profile):
            raise Refused(f"{WRAPPER} only wraps the test and lint runs of the `{profile}` profile")
        return  # srt can't start inside another macOS sandbox, so this may run unsandboxed
    if code_run_allowed(words, profile):
        raise Refused(f"this runs repo code, so run it through the sandbox: {WRAPPER} {command}")
    if integration_suite(words, profile):
        return  # Docker can't run inside the session sandbox either
    if not read_only_allowed(words, profile):
        raise Refused(f"not on the `{profile}` allowlist")
    if unsandboxed:
        raise Refused(
            f"only {WRAPPER} and the integration suite may run outside the session sandbox; "
            "run this command without dangerouslyDisableSandbox"
        )


def deny(reason: str) -> None:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": (
                        f"agent-bash-allowlist: {reason}. The allowed command forms are listed "
                        "in your agent file under 'Commands you may run'."
                    ),
                }
            }
        )
    )


def allow_rewritten(tool_input: dict, command: str) -> None:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "allow",
                    "permissionDecisionReason": (
                        "agent-bash-allowlist: allowed as `" + command + "` (';' joined with '&&', "
                        "glob characters quoted)"
                    ),
                    "updatedInput": {**tool_input, "command": command},
                }
            }
        )
    )


def main() -> int:
    try:
        profile = sys.argv[1] if len(sys.argv) > 1 else ""
        if profile not in PROFILES:
            raise Refused(f"unknown profile {profile!r}")
        tool_input = json.load(sys.stdin)["tool_input"]
        command = tool_input["command"]
        if not isinstance(command, str):
            raise Refused("command is not a string")
        original = command.strip()
        allowed = check(original, profile, tool_input.get("dangerouslyDisableSandbox") is True)
        if allowed != original:
            allow_rewritten(tool_input, allowed)
    except Refused as exc:
        deny(str(exc))
    except Exception as exc:  # anything unexpected must deny, never fall through to allow
        deny(f"hook error ({exc.__class__.__name__})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
