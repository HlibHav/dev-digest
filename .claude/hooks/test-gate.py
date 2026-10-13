#!/usr/bin/env python3
"""PreToolUse(Bash) test gate in front of `git commit`.

An eval is a probabilistic check with a threshold; "never commit red code" is a rule that must
hold every time, so it lives in a hook, not in a prompt. Before a `git commit` runs, this script
looks at what the commit would carry, runs the typecheck and the related unit tests of every
package it touches, and denies the commit when any of them fails. It never calls a model.

Decision table:

  no `git commit` in command position .. exit 0, no output, no git   (the 99% case)
  TEST_GATE_OVERRIDE=1 in the command .. allow, logged as an override (the user's call only)
  nothing staged (and no -a) ........... allow  (git itself refuses, or it is a message-only amend)
  `git add …` earlier in the command .... its files count as staged: PreToolUse runs before the
                                          command, so `git add X && git commit` would otherwise
                                          reach the gate with an empty index and pass unchecked
  `git commit <paths>` (pathspec mode) .. NOT covered: only the index, -a and earlier adds are read
  only docs / specs / non-code files ... allow
  every check of every touched package passes ... allow, logged
  any check fails ...................... DENY with the failing command and the tail of its output
  git unusable, package not installed .. ALLOW, logged  (cannot judge, so do not block)

What runs per touched package (paths are the commit's files):

  server/          pnpm typecheck · pnpm lint:boundaries · vitest related <files>
  client/          pnpm typecheck · vitest related <files>
  reviewer-core/   npm run typecheck · vitest related <files> · and server's typecheck (it imports it)
  mcp-server/      pnpm typecheck · vitest related <files>
  evals/           pnpm typecheck   (its vitest files run models, so they are not run here)
  e2e/             npm run typecheck
  .claude/hooks/   python3 -m unittest discover -s .claude/hooks/tests

`vitest related` runs only the test files that import a changed file, which keeps the gate
in seconds rather than the minutes of a full suite; CI still runs the full suites.

The commit's working directory is the hook's `cwd`, moved by a `cd <dir>` or `git -C <dir>`
in the command itself: the main session often commits in another worktree with
`cd /abs/worktree && git commit`.

Matcher is the plain tool name `Bash`; all filtering happens here, after heredoc bodies and
quoted strings are stripped, so `grep 'git commit' docs/` or a commit message that mentions
"git commit" never trips the gate (see pr-self-review.py for the 2026-09-13 false positives).

Stdin: the PreToolUse hook JSON. Stdout: nothing, or the deny JSON. Exit code: always 0 —
a non-zero exit is a non-blocking error and would never deny.
"""

from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

STATE_DIR = Path(
    os.environ.get("TEST_GATE_STATE_DIR", str(Path.home() / ".claude" / "state" / "test-gate"))
)
LOG_FILE = STATE_DIR / "log.jsonl"
CHECK_TIMEOUT_S = int(os.environ.get("TEST_GATE_CHECK_TIMEOUT", "240"))
TAIL_LINES = 40

GIT_COMMIT_RX = re.compile(
    r"(?:\A|[;&|(\n])\s*(?:\w+=\S*\s+)*git\s+(?:-C\s+\S+\s+|-c\s+\S+\s+|--\S+\s+)*commit(?![-\w])"
)
OVERRIDE_RX = re.compile(r"(?:\A|[;&|(\n\s])TEST_GATE_OVERRIDE=1\b")
HEREDOC_RX = re.compile(r"<<-?\s*['\"]?(\w+)['\"]?")
QUOTED_RX = re.compile(r"'[^']*'|\"[^\"]*\"")
SEPARATOR_RX = re.compile(r"&&|\|\||[;|\n]")

TEST_FILE_RX = re.compile(r"\.(test|spec)\.(ts|tsx|js|mjs)$")
CODE_EXT = (".ts", ".tsx", ".js", ".mjs", ".cjs", ".json")
NO_CODE_DIRS = ("docs/", "specs/", "migrations/", "/vendor/")


def strip_noise(command: str) -> str:
    """Drop heredoc bodies and quoted strings, so only real command text is matched.

    Only ever removes text, so it can hide a real invocation (fails open on a weird command)
    but cannot invent one.
    """
    out, lines, i = [], command.split("\n"), 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        for m in HEREDOC_RX.finditer(line):
            delim = m.group(1)
            i += 1
            while i < len(lines) and lines[i].strip() != delim:
                i += 1  # body dropped
            break
        i += 1
    return QUOTED_RX.sub(" ", "\n".join(out))


def log(**fields: object) -> None:
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as fh:
            stamp = datetime.now(timezone.utc).isoformat()  # noqa: UP017
            fh.write(json.dumps({"ts": stamp, **fields}, ensure_ascii=False) + "\n")
    except OSError as exc:  # logging must never break the gate
        print(f"test-gate: cannot write log: {exc}", file=sys.stderr)


def deny(reason: str) -> None:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            },
            ensure_ascii=False,
        )
    )


def git(cwd: str, *args: str) -> tuple[int, str]:
    try:
        proc = subprocess.run(
            ["git", "-C", cwd, *args], capture_output=True, text=True, timeout=30, check=False
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 1, str(exc)
    return proc.returncode, proc.stdout.strip()


def commit_segment(command: str) -> tuple[str, list[str]]:
    """The shell segment holding `git commit` and the segments before it (raw text).

    Splits the raw command on separators (quotes intact, heredoc bodies dropped) and returns the
    first segment that tokenises to `git … commit`.
    """
    body = "\n".join(strip_heredoc_bodies(command))
    segments = [s.strip() for s in SEPARATOR_RX.split(body) if s.strip()]
    for idx, seg in enumerate(segments):
        try:
            tokens = shlex.split(seg)
        except ValueError:
            continue
        while tokens and re.fullmatch(r"\w+=.*", tokens[0]):
            tokens = tokens[1:]
        if tokens[:1] == ["git"] and "commit" in tokens:
            return seg, segments[:idx]
    return "", []


def strip_heredoc_bodies(command: str) -> list[str]:
    out, lines, i = [], command.split("\n"), 0
    while i < len(lines):
        line = lines[i]
        m = HEREDOC_RX.search(line)
        out.append(HEREDOC_RX.sub(" ", line) if m else line)
        if m:
            delim = m.group(1)
            i += 1
            while i < len(lines) and lines[i].strip() != delim:
                i += 1
        i += 1
    return out


def resolve_cwd(base: str, before: list[str], seg: str) -> tuple[str, bool]:
    """Apply `cd <dir>` segments before the commit and a `git -C <dir>`; return (cwd, all_flag)."""
    cwd = base
    for prior in before:
        try:
            tokens = shlex.split(prior)
        except ValueError:
            continue
        if len(tokens) >= 2 and tokens[0] == "cd":
            cwd = str((Path(cwd) / os.path.expanduser(tokens[1])).resolve())
    try:
        tokens = shlex.split(seg)
    except ValueError:
        tokens = []
    all_flag = False
    if tokens:
        i = tokens.index("git") + 1 if "git" in tokens else 0
        while i < len(tokens) and tokens[i] != "commit":
            if tokens[i] == "-C" and i + 1 < len(tokens):
                cwd = str((Path(cwd) / os.path.expanduser(tokens[i + 1])).resolve())
                i += 2
                continue
            i += 1
        for t in tokens[i + 1 :]:
            if t == "--":
                break
            if t == "--all" or re.fullmatch(r"-[A-Za-z]*a[A-Za-z]*", t):
                all_flag = True
    return cwd, all_flag


def pending_adds(base: str, before: list[str]) -> list[tuple[str, list[str], bool]]:
    """`git add` segments that run before the commit in the same command: (cwd, pathspecs, untracked).

    PreToolUse fires before the command, so their files are not staged yet when the gate looks.
    `-A`/`--all` adds the whole tree, `-u`/`--update` only tracked files; pathspecs are relative
    to the segment's cwd, which follows earlier `cd` segments and `git -C`.
    """
    cwd, adds = base, []
    for seg in before:
        try:
            tokens = shlex.split(seg)
        except ValueError:
            continue
        while tokens and re.fullmatch(r"\w+=.*", tokens[0]):
            tokens = tokens[1:]
        if len(tokens) >= 2 and tokens[0] == "cd":
            cwd = str((Path(cwd) / os.path.expanduser(tokens[1])).resolve())
            continue
        if tokens[:1] != ["git"] or "add" not in tokens:
            continue
        at, i = cwd, 1
        while i < len(tokens) and tokens[i] != "add":
            if tokens[i] == "-C" and i + 1 < len(tokens):
                at = str((Path(at) / os.path.expanduser(tokens[i + 1])).resolve())
                i += 1
            i += 1
        specs, untracked, whole = [], True, False
        for t in tokens[i + 1 :]:
            if t in ("-A", "--all"):
                whole = True
            elif t in ("-u", "--update"):
                whole, untracked = True, False
            elif t != "--" and not t.startswith("-"):
                specs.append(t)
        if whole and not specs:
            specs = [":/"]
        if specs:
            adds.append((at, specs, untracked))
    return adds


def is_code(path: str) -> bool:
    if any(d in path for d in NO_CODE_DIRS):
        return False
    return path.endswith(CODE_EXT) or path.startswith(".claude/hooks/")


def plan_checks(files: list[str]) -> list[tuple[str, str, list[str]]]:
    """(label, package dir relative to the repo root, argv) for every check the files need."""
    by_pkg: dict[str, list[str]] = {}
    for f in files:
        if not is_code(f):
            continue
        top = f.split("/", 1)[0]
        if f.startswith(".claude/hooks/"):
            by_pkg.setdefault(".claude/hooks", []).append(f)
        elif top in ("server", "client", "reviewer-core", "mcp-server", "evals", "e2e"):
            by_pkg.setdefault(top, []).append(f[len(top) + 1 :])

    def related(pm: list[str], rel: list[str]) -> list[str]:
        src = [r for r in rel if r.endswith((".ts", ".tsx", ".js", ".mjs"))]
        return [*pm, "vitest", "related", "--run", "--passWithNoTests", *src] if src else []

    checks: list[tuple[str, str, list[str]]] = []
    pnpm, npx = ["pnpm", "exec"], ["npx", "--no-install"]
    if "reviewer-core" in by_pkg:
        rel = by_pkg["reviewer-core"]
        checks.append(("reviewer-core typecheck", "reviewer-core", ["npm", "run", "-s", "typecheck"]))
        if argv := related(npx, rel):
            checks.append(("reviewer-core related tests", "reviewer-core", argv))
        if "server" not in by_pkg:
            checks.append(("server typecheck (imports reviewer-core)", "server", ["pnpm", "-s", "typecheck"]))
    if "server" in by_pkg:
        rel = by_pkg["server"]
        checks.append(("server typecheck", "server", ["pnpm", "-s", "typecheck"]))
        checks.append(("server lint:boundaries", "server", ["pnpm", "-s", "lint:boundaries"]))
        if argv := related(pnpm, rel):
            checks.append(("server related tests", "server", argv))
    if "client" in by_pkg:
        rel = by_pkg["client"]
        checks.append(("client typecheck", "client", ["pnpm", "-s", "typecheck"]))
        if argv := related(pnpm, rel):
            checks.append(("client related tests", "client", argv))
    if "mcp-server" in by_pkg:
        rel = by_pkg["mcp-server"]
        checks.append(("mcp-server typecheck", "mcp-server", ["pnpm", "-s", "typecheck"]))
        if argv := related(pnpm, rel):
            checks.append(("mcp-server related tests", "mcp-server", argv))
    if "evals" in by_pkg:
        checks.append(("evals typecheck", "evals", ["pnpm", "-s", "typecheck"]))
    if "e2e" in by_pkg:
        checks.append(("e2e typecheck", "e2e", ["npm", "run", "-s", "typecheck"]))
    if ".claude/hooks" in by_pkg:
        checks.append(
            (
                "hook tests",
                ".",
                [sys.executable, "-m", "unittest", "discover", "-s", ".claude/hooks/tests"],
            )
        )
    return checks


def tail(text: str, n: int = TAIL_LINES) -> str:
    lines = [ln for ln in text.splitlines() if ln.strip()]
    return "\n".join(lines[-n:])


def main() -> int:
    try:
        hook_input = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        return 0
    if hook_input.get("tool_name") != "Bash":
        return 0
    command = str((hook_input.get("tool_input") or {}).get("command", ""))
    if not GIT_COMMIT_RX.search(strip_noise(command)):
        return 0  # the no-op path: no log, no git, no filesystem

    seg, before = commit_segment(command)
    base = str(hook_input.get("cwd") or os.getcwd())
    cwd, all_flag = resolve_cwd(base, before, seg)

    if OVERRIDE_RX.search(strip_noise(command)):
        log(decision="override", cwd=cwd, command=command[:300])
        return 0

    rc, root = git(cwd, "rev-parse", "--show-toplevel")
    if rc != 0 or not root:
        log(decision="fail-open", cwd=cwd, error="not a git work tree")
        return 0

    rc, staged = git(root, "diff", "--cached", "--name-only", "--diff-filter=ACMR")
    if rc != 0:
        log(decision="fail-open", cwd=cwd, error="git diff --cached failed")
        return 0
    files = set(filter(None, staged.splitlines()))
    if all_flag:
        _, unstaged = git(root, "diff", "--name-only", "--diff-filter=ACMR")
        files |= set(filter(None, unstaged.splitlines()))
    for at, specs, untracked in pending_adds(base, before):
        _, changed = git(at, "diff", "--name-only", "--diff-filter=ACMR", "--", *specs)
        files |= set(filter(None, changed.splitlines()))
        if untracked:
            _, new = git(at, "ls-files", "--others", "--exclude-standard", "--full-name", "--", *specs)
            files |= set(filter(None, new.splitlines()))
    if not files:
        return 0

    checks = plan_checks(sorted(files))
    if not checks:
        log(decision="allow", root=root, reason="no code files", files=len(files))
        return 0

    ran: list[str] = []
    for label, pkg, argv in checks:
        pkg_dir = Path(root) / pkg
        if pkg != "." and not (pkg_dir / "node_modules").is_dir():
            log(decision="fail-open", root=root, check=label, error=f"{pkg}/node_modules missing")
            continue
        started = time.monotonic()
        try:
            proc = subprocess.run(
                argv,
                cwd=pkg_dir,
                capture_output=True,
                text=True,
                timeout=CHECK_TIMEOUT_S,
                check=False,
                env={**os.environ, "CI": "1", "FORCE_COLOR": "0", "NO_COLOR": "1"},
            )
        except FileNotFoundError as exc:
            log(decision="fail-open", root=root, check=label, error=str(exc))
            continue
        except subprocess.TimeoutExpired:
            log(decision="deny", root=root, check=label, reason="timeout")
            deny(
                f"test-gate: `{label}` did not finish in {CHECK_TIMEOUT_S}s, so this commit is "
                f"not proven green.\nCommand: (cd {pkg} && {shlex.join(argv)})"
            )
            return 0
        took = round(time.monotonic() - started, 1)
        if proc.returncode != 0:
            log(decision="deny", root=root, check=label, exit=proc.returncode, seconds=took)
            deny(
                f"test-gate blocked this commit: `{label}` failed (exit {proc.returncode}).\n"
                f"Command: (cd {pkg} && {shlex.join(argv)})\n"
                f"{tail(proc.stdout + chr(10) + proc.stderr)}\n"
                "Fix the failure and commit again. Only the user may bypass the gate "
                "(TEST_GATE_OVERRIDE=1)."
            )
            return 0
        ran.append(f"{label} {took}s")

    log(decision="allow", root=root, checks=ran, files=len(files))
    return 0


if __name__ == "__main__":
    sys.exit(main())
