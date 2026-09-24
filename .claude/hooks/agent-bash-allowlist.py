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

A command is allowed only when it parses into one of the exact shapes below. Anything else is
denied, and so is anything the script cannot parse: this is an allowlist, so it fails closed.
Shell metacharacters (`; & | < > $( \\``, newlines) are denied outright, which rules out
chaining, redirection and substitution. `cd x && …` is denied for the same reason; the agent
prompts give the `--dir` / `--prefix` / `-C` forms instead.

Why a hook and not `permissionMode: plan`: the main session's `bypassPermissions`,
`acceptEdits` and `auto` modes override a subagent's `permissionMode`
(https://code.claude.com/docs/en/sub-agents). A hook runs regardless.

Stdin: the PreToolUse hook JSON. Stdout: nothing (allow) or the deny JSON. Exit code: always 0 —
a non-zero exit is a non-blocking error for PreToolUse and would never deny.
"""

from __future__ import annotations

import json
import re
import shlex
import sys

PROFILES = ("architecture", "verify", "test")

METACHARS = re.compile(r"[;&|<>`\n\r]|\$\(")

GIT_READ_SUBCOMMANDS = {
    "diff",
    "log",
    "show",
    "status",
    "merge-base",
    "rev-parse",
    "ls-files",
    "blame",
}
# Options that make a read-only git subcommand write a file or run a helper program.
GIT_FORBIDDEN_PREFIXES = ("--output", "--ext-diff", "--textconv", "-o")

# A path argument: relative or absolute, no `..` segment, no leading dash.
SAFE_PATH = re.compile(r"^(?!-)(?!(?:.*/)?\.\.(?:/|$))[\w@%+=:,./\[\]{}()*-]+$")


def pkg_dir(value: str, allowed: tuple[str, ...]) -> bool:
    """`server`, or an absolute path to another checkout ending in `/server`."""
    if not SAFE_PATH.match(value):
        return False
    return value.rstrip("/").rsplit("/", 1)[-1] in allowed


def git_allowed(tokens: list[str]) -> bool:
    rest = tokens[1:]
    if len(rest) >= 2 and rest[0] == "-C":
        if not SAFE_PATH.match(rest[1]):
            return False
        rest = rest[2:]
    if not rest:
        return False
    if rest == ["branch", "--show-current"]:
        return True
    if rest[0] not in GIT_READ_SUBCOMMANDS:
        return False
    return not any(tok.startswith(GIT_FORBIDDEN_PREFIXES) for tok in rest[1:])


def vitest_args_allowed(args: list[str]) -> bool:
    """Arguments after `vitest run`: paths, `-t <name>`, `--reporter=<word>`."""
    i = 0
    while i < len(args):
        tok = args[i]
        if tok == "-t" and i + 1 < len(args):
            i += 2
            continue
        if re.fullmatch(r"--reporter=[a-z-]+", tok):
            i += 1
            continue
        if not SAFE_PATH.match(tok):
            return False
        i += 1
    return True


def architecture_allowed(tokens: list[str]) -> bool:
    if len(tokens) >= 4 and tokens[:2] == ["pnpm", "--dir"] and pkg_dir(tokens[2], ("server",)):
        tail = tokens[3:]
        if tail == ["lint:boundaries"]:
            return True
        if tail == ["exec", "vitest", "run", "test/route-adapter-calls.test.ts"]:
            return True
    return False


def verify_allowed(tokens: list[str]) -> bool:
    if len(tokens) >= 4 and tokens[:2] == ["pnpm", "--dir"]:
        d, tail = tokens[2], tokens[3:]
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
    if len(tokens) >= 4 and tokens[:2] == ["npm", "--prefix"]:
        d, tail = tokens[2], tokens[3:]
        if pkg_dir(d, ("reviewer-core",)) and tail in (["test"], ["run", "typecheck"]):
            return True
        if pkg_dir(d, ("e2e",)) and tail == ["run", "typecheck"]:
            return True
        if pkg_dir(d, ("reviewer-core",)) and tail[:2] == ["test", "--"] and len(tail) > 2:
            return vitest_args_allowed(tail[2:])
    return architecture_allowed(tokens)


def allowed(command: str, profile: str) -> tuple[bool, str]:
    if METACHARS.search(command):
        return False, "shell metacharacters (; & | < > $( ` newline) are not allowed; run one plain command"
    try:
        tokens = shlex.split(command)
    except ValueError as exc:
        return False, f"command could not be parsed ({exc})"
    if not tokens:
        return False, "empty command"
    if tokens[0] == "git" and git_allowed(tokens):
        return True, ""
    if tokens == ["diff", "-rq", "server/src/vendor/shared", "client/src/vendor/shared"]:
        return True, ""
    if profile == "architecture" and architecture_allowed(tokens):
        return True, ""
    if profile in ("verify", "test") and verify_allowed(tokens):
        return True, ""
    return False, f"not on the `{profile}` allowlist"


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
    profile = sys.argv[1] if len(sys.argv) > 1 else ""
    if profile not in PROFILES:
        deny(f"unknown profile {profile!r}")
        return 0
    try:
        payload = json.load(sys.stdin)
        command = payload["tool_input"]["command"]
        if not isinstance(command, str):
            raise TypeError("command is not a string")
    except Exception as exc:  # any unreadable input must deny
        deny(f"hook input unreadable ({exc.__class__.__name__})")
        return 0
    ok, reason = allowed(command.strip(), profile)
    if not ok:
        deny(reason)
    return 0


if __name__ == "__main__":
    sys.exit(main())
