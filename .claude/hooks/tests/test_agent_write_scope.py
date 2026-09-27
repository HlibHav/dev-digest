"""Regression tests for agent-write-scope.py.

Run from the repo root:  python3 -m unittest discover -s .claude/hooks/tests -v

The `tests` profile decides what test-writer may write. Files it writes can end up executed
outside the srt sandbox by plan-verifier's Docker integration suite (`vitest run .it.test`,
a substring filter), so the profile must not let it write code that suite imports or picks up
without the main session noticing (2026-09-25 security review).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HOOK = ROOT / ".claude" / "hooks" / "agent-write-scope.py"


def decide(profile: str, path: str, content: str = "it('a', () => { expect(1).toBe(1) })\n") -> str:
    payload = json.dumps({"tool_name": "Write", "cwd": str(ROOT), "tool_input": {"file_path": path, "content": content}})
    env = {**os.environ, "CLAUDE_PROJECT_DIR": str(ROOT)}
    out = subprocess.run([sys.executable, str(HOOK), profile], input=payload, capture_output=True, text=True, env=env)
    assert out.returncode == 0, out.stderr
    return "allow" if not out.stdout.strip() else json.loads(out.stdout)["hookSpecificOutput"]["permissionDecision"]


class TestsProfile(unittest.TestCase):
    def test_allowed(self) -> None:
        for path in [
            "server/test/new-thing.test.ts",
            "server/test/new-thing.it.test.ts",
            "server/src/modules/x/helpers.test.ts",
            "client/src/app/x/_components/Foo/Foo.test.tsx",
            "reviewer-core/test/core.test.ts",
            "e2e/specs/10-agent-summary.flow.json",
        ]:
            with self.subTest(path=path):
                self.assertEqual(decide("tests", path), "allow")

    def test_denied(self) -> None:
        for path in [
            "server/src/app.ts",
            "server/test/helpers/pg.ts",  # imported by the Docker suite, which runs unsandboxed
            "server/test/helpers/new-helper.ts",
            "server/test/a.it.test/b.test.ts",  # matched by the `.it.test` substring filter
            "server/test/x.it.test.y.test.ts",
            "server/test/route-adapter-calls.test.ts",
            "client/src/test/setup.ts",
            "/etc/passwd",
            "server/test/../src/app.ts",
        ]:
            with self.subTest(path=path):
                self.assertEqual(decide("tests", path), "deny")

    def test_skips(self) -> None:
        guard = "const d = hasDocker ? describe : describe.skip;\nd('x', () => { it('a', () => { expect(1).toBe(1) }) })\n"
        self.assertEqual(decide("tests", "server/test/x.it.test.ts", guard), "allow")
        for content in ["it.skip('a', () => {})", "describe[String('sk' + 'ip')]('x', () => {})", "xit('a', () => {})"]:
            with self.subTest(content=content):
                self.assertEqual(decide("tests", "server/test/x.test.ts", content), "deny")


class DocsProfile(unittest.TestCase):
    def test_paths(self) -> None:
        self.assertEqual(decide("docs", "server/docs/conventions-scan.md", "# x"), "allow")
        for path in ["server/INSIGHTS.md", "README.md", "docs/skills/x.md", "docs/agent-prompts/general-reviewer.md", "server/src/app.ts"]:
            with self.subTest(path=path):
                self.assertEqual(decide("docs", path, "# x"), "deny")


if __name__ == "__main__":
    unittest.main()
