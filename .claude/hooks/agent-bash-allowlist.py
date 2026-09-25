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

How a command is judged
-----------------------
The shell, not this script, runs the command after it is allowed. So the script only accepts a
command whose words the shell will pass through unchanged, and splits it itself:

  * a bare word may use only `A-Za-z0-9 _ . / : @ % + = , - ^ ~`. That excludes every character
    the shell expands or treats specially: `{ } $ * ? [ ] ( ) ! # & | ; < > \\ " \\``, newlines;
  * a single-quoted word ('…') is taken literally, as the shell takes it;
  * a bare word may not start with `~ ^ =` (tilde, zsh negation, zsh `=cmd` expansion), and `~`
    may not follow `=` or `:`.

The words it checks are therefore the words the program receives. The earlier version tokenised
with shlex and allowed `{`, `$'…'` and `$VAR`, so `git diff {--output=/x,HEAD}` passed the check
and reached git as `--output=/x` (2026-09-24 security review).

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

PROFILES = ("architecture", "verify", "test")

BARE_CHARS = re.compile(r"[A-Za-z0-9_./:@%+=,\-^~]")

GIT_READ_SUBCOMMANDS = {"diff", "log", "show", "status", "merge-base", "rev-parse", "ls-files", "blame"}
# Long options that make a read-only git subcommand write a file or run a program. Any
# abbreviation git would accept (`--outp`, `--ext`, `--textc`) is refused too.
GIT_FORBIDDEN_LONG = ("output", "ext-diff", "textconv", "exec-path", "git-dir", "work-tree", "config-env")

PACKAGES = ("server", "client", "reviewer-core", "e2e")


class Refused(Exception):
    """The command is not on the allowlist; the message is the reason."""


def split_words(command: str) -> list[str]:
    """Split like the shell would, refusing anything the shell would expand."""
    words: list[str] = []
    word: list[str] = []
    in_word = False
    i = 0
    while i < len(command):
        ch = command[i]
        if ch in " \t":
            if in_word:
                words.append("".join(word))
                word, in_word = [], False
            i += 1
            continue
        if ch == "'":
            end = command.find("'", i + 1)
            if end == -1:
                raise Refused("unterminated single quote")
            literal = command[i + 1 : end]
            if "\n" in literal or "\r" in literal:
                raise Refused("newline inside quotes")
            word.append(literal)
            in_word = True
            i = end + 1
            continue
        if not BARE_CHARS.fullmatch(ch):
            raise Refused(
                f"character {ch!r} is not allowed unquoted (no braces, $, globs, backslashes, "
                "double quotes or shell operators; wrap a literal argument in single quotes)"
            )
        if not word and ch in "~^=":
            raise Refused(f"a word may not start with {ch!r}")
        if ch == "~" and word and word[-1][-1:] in ("=", ":"):
            raise Refused("'~' after '=' or ':' is expanded by the shell")
        word.append(ch)
        in_word = True
        i += 1
    if in_word:
        words.append("".join(word))
    return words


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
        if not plain_path(word):
            return False
        i += 1
    return True


def architecture_allowed(words: list[str]) -> bool:
    if len(words) >= 4 and words[:2] == ["pnpm", "--dir"] and pkg_dir(words[2], ("server",)):
        tail = words[3:]
        return tail in (["lint:boundaries"], ["exec", "vitest", "run", "test/route-adapter-calls.test.ts"])
    return False


def verify_allowed(words: list[str]) -> bool:
    if len(words) >= 4 and words[:2] == ["pnpm", "--dir"]:
        d, tail = words[2], words[3:]
        if pkg_dir(d, ("server", "client")) and tail == ["typecheck"]:
            return True
        if pkg_dir(d, ("client",)) and tail == ["test"]:
            return True
        if pkg_dir(d, ("server",)) and tail in (
            ["exec", "vitest", "run", "--exclude", "**/*.it.test.ts"],
            ["exec", "vitest", "run", ".it.test"],
        ):
            return True
        if pkg_dir(d, ("server", "client")) and tail[:3] == ["exec", "vitest", "run"] and len(tail) > 3:
            return vitest_args_allowed(tail[3:])
    if len(words) >= 4 and words[:2] == ["npm", "--prefix"]:
        d, tail = words[2], words[3:]
        if pkg_dir(d, ("reviewer-core",)) and tail in (["test"], ["run", "typecheck"]):
            return True
        if pkg_dir(d, ("e2e",)) and tail == ["run", "typecheck"]:
            return True
        if pkg_dir(d, ("reviewer-core",)) and tail[:2] == ["test", "--"] and len(tail) > 2:
            return vitest_args_allowed(tail[2:])
    return architecture_allowed(words)


def check(command: str, profile: str) -> None:
    words = split_words(command)
    if not words:
        raise Refused("empty command")
    if words[0] == "git" and git_allowed(words):
        return
    if words == ["diff", "-rq", "server/src/vendor/shared", "client/src/vendor/shared"]:
        return
    if profile == "architecture" and architecture_allowed(words):
        return
    if profile in ("verify", "test") and verify_allowed(words):
        return
    raise Refused(f"not on the `{profile}` allowlist")


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


def main() -> int:
    try:
        profile = sys.argv[1] if len(sys.argv) > 1 else ""
        if profile not in PROFILES:
            raise Refused(f"unknown profile {profile!r}")
        command = json.load(sys.stdin)["tool_input"]["command"]
        if not isinstance(command, str):
            raise Refused("command is not a string")
        check(command.strip(), profile)
    except Refused as exc:
        deny(str(exc))
    except Exception as exc:  # anything unexpected must deny, never fall through to allow
        deny(f"hook error ({exc.__class__.__name__})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
