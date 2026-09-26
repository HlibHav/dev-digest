"""Tests for agent-write-audit.py: the after-the-fact check on what a subagent changed.

Run from the repo root:  python3 -m unittest discover -s .claude/hooks/tests -v

Each test builds a throwaway git repo and replays the three hook calls of one audited run:
  1. PreToolUse inside the subagent (its first tool call) records the baseline;
  2. SubagentStop inside the subagent writes the result next to it;
  3. PostToolUse(Agent) in the main session reads the result and returns `additionalContext`,
     the only one of the three outputs the main session's model actually sees (checked live on
     2026-09-25: a SubagentStop `systemMessage` lands in the subagent's own transcript).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parents[1] / "agent-write-audit.py"


def git(repo: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True)


def run_hook(repo: Path, profile: str, payload: dict) -> str:
    env = {**os.environ, "CLAUDE_PROJECT_DIR": str(repo)}
    out = subprocess.run(
        [sys.executable, str(HOOK), profile], input=json.dumps(payload), capture_output=True, text=True, env=env
    )
    assert out.returncode == 0, out.stderr
    return out.stdout.strip()


def start(repo: Path, profile: str, agent_id: str = "agent-1", agent_type: str = "test-writer") -> None:
    payload = {"hook_event_name": "PreToolUse", "agent_id": agent_id, "agent_type": agent_type,
               "cwd": str(repo), "tool_name": "Read", "tool_input": {"file_path": "x"}}
    assert run_hook(repo, profile, payload) == ""


def stop(repo: Path, profile: str, agent_id: str = "agent-1", agent_type: str = "test-writer") -> None:
    payload = {"hook_event_name": "SubagentStop", "agent_id": agent_id, "agent_type": agent_type, "cwd": str(repo)}
    assert run_hook(repo, profile, payload) == ""  # nothing here would reach the main session


def report(repo: Path, agent_id: str = "agent-1", agent_type: str = "test-writer") -> str:
    """What the main session sees after the Agent tool returns ('' when there is nothing to say)."""
    payload = {"hook_event_name": "PostToolUse", "tool_name": "Agent", "cwd": str(repo),
               "tool_input": {"subagent_type": agent_type}, "tool_response": {"agentId": agent_id, "agentType": agent_type}}
    out = run_hook(repo, "report", payload)
    return json.loads(out)["hookSpecificOutput"]["additionalContext"] if out else ""


def launch_background(repo: Path, agent_id: str = "agent-1", agent_type: str = "test-writer") -> str:
    """PostToolUse(Agent) for a background run: the tool returns at launch (status async_launched)."""
    payload = {"hook_event_name": "PostToolUse", "tool_name": "Agent", "cwd": str(repo),
               "tool_input": {"subagent_type": agent_type, "run_in_background": True},
               "tool_response": {"isAsync": True, "status": "async_launched", "agentId": agent_id}}
    out = run_hook(repo, "report", payload)
    return json.loads(out)["hookSpecificOutput"]["additionalContext"] if out else ""


def next_prompt(repo: Path) -> str:
    """UserPromptSubmit in the main session, e.g. when the background agent's notification arrives."""
    out = run_hook(repo, "report", {"hook_event_name": "UserPromptSubmit", "cwd": str(repo), "prompt": "x"})
    if not out:
        return ""
    body = json.loads(out)["hookSpecificOutput"]
    assert body["hookEventName"] == "UserPromptSubmit"
    return body["additionalContext"]


def finish(repo: Path, profile: str, agent_id: str = "agent-1", agent_type: str = "test-writer") -> str:
    stop(repo, profile, agent_id, agent_type)
    return report(repo, agent_id, agent_type)


class AuditTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name)
        git(self.repo, "init", "-q")
        git(self.repo, "config", "user.email", "t@t")
        git(self.repo, "config", "user.name", "t")
        (self.repo / "server/src").mkdir(parents=True)
        (self.repo / "server/test").mkdir(parents=True)
        (self.repo / "server/src/app.ts").write_text("export {}\n")
        (self.repo / "server/src/wip.ts").write_text("committed\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "init")
        # Uncommitted work that existed before the agent started (for example the implementer's).
        (self.repo / "server/src/wip.ts").write_text("implementer's uncommitted change\n")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_change_outside_test_paths_is_reported(self) -> None:
        start(self.repo, "tests")
        (self.repo / "server/test/new.test.ts").write_text("it('a', () => {})\n")
        (self.repo / "server/src/app.ts").write_text("export const pwned = 1\n")
        msg = finish(self.repo, "tests")
        self.assertIn("server/src/app.ts", msg)
        self.assertNotIn("new.test.ts", msg)
        self.assertNotIn("wip.ts", msg)  # pre-existing and untouched

    def test_touching_preexisting_dirty_file_is_reported(self) -> None:
        start(self.repo, "tests")
        (self.repo / "server/src/wip.ts").write_text("rewritten by the agent\n")
        self.assertIn("server/src/wip.ts", finish(self.repo, "tests"))

    def test_clean_run_is_silent(self) -> None:
        start(self.repo, "tests")
        (self.repo / "server/test/new.test.ts").write_text("it('a', () => {})\n")
        self.assertEqual(finish(self.repo, "tests"), "")

    def test_read_only_profile_reports_any_change(self) -> None:
        start(self.repo, "none", agent_type="plan-verifier")
        (self.repo / "server/test/new.test.ts").write_text("x\n")
        self.assertIn("server/test/new.test.ts", finish(self.repo, "none", agent_type="plan-verifier"))

    def test_deleted_file_is_reported(self) -> None:
        start(self.repo, "tests")
        (self.repo / "server/src/app.ts").unlink()
        self.assertIn("server/src/app.ts", finish(self.repo, "tests"))

    def test_head_move_is_reported(self) -> None:
        start(self.repo, "tests")
        (self.repo / "server/test/new.test.ts").write_text("x\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "sneaky")
        self.assertIn("HEAD", finish(self.repo, "tests"))

    def test_baseline_is_per_agent(self) -> None:
        start(self.repo, "tests", agent_id="a")
        (self.repo / "server/src/app.ts").write_text("changed between agents\n")
        start(self.repo, "tests", agent_id="b")  # b's baseline already has the change
        self.assertEqual(finish(self.repo, "tests", agent_id="b"), "")
        self.assertIn("server/src/app.ts", finish(self.repo, "tests", agent_id="a"))

    def test_stop_without_baseline_is_reported(self) -> None:
        self.assertIn("no baseline", finish(self.repo, "tests", agent_id="never-started"))

    def test_audited_agent_without_any_audit_is_reported(self) -> None:
        # Frontmatter hooks never ran, e.g. the session cached the agent definition before they existed.
        self.assertIn("did not run", report(self.repo, agent_id="x", agent_type="test-writer"))

    def test_new_read_only_agents_are_audited(self) -> None:
        # security-reviewer and brainstorm wire this hook; the report must read their audit too.
        for agent in ("security-reviewer", "brainstorm"):
            with self.subTest(agent=agent):
                self.assertIn("did not run", report(self.repo, agent_id=f"x-{agent}", agent_type=agent))

    def test_other_agents_are_ignored(self) -> None:
        self.assertEqual(report(self.repo, agent_id="x", agent_type="Explore"), "")

    def test_background_run_is_reported_on_the_next_prompt(self) -> None:
        start(self.repo, "tests")
        self.assertEqual(launch_background(self.repo), "")  # no "did not run" at launch
        (self.repo / "server/src/app.ts").write_text("changed by a background agent\n")
        self.assertEqual(next_prompt(self.repo), "")  # still running: nothing to say yet
        stop(self.repo, "tests")
        self.assertIn("server/src/app.ts", next_prompt(self.repo))
        self.assertEqual(next_prompt(self.repo), "")  # delivered once

    def test_clean_background_run_is_silent(self) -> None:
        start(self.repo, "tests")
        launch_background(self.repo)
        stop(self.repo, "tests")
        self.assertEqual(next_prompt(self.repo), "")

    def test_result_is_consumed_once(self) -> None:
        start(self.repo, "tests")
        (self.repo / "server/src/app.ts").write_text("x\n")
        self.assertIn("server/src/app.ts", finish(self.repo, "tests"))
        self.assertIn("did not run", report(self.repo))  # a second report has nothing to read


if __name__ == "__main__":
    unittest.main()
