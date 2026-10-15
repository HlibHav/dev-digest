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
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HOOK = ROOT / ".claude" / "hooks" / "agent-write-scope.py"


def decide(profile: str, path: str, content: str = "it('a', () => { expect(1).toBe(1) })\n", root: Path = ROOT) -> str:
    payload = json.dumps({"tool_name": "Write", "cwd": str(root), "tool_input": {"file_path": path, "content": content}})
    env = {**os.environ, "CLAUDE_PROJECT_DIR": str(root)}
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
            "mcp-server/test/new-thing.test.ts",
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
            "mcp-server/src/x.ts",
            "mcp-server/test/support/x.ts",
            "mcp-server/test/support/in-process-client.ts",
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



class SpecsProfile(unittest.TestCase):
    def test_allowed(self) -> None:
        for path in [
            "specs/2026-10-02-blast-radius.md",
            "specs/README.md",
            "server/specs/2026-10-02-run-cost.md",
            "client/specs/README.md",
            "reviewer-core/specs/2026-10-02-x.md",
            "mcp-server/specs/2026-10-02-x.md",
        ]:
            with self.subTest(path=path):
                self.assertEqual(decide("specs", path, "# x"), "allow")

    def test_denied(self) -> None:
        for path in [
            "docs/sdd-cascade.md",
            "server/docs/x.md",
            "e2e/specs/01-app-boot.flow.json",
            "e2e/specs/x.md",
            "specs/designs/blast-radius/notes.md",
            "server/specs/sub/x.md",
            "specs/x.txt",
            "server/INSIGHTS.md",
            "README.md",
            "server/src/app.ts",
            ".claude/agents/spec-creator.md",
            "../outside/specs/x.md",
        ]:
            with self.subTest(path=path):
                self.assertEqual(decide("specs", path, "# x"), "deny")

class WorktreeTargets(unittest.TestCase):
    """CLAUDE_PROJECT_DIR is the main checkout; agents in a git worktree under
    .claude/worktrees/<name>/ write there. Such a path is checked relative to the worktree,
    but only when it is a registered worktree of this repo (2026-10-15: spec-creator was
    denied a spec path inside a worktree)."""

    def setUp(self) -> None:
        # resolve(): on macOS the temp dir is /var/..., a symlink to /private/var/...
        self.tmp = Path(tempfile.mkdtemp()).resolve()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.root = self.tmp / "repo"
        git = lambda *a, cwd=None: subprocess.run(["git", *a], cwd=cwd or self.root, check=True, capture_output=True)
        self.root.mkdir()
        git("init", "-q", "-b", "main")
        git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init")
        git("worktree", "add", "-q", "-b", "wt", ".claude/worktrees/wt")
        self.wt = ".claude/worktrees/wt"

    def fake_worktree(self, name: str, gitfile: str | None) -> str:
        d = self.root / ".claude" / "worktrees" / name
        d.mkdir(parents=True)
        if gitfile is not None:
            (d / ".git").write_text(gitfile)
        return f".claude/worktrees/{name}"

    def test_allowed_in_real_worktree(self) -> None:
        for profile, path in [
            ("specs", f"{self.wt}/specs/2026-10-15-agent-performance.md"),
            ("specs", f"{self.wt}/server/specs/2026-10-15-x.md"),
            ("tests", f"{self.wt}/server/test/x.test.ts"),
            ("tests", f"{self.wt}/client/src/app/x/_components/Foo/Foo.test.tsx"),
            ("docs", f"{self.wt}/server/docs/x.md"),
        ]:
            with self.subTest(profile=profile, path=path):
                self.assertEqual(decide(profile, path, "# x", root=self.root), "allow")
                self.assertEqual(decide(profile, str(self.root / path), "# x", root=self.root), "allow")

    def test_allow_lists_still_apply_in_worktree(self) -> None:
        for profile, path in [
            ("specs", f"{self.wt}/server/src/app.ts"),
            ("specs", f"{self.wt}/docs/sdd-cascade.md"),
            ("specs", f"{self.wt}/.claude/agents/spec-creator.md"),
            ("tests", f"{self.wt}/server/src/app.ts"),
            ("tests", f"{self.wt}/server/test/route-adapter-calls.test.ts"),
            ("tests", f"{self.wt}/server/test/helpers/pg.ts"),
            ("docs", f"{self.wt}/server/INSIGHTS.md"),
            ("docs", f"{self.wt}/README.md"),
            ("specs", f"{self.wt}/.git"),
            ("specs", f"{self.wt}/.claude/worktrees/wt/specs/x.md"),
        ]:
            with self.subTest(profile=profile, path=path):
                self.assertEqual(decide(profile, path, "# x", root=self.root), "deny")

    def test_not_a_registered_worktree(self) -> None:
        admin = self.root / ".git" / "worktrees" / "wt"
        cases = {
            "no-git": None,
            "gitdir-elsewhere": f"gitdir: {self.tmp / 'other' / '.git' / 'worktrees' / 'x'}\n",
            # points at wt's admin dir, whose back-pointer names .claude/worktrees/wt, not this dir
            "stolen-admin": f"gitdir: {admin}\n",
            "junk": "not a gitdir line\n",
        }
        for name, gitfile in cases.items():
            wt = self.fake_worktree(name, gitfile)
            with self.subTest(name=name):
                self.assertEqual(decide("specs", f"{wt}/specs/x.md", "# x", root=self.root), "deny")
        nested = self.root / ".claude" / "worktrees" / "clone"
        subprocess.run(["git", "init", "-q", str(nested)], check=True, capture_output=True)
        self.assertEqual(decide("specs", ".claude/worktrees/clone/specs/x.md", "# x", root=self.root), "deny")
        self.assertEqual(decide("specs", ".claude/worktrees/specs/x.md", "# x", root=self.root), "deny")

    def test_symlink_escapes_denied(self) -> None:
        outside = self.tmp / "outside"
        (outside / "specs").mkdir(parents=True)
        (self.root / self.wt / "specs").mkdir()
        (self.root / self.wt / "specs" / "evil.md").symlink_to(outside / "specs" / "evil.md")
        self.assertEqual(decide("specs", f"{self.wt}/specs/evil.md", "# x", root=self.root), "deny")
        (self.root / ".claude" / "worktrees" / "link").symlink_to(outside)
        self.assertEqual(decide("specs", ".claude/worktrees/link/specs/x.md", "# x", root=self.root), "deny")


if __name__ == "__main__":
    unittest.main()
