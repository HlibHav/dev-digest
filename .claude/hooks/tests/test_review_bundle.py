"""Tests for .claude/scripts/review-bundle.sh, on a throwaway git repository.

Run from the repo root:  python3 -m unittest discover -s .claude/hooks/tests -v
"""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / ".claude" / "scripts" / "review-bundle.sh"


def git(repo: Path, *args: str) -> str:
    env = {
        **os.environ,
        "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t",
    }
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True, env=env).stdout


def write(repo: Path, rel: str, content: str) -> None:
    path = repo / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


class ReviewBundle(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name) / "repo"
        self.repo.mkdir()
        git(self.repo, "init", "-q", "-b", "main")
        write(self.repo, "server/src/a.ts", "export const a = 1;\n")
        write(self.repo, "server/pnpm-lock.yaml", "lockfileVersion: 1\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "base")
        git(self.repo, "checkout", "-qb", "feat")
        write(self.repo, "server/src/a.ts", "export const a = 2;\n")
        write(self.repo, "server/src/db/migrations/meta/0001_snapshot.json", '{"big": "' + "x" * 5000 + '"}\n')
        write(self.repo, "server/pnpm-lock.yaml", "lockfileVersion: 2\n")
        write(self.repo, "client/src/app/[id]/page.tsx", "export default function P() { return null; }\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "change")
        self.out = Path(self.tmp.name) / "bundle"

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def run_bundle(self, rng: str = "main...feat") -> subprocess.CompletedProcess[str]:
        return subprocess.run([str(SCRIPT), rng, str(self.out)], cwd=self.repo, capture_output=True, text=True)

    def test_generated_files_are_in_stat_but_not_in_hunks(self) -> None:
        result = self.run_bundle()
        self.assertEqual(result.returncode, 0, result.stderr)
        stat = (self.out / "stat.txt").read_text()
        self.assertIn("0001_snapshot.json", stat)
        self.assertIn("pnpm-lock.yaml", stat)
        patch = (self.out / "diff.patch").read_text()
        self.assertNotIn("0001_snapshot.json", patch)
        self.assertNotIn("pnpm-lock.yaml", patch)
        self.assertIn("export const a = 2;", patch)
        hunks = sorted(str(p.relative_to(self.out / "hunks")) for p in (self.out / "hunks").rglob("*.patch"))
        self.assertEqual(hunks, ["client/src/app/[id]/page.tsx.patch", "server/src/a.ts.patch"])

    def test_index_lists_every_path_and_marks_generated_ones(self) -> None:
        self.run_bundle()
        lines = [l for l in (self.out / "index.txt").read_text().splitlines() if not l.startswith("#")]
        self.assertEqual(
            lines,
            [
                "client/src/app/[id]/page.tsx +1 -0 %d hunks/client/src/app/[id]/page.tsx.patch"
                % (self.out / "hunks/client/src/app/[id]/page.tsx.patch").stat().st_size,
                "server/pnpm-lock.yaml excluded (generated)",
                "server/src/a.ts +1 -1 %d hunks/server/src/a.ts.patch"
                % (self.out / "hunks/server/src/a.ts.patch").stat().st_size,
                "server/src/db/migrations/meta/0001_snapshot.json excluded (generated)",
            ],
        )
        head = git(self.repo, "rev-parse", "feat").strip()
        self.assertIn(f"# head: {head}", (self.out / "index.txt").read_text())

    def test_rejects_a_bad_range_or_ref(self) -> None:
        self.assertEqual(self.run_bundle("main..feat").returncode, 2)
        self.assertEqual(self.run_bundle("main...nope").returncode, 2)
        self.assertFalse(self.out.exists())


if __name__ == "__main__":
    unittest.main()
