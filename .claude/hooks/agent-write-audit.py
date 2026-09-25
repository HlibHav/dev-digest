#!/usr/bin/env python3
"""After-the-fact check of what a subagent changed in the repo.

Wired only from agent frontmatter, as two hooks with the same profile:

  hooks:
    PreToolUse:
      - matcher: ".*"
        hooks:
          - type: command
            command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/agent-write-audit.py tests'
    Stop:                       # Claude Code turns a frontmatter Stop hook into SubagentStop
      - hooks:
          - type: command
            command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/agent-write-audit.py tests'

Profiles: `tests` (test-writer's paths), `docs` (doc-writer's paths), `none` (read-only agents).
The path rules are the ones in agent-write-scope.py, loaded from that file.

On the agent's first tool call (PreToolUse) it records a baseline, keyed by `agent_id`: HEAD
plus a hash of every file `git status` lists (tracked changes and untracked files; ignored files
are not tracked). The first tool call runs before any of the agent's own writes, so uncommitted
work that was already in the tree, such as the implementer's, is part of the baseline and not
blamed on the agent.

At SubagentStop it recomputes the same snapshot and reports, through `systemMessage` (shown to
the main session), every file that changed and is outside the profile's paths, and a moved HEAD.
It never blocks: the agent's work is kept and the main session decides. It can't see writes
outside the repo; for test-writer those are stopped by the srt sandbox around every test run
(.claude/sandbox/run-tests.sh).

Stdin: the hook JSON. Stdout: nothing, or `{"systemMessage": ...}`. Exit code: always 0.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load_scope():
    spec = importlib.util.spec_from_file_location("agent_write_scope", HERE / "agent-write-scope.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def allowed(rel: str, profile: str) -> bool:
    if profile == "none":
        return False
    scope = load_scope()
    if profile == "tests":
        return rel not in scope.TEST_DENY and any(rx.match(rel) for rx in scope.TEST_ALLOW)
    if profile == "docs":
        return not any(rx.search(rel) for rx in scope.DOCS_DENY) and any(rx.match(rel) for rx in scope.DOCS_ALLOW)
    return False


def git(root: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(root), *args], capture_output=True, text=True, check=True, timeout=30
    ).stdout


def snapshot(root: Path) -> dict:
    """HEAD plus a content hash (or None for a deleted file) of every path git status lists."""
    raw = git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all")
    entries = raw.split("\0")
    paths: set[str] = set()
    i = 0
    while i < len(entries):
        entry = entries[i]
        if len(entry) > 3:
            paths.add(entry[3:])
            if entry[0] in "RC":  # a rename or copy is followed by its source path
                i += 1
                paths.add(entries[i])
        i += 1
    files = {}
    for rel in sorted(paths):
        p = root / rel
        files[rel] = hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None
    return {"head": git(root, "rev-parse", "HEAD").strip(), "files": files}


def state_file(root: Path, agent_id: str) -> Path:
    git_dir = Path(git(root, "rev-parse", "--absolute-git-dir").strip())
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", agent_id)
    return git_dir / "agent-audit" / f"{safe}.json"


def changed(before: dict, after: dict) -> list[str]:
    """Paths whose state differs. A path missing from one snapshot matched HEAD at that time, so
    appearing (edited) or disappearing (restored to HEAD) both count as a change by the agent."""
    paths = set(before["files"]) | set(after["files"])
    return sorted(p for p in paths if before["files"].get(p, "clean") != after["files"].get(p, "clean"))


def main() -> int:
    try:
        profile = sys.argv[1] if len(sys.argv) > 1 else ""
        payload = json.load(sys.stdin)
        agent_id = payload.get("agent_id") or "main"
        agent_type = payload.get("agent_type") or "agent"
        root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()).resolve()
        store = state_file(root, agent_id)
        event = payload.get("hook_event_name", "")

        if event == "PreToolUse":
            if not store.exists():
                store.parent.mkdir(parents=True, exist_ok=True)
                store.write_text(json.dumps(snapshot(root)))
            return 0

        if not store.exists():
            print(json.dumps({"systemMessage": f"agent-write-audit: {agent_type} ({agent_id}) finished with no baseline, so its changes could not be checked. Review `git status` before using its work."}))
            return 0
        before = json.loads(store.read_text())
        store.unlink()
        after = snapshot(root)
        problems = []
        if after["head"] != before["head"]:
            problems.append(f"HEAD moved from {before['head'][:10]} to {after['head'][:10]} (agents must not commit)")
        outside = [rel for rel in changed(before, after) if not allowed(rel, profile)]
        if outside:
            problems.append("changed files outside its allowed paths: " + ", ".join(outside))
        if problems:
            print(json.dumps({"systemMessage": f"agent-write-audit: {agent_type} ({agent_id}) " + "; ".join(problems) + ". Review these before using its report."}))
    except Exception as exc:  # a broken audit must be visible, not silent
        print(json.dumps({"systemMessage": f"agent-write-audit: the check failed ({exc.__class__.__name__}: {exc}); review `git status` by hand."}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
