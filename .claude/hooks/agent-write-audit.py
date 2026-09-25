#!/usr/bin/env python3
"""After-the-fact check of what a subagent changed in the repo.

Three hook calls per audited run, all running this script:

  1. PreToolUse, matcher "*", in the agent's frontmatter, with the agent's profile
     (`tests`, `docs` or `none`). On the agent's first tool call it records a baseline, keyed by
     `agent_id`: HEAD plus a hash of every file `git status` lists (tracked changes and untracked
     files; ignored files are skipped). The first tool call runs before any of the agent's own
     writes, so uncommitted work already in the tree, such as the implementer's, is in the
     baseline and not blamed on the agent.
  2. Stop in the agent's frontmatter (Claude Code turns it into SubagentStop), same profile.
     It recomputes the snapshot and writes the result — every changed file outside the
     profile's paths, and a moved HEAD — to `<git dir>/agent-audit/<agent_id>.result.json`.
  3. PostToolUse, matcher "Agent", registered in `.claude/settings.json`, with profile `report`.
     It runs in the main session after the Agent tool returns, reads the result for the
     returned `agentId` and hands any problem to the main session as `additionalContext`.
     A background call returns at launch (`status: async_launched`), before there is a result;
     then it leaves a `.pending` marker, and UserPromptSubmit (same script, same profile, also
     in settings.json) delivers the result when the completion notification arrives.

Step 3 exists because a SubagentStop hook's `systemMessage` lands in the subagent's own
transcript, never in the main session's (checked live on 2026-09-25, with the hook registered
both in frontmatter and in session settings). `additionalContext` from PostToolUse(Agent) does
reach the main session. When one of the audited agents returns with no result at all, step 3
says so: its frontmatter hooks did not run (for example, the session loaded the agent
definition before they were added), so its changes were not checked.

The path rules are the ones in agent-write-scope.py, loaded from that file. Nothing here blocks:
the agent's work is kept and the main session decides. It can't see writes outside the repo;
test and lint runs are kept inside the srt sandbox (.claude/sandbox/run-tests.sh) for that.

Stdin: the hook JSON. Stdout: nothing, or the PostToolUse `additionalContext` JSON. Exit: 0.
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
        return (
            rel not in scope.TEST_DENY
            and not any(rx.search(rel) for rx in scope.TEST_DENY_RX)
            and any(rx.match(rel) for rx in scope.TEST_ALLOW)
        )
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


AUDITED_AGENTS = {"test-writer", "doc-writer", "architecture-reviewer", "plan-verifier"}


def audit_dir(root: Path) -> Path:
    return Path(git(root, "rev-parse", "--absolute-git-dir").strip()) / "agent-audit"


def state_files(root: Path, agent_id: str) -> tuple[Path, Path]:
    """(baseline, result) for one agent run."""
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", agent_id)
    d = audit_dir(root)
    return d / f"{safe}.json", d / f"{safe}.result.json"


def write_result(result: Path, agent_type: str, problems: list[str]) -> None:
    result.parent.mkdir(parents=True, exist_ok=True)
    result.write_text(json.dumps({"agent_type": agent_type, "problems": problems}))


def changed(before: dict, after: dict) -> list[str]:
    """Paths whose state differs. A path missing from one snapshot matched HEAD at that time, so
    appearing (edited) or disappearing (restored to HEAD) both count as a change by the agent."""
    paths = set(before["files"]) | set(after["files"])
    return sorted(p for p in paths if before["files"].get(p, "clean") != after["files"].get(p, "clean"))


def in_subagent(profile: str, payload: dict, root: Path) -> None:
    """Steps 1 and 2: baseline on PreToolUse, result on SubagentStop. Prints nothing."""
    agent_id = payload.get("agent_id") or "main"
    agent_type = payload.get("agent_type") or "agent"
    baseline, result = state_files(root, agent_id)
    if payload.get("hook_event_name") == "PreToolUse":
        if not baseline.exists():
            baseline.parent.mkdir(parents=True, exist_ok=True)
            baseline.write_text(json.dumps(snapshot(root)))
        return
    try:
        if not baseline.exists():
            write_result(result, agent_type, ["finished with no baseline, so its changes could not be checked"])
            return
        before = json.loads(baseline.read_text())
        baseline.unlink()
        after = snapshot(root)
        problems = []
        if after["head"] != before["head"]:
            problems.append(f"HEAD moved from {before['head'][:10]} to {after['head'][:10]} (agents must not commit)")
        outside = [rel for rel in changed(before, after) if not allowed(rel, profile)]
        if outside:
            problems.append("changed files outside its allowed paths: " + ", ".join(outside))
        write_result(result, agent_type, problems)
    except Exception as exc:  # a broken audit must be visible to the main session
        write_result(result, agent_type, [f"the audit failed ({exc.__class__.__name__}: {exc})"])


def emit(event: str, lines: list[str]) -> None:
    if lines:
        print(json.dumps({"hookSpecificOutput": {"hookEventName": event, "additionalContext": "\n".join(lines)}}))


def deliver_background(root: Path) -> None:
    """UserPromptSubmit in the main session: report finished background runs, once each.

    A background Agent call returns at launch (`status: async_launched`), before the agent's
    SubagentStop has written a result, so step 3 leaves a `.pending` marker instead. The agent's
    completion notification reaches the main session as a new prompt, and this runs then.
    """
    d = audit_dir(root)
    lines = []
    for pending in sorted(d.glob("*.pending")) if d.is_dir() else []:
        result = pending.with_suffix(".result.json")
        if not result.exists():
            continue  # still running
        data = json.loads(result.read_text())
        problems = data.get("problems", [])
        if problems:
            lines.append(
                f"agent-write-audit: background {data.get('agent_type', 'agent')} ({pending.stem}) "
                + "; ".join(problems) + ". Check `git status` and `git diff` before using its report."
            )
        result.unlink()
        pending.unlink()
    emit("UserPromptSubmit", lines)


def in_main_session(payload: dict, root: Path) -> None:
    """Step 3: PostToolUse(Agent) in the main session. Prints `additionalContext` or nothing."""
    if payload.get("hook_event_name") == "UserPromptSubmit":
        deliver_background(root)
        return
    response = payload.get("tool_response") or {}
    agent_id = response.get("agentId") if isinstance(response, dict) else None
    agent_type = (response.get("agentType") if isinstance(response, dict) else None) or (
        payload.get("tool_input") or {}
    ).get("subagent_type", "")
    if agent_type not in AUDITED_AGENTS:
        return
    if isinstance(response, dict) and (response.get("isAsync") or response.get("status") == "async_launched"):
        if agent_id:
            pending = state_files(root, agent_id)[0].with_suffix(".pending")
            pending.parent.mkdir(parents=True, exist_ok=True)
            pending.write_text(agent_type)
        return
    problems: list[str]
    result = state_files(root, agent_id)[1] if agent_id else None
    if result is not None and result.exists():
        problems = json.loads(result.read_text()).get("problems", [])
        result.unlink()
    else:
        problems = [
            "its write audit did not run (its frontmatter hooks were not loaded, for example because "
            "the session loaded the agent definition before they were added, or the run crashed), so "
            "nothing checked what it changed"
        ]
    if problems:
        context = (
            f"agent-write-audit: {agent_type} ({agent_id or 'unknown id'}) " + "; ".join(problems)
            + ". Check `git status` and `git diff` before using its report."
        )
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": context}}))


def main() -> int:
    try:
        profile = sys.argv[1] if len(sys.argv) > 1 else ""
        payload = json.load(sys.stdin)
        root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()).resolve()
        if profile == "report":
            in_main_session(payload, root)
        elif profile in ("tests", "docs", "none"):
            in_subagent(profile, payload, root)
    except Exception as exc:  # never break the tool call; say what failed where it can be seen
        if len(sys.argv) > 1 and sys.argv[1] == "report":
            print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse",
                  "additionalContext": f"agent-write-audit: the report step failed ({exc.__class__.__name__}: {exc})."}}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
