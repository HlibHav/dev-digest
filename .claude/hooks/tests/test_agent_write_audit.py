"""Tests for agent-write-audit.py: the after-the-fact check on what a subagent changed.

Run from the repo root:  python3 -m unittest discover -s .claude/hooks/tests -v

Each test builds a throwaway git repo, takes the baseline the way the PreToolUse hook does on
the agent's first tool call, changes files, then fires the SubagentStop call and reads the
`systemMessage` the main session would see.
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


def fire(repo: Path, profile: str, event: str, agent_id: str = "agent-1") -> dict:
    payload = {"hook_event_name": event, "agent_id": agent_id, "agent_type": "test-writer", "cwd": str(repo)}
    if event == "PreToolUse":
        payload |= {"tool_name": "Read", "tool_input": {"file_path": "x"}}
    env = {**os.environ, "CLAUDE_PROJECT_DIR": str(repo)}
    out = subprocess.run(
        [sys.executable, str(HOOK), profile], input=json.dumps(payload), capture_output=True, text=True, env=env
    )
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout) if out.stdout.strip() else {}


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
        self.assertEqual(fire(self.repo, "tests", "PreToolUse"), {})
        (self.repo / "server/test/new.test.ts").write_text("it('a', () => {})\n")
        (self.repo / "server/src/app.ts").write_text("export const pwned = 1\n")
        msg = fire(self.repo, "tests", "SubagentStop").get("systemMessage", "")
        self.assertIn("server/src/app.ts", msg)
        self.assertNotIn("new.test.ts", msg)
        self.assertNotIn("wip.ts", msg)  # pre-existing and untouched

    def test_touching_preexisting_dirty_file_is_reported(self) -> None:
        fire(self.repo, "tests", "PreToolUse")
        (self.repo / "server/src/wip.ts").write_text("rewritten by the agent\n")
        self.assertIn("server/src/wip.ts", fire(self.repo, "tests", "SubagentStop").get("systemMessage", ""))

    def test_clean_run_is_silent(self) -> None:
        fire(self.repo, "tests", "PreToolUse")
        (self.repo / "server/test/new.test.ts").write_text("it('a', () => {})\n")
        self.assertEqual(fire(self.repo, "tests", "SubagentStop"), {})

    def test_read_only_profile_reports_any_change(self) -> None:
        fire(self.repo, "none", "PreToolUse")
        (self.repo / "server/test/new.test.ts").write_text("x\n")
        self.assertIn("server/test/new.test.ts", fire(self.repo, "none", "SubagentStop").get("systemMessage", ""))

    def test_deleted_file_is_reported(self) -> None:
        fire(self.repo, "tests", "PreToolUse")
        (self.repo / "server/src/app.ts").unlink()
        self.assertIn("server/src/app.ts", fire(self.repo, "tests", "SubagentStop").get("systemMessage", ""))

    def test_head_move_is_reported(self) -> None:
        fire(self.repo, "tests", "PreToolUse")
        (self.repo / "server/test/new.test.ts").write_text("x\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "sneaky")
        self.assertIn("HEAD", fire(self.repo, "tests", "SubagentStop").get("systemMessage", ""))

    def test_baseline_is_per_agent(self) -> None:
        fire(self.repo, "tests", "PreToolUse", agent_id="a")
        (self.repo / "server/src/app.ts").write_text("changed between agents\n")
        fire(self.repo, "tests", "PreToolUse", agent_id="b")  # b's baseline already has the change
        self.assertEqual(fire(self.repo, "tests", "SubagentStop", agent_id="b"), {})
        self.assertIn("server/src/app.ts", fire(self.repo, "tests", "SubagentStop", agent_id="a").get("systemMessage", ""))

    def test_missing_baseline_is_reported(self) -> None:
        msg = fire(self.repo, "tests", "SubagentStop", agent_id="never-started").get("systemMessage", "")
        self.assertIn("no baseline", msg)


if __name__ == "__main__":
    unittest.main()
