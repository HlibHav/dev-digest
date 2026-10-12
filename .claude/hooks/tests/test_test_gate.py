"""Regression tests for test-gate.py.

Run from the repo root:  python3 -m unittest discover -s .claude/hooks/tests -v

The matching cases pipe a PreToolUse payload into the hook the way Claude Code does. The gate
cases build a throwaway git repo with a fake `server/` package whose `pnpm` is a stub script on
PATH, so a check's pass or fail is decided by the test, not by the real suites.
"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HOOK = ROOT / ".claude" / "hooks" / "test-gate.py"

spec = importlib.util.spec_from_file_location("test_gate", HOOK)
gate = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(gate)


def run_hook(command: str, cwd: str, env: dict | None = None) -> str:
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": command}, "cwd": cwd})
    out = subprocess.run(
        [sys.executable, str(HOOK)],
        input=payload,
        capture_output=True,
        text=True,
        env={**os.environ, **(env or {})},
    )
    assert out.returncode == 0, out.stderr
    return out.stdout.strip()


class Matching(unittest.TestCase):
    def matches(self, cmd: str) -> bool:
        return bool(gate.GIT_COMMIT_RX.search(gate.strip_noise(cmd)))

    def test_commit_in_command_position(self) -> None:
        for cmd in (
            "git commit -m x",
            "cd /a/b && git commit -qm x",
            "git -C /a commit -F -",
            "FOO=1 git commit",
            "git add . && git commit --amend --no-edit",
        ):
            self.assertTrue(self.matches(cmd), cmd)

    def test_mentions_do_not_match(self) -> None:
        for cmd in (
            "grep -rn 'git commit' docs/",
            'echo "run git commit later"',
            "git log --oneline",
            "cat <<'EOF'\ngit commit -m inside a heredoc\nEOF",
            "git commit-tree abc",
        ):
            self.assertFalse(self.matches(cmd), cmd)

    def test_cd_and_dash_c_move_the_cwd(self) -> None:
        seg, before = gate.commit_segment("cd /tmp/x && git add -A && git commit -m 'a b'")
        self.assertEqual(gate.resolve_cwd("/base", before, seg), (str(Path("/tmp/x").resolve()), False))
        seg, before = gate.commit_segment("git -C /srv/repo commit -am msg")
        self.assertEqual(gate.resolve_cwd("/base", before, seg), ("/srv/repo", True))

    def test_amend_is_not_the_all_flag(self) -> None:
        seg, before = gate.commit_segment("git commit --amend -m 'fix -a typo'")
        self.assertFalse(gate.resolve_cwd("/base", before, seg)[1])


class Planning(unittest.TestCase):
    def labels(self, files: list[str]) -> list[str]:
        return [label for label, _, _ in gate.plan_checks(files)]

    def test_docs_only_needs_no_checks(self) -> None:
        self.assertEqual(self.labels(["docs/a.md", "specs/b.md", "README.md"]), [])

    def test_server_change(self) -> None:
        checks = gate.plan_checks(["server/src/modules/eval/scoring.ts"])
        self.assertEqual(
            [c[0] for c in checks], ["server typecheck", "server lint:boundaries", "server related tests"]
        )
        self.assertIn("src/modules/eval/scoring.ts", checks[-1][2])

    def test_reviewer_core_also_typechecks_server(self) -> None:
        self.assertIn("server typecheck (imports reviewer-core)", self.labels(["reviewer-core/src/grounding.ts"]))

    def test_migrations_and_vendor_are_not_code(self) -> None:
        self.assertEqual(self.labels(["server/src/db/migrations/0015_x.sql", "server/src/db/migrations/meta/_journal.json"]), [])

    def test_hook_change_runs_hook_tests(self) -> None:
        self.assertEqual(self.labels([".claude/hooks/test-gate.py"]), ["hook tests"])


class Gate(unittest.TestCase):
    """End to end against a throwaway repo with a stub `pnpm`."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name) / "repo"
        (self.repo / "server" / "node_modules").mkdir(parents=True)
        (self.repo / "server" / "src").mkdir()
        self.bin = Path(self.tmp.name) / "bin"
        self.bin.mkdir()
        self.state = Path(self.tmp.name) / "state"
        git = ["git", "-C", str(self.repo)]
        subprocess.run([*git, "init", "-q"], check=True)
        subprocess.run([*git, "config", "user.email", "t@t"], check=True)
        subprocess.run([*git, "config", "user.name", "t"], check=True)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def stub_pnpm(self, fail_on: str | None) -> None:
        script = self.bin / "pnpm"
        body = "#!/bin/sh\n"
        if fail_on:
            body += f'case "$*" in *{fail_on}*) echo "error TS2322: boom in {fail_on}"; exit 2;; esac\n'
        body += "exit 0\n"
        script.write_text(body)
        script.chmod(0o755)

    def stage(self, rel: str, text: str = "export const a = 1;\n") -> None:
        p = self.repo / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
        subprocess.run(["git", "-C", str(self.repo), "add", rel], check=True)

    def hook(self, command: str) -> str:
        env = {"PATH": f"{self.bin}:{os.environ['PATH']}", "TEST_GATE_STATE_DIR": str(self.state)}
        return run_hook(command, str(self.repo), env)

    def test_red_typecheck_denies(self) -> None:
        self.stub_pnpm(fail_on="typecheck")
        self.stage("server/src/a.ts")
        out = self.hook("git commit -m x")
        decision = json.loads(out)["hookSpecificOutput"]
        self.assertEqual(decision["permissionDecision"], "deny")
        self.assertIn("server typecheck", decision["permissionDecisionReason"])
        self.assertIn("boom in typecheck", decision["permissionDecisionReason"])

    def test_red_related_tests_deny(self) -> None:
        self.stub_pnpm(fail_on="related")
        self.stage("server/src/a.ts")
        out = self.hook("git commit -m x")
        self.assertIn("server related tests", json.loads(out)["hookSpecificOutput"]["permissionDecisionReason"])

    def test_green_allows(self) -> None:
        self.stub_pnpm(fail_on=None)
        self.stage("server/src/a.ts")
        self.assertEqual(self.hook("git commit -m x"), "")

    def test_docs_only_allows_without_running_anything(self) -> None:
        self.stub_pnpm(fail_on="typecheck")
        self.stage("docs/a.md", "# a\n")
        self.assertEqual(self.hook("git commit -m x"), "")

    def test_nothing_staged_allows(self) -> None:
        self.stub_pnpm(fail_on="typecheck")
        self.assertEqual(self.hook("git commit --amend --no-edit"), "")

    def test_all_flag_picks_up_unstaged_tracked_changes(self) -> None:
        self.stub_pnpm(fail_on="typecheck")
        self.stage("server/src/a.ts")
        subprocess.run(["git", "-C", str(self.repo), "commit", "-qm", "base"], check=True)
        (self.repo / "server/src/a.ts").write_text("export const a = 2;\n")
        self.assertEqual(self.hook("git commit -m x"), "")  # nothing staged
        self.assertIn("deny", self.hook("git commit -am x"))

    def test_git_add_in_the_same_command_is_checked(self) -> None:
        # PreToolUse runs before the command, so `git add X && git commit` reaches the gate with
        # nothing staged yet; the gate must check what the add is about to stage.
        self.stub_pnpm(fail_on="typecheck")
        self.stage("server/src/a.ts")
        subprocess.run(["git", "-C", str(self.repo), "commit", "-qm", "base"], check=True)
        (self.repo / "server/src/a.ts").write_text("export const a = 2;\n")
        self.assertIn("deny", self.hook("git add server/src/a.ts && git commit -m x"))

    def test_git_add_all_picks_up_untracked_files(self) -> None:
        self.stub_pnpm(fail_on="typecheck")
        (self.repo / "server/src/new.ts").write_text("export const b = 1;\n")
        self.assertIn("deny", self.hook("git add -A && git commit -m x"))
        self.assertIn("deny", self.hook("cd server && git add . && git commit -m x"))

    def test_git_add_of_other_paths_does_not_widen_the_check(self) -> None:
        self.stub_pnpm(fail_on="typecheck")
        (self.repo / "server/src/new.ts").write_text("export const b = 1;\n")
        (self.repo / "docs").mkdir()
        (self.repo / "docs/a.md").write_text("# a\n")
        self.assertEqual(self.hook("git add docs/a.md && git commit -m x"), "")

    def test_cd_into_the_repo_from_elsewhere(self) -> None:
        self.stub_pnpm(fail_on="typecheck")
        self.stage("server/src/a.ts")
        env = {"PATH": f"{self.bin}:{os.environ['PATH']}", "TEST_GATE_STATE_DIR": str(self.state)}
        out = run_hook(f"cd {self.repo} && git commit -m x", self.tmp.name, env)
        self.assertIn("deny", out)

    def test_override_allows_and_logs(self) -> None:
        self.stub_pnpm(fail_on="typecheck")
        self.stage("server/src/a.ts")
        self.assertEqual(self.hook("TEST_GATE_OVERRIDE=1 git commit -m x"), "")
        self.assertIn('"override"', (self.state / "log.jsonl").read_text())

    def test_missing_node_modules_fails_open(self) -> None:
        self.stub_pnpm(fail_on="typecheck")
        (self.repo / "server" / "node_modules").rmdir()
        self.stage("server/src/a.ts")
        self.assertEqual(self.hook("git commit -m x"), "")


if __name__ == "__main__":
    unittest.main()
