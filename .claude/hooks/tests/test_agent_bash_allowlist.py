"""Regression tests for agent-bash-allowlist.py.

Run from the repo root:  python3 -m unittest discover -s .claude/hooks/tests -v

Each case pipes a PreToolUse payload into the hook the way Claude Code does and reads the
decision from stdout (deny JSON, or nothing for allow). The bypass cases come from the
2026-09-24 security review: the hook tokenised with shlex while the shell expanded braces,
ANSI-C quotes and variables afterwards, and `pkg_dir` accepted any directory named `server`.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HOOK = ROOT / ".claude" / "hooks" / "agent-bash-allowlist.py"


W = ".claude/sandbox/run-tests.sh "  # the sandbox wrapper every test or lint run must go through


def decide(command: str, profile: str = "architecture", unsandboxed: bool = False) -> str:
    tool_input: dict = {"command": command}
    if unsandboxed:
        tool_input["dangerouslyDisableSandbox"] = True
    payload = json.dumps({"tool_name": "Bash", "tool_input": tool_input})
    env = {**os.environ, "CLAUDE_PROJECT_DIR": str(ROOT)}
    out = subprocess.run(
        [sys.executable, str(HOOK), profile], input=payload, capture_output=True, text=True, env=env
    )
    assert out.returncode == 0, out.stderr
    if not out.stdout.strip():
        return "allow"
    return json.loads(out.stdout)["hookSpecificOutput"]["permissionDecision"]


def rewritten(command: str, profile: str = "architecture", unsandboxed: bool = False) -> dict | None:
    """The `updatedInput` the hook returns for an allowed command, or None when it passes as is."""
    tool_input: dict = {"command": command}
    if unsandboxed:
        tool_input["dangerouslyDisableSandbox"] = True
    payload = json.dumps({"tool_name": "Bash", "tool_input": tool_input})
    env = {**os.environ, "CLAUDE_PROJECT_DIR": str(ROOT)}
    out = subprocess.run(
        [sys.executable, str(HOOK), profile], input=payload, capture_output=True, text=True, env=env
    )
    assert out.returncode == 0, out.stderr
    if not out.stdout.strip():
        return None
    output = json.loads(out.stdout)["hookSpecificOutput"]
    assert output["permissionDecision"] == "allow", output
    return output["updatedInput"]


def deny_reason(command: str, profile: str = "architecture") -> str:
    """The reason the hook gives for denying `command`; fails if it allows it."""
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": command}})
    env = {**os.environ, "CLAUDE_PROJECT_DIR": str(ROOT)}
    out = subprocess.run(
        [sys.executable, str(HOOK), profile], input=payload, capture_output=True, text=True, env=env
    )
    assert out.returncode == 0, out.stderr
    output = json.loads(out.stdout)["hookSpecificOutput"]
    assert output["permissionDecision"] == "deny", output
    return output["permissionDecisionReason"]


class CompoundCommands(unittest.TestCase):
    """`;` and `&&` join allowed segments; the hook checks each and hands the shell `&&`.

    A plan-verifier run lost 6 of 41 turns to `;` denials (2026-09-26 token profile). Each
    segment is judged by the same allowlist, so a chain is never more than its parts.
    """

    def test_every_segment_is_checked(self) -> None:
        for cmd in [
            "git diff HEAD; rm -rf x",
            "git log -1; git diff --output=/tmp/x",
            "git log -1 && echo OK",
            "git log -1 || true",
            "git log -1 | head",
            "git log -1 &",
            "git log ;; git status",
            "; git log",
            "git log;",
            "git log -1; pnpm --dir server exec vitest run test/x.test.ts",  # unwrapped code run
        ]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd, "verify"), "deny")

    def test_semicolons_become_and(self) -> None:
        updated = rewritten("git diff --stat HEAD; git log -1", "verify")
        self.assertEqual(updated, {"command": "git diff --stat HEAD && git log -1"})

    def test_and_chain_passes_unchanged(self) -> None:
        self.assertIsNone(rewritten("git log -1 && git status --porcelain", "verify"))

    def test_unsandboxed_flag_survives_the_rewrite(self) -> None:
        lint = W + "pnpm --dir server lint:boundaries"
        route = W + "pnpm --dir server exec vitest run test/route-adapter-calls.test.ts"
        updated = rewritten(f"{lint}; {route}", "architecture", unsandboxed=True)
        self.assertEqual(updated, {"command": f"{lint} && {route}", "dangerouslyDisableSandbox": True})

    def test_unsandboxed_chain_with_a_read_only_segment_is_still_denied(self) -> None:
        self.assertEqual(decide("git log -1; git status", "verify", unsandboxed=True), "deny")


class BracketPathsAreQuoted(unittest.TestCase):
    """`[` and `]` are glob characters in zsh, so a Next.js route path like `[repoId]` must
    reach the shell single-quoted. The hook quotes it instead of refusing (one lost turn per
    review of the PR page, 2026-09-26)."""

    def test_bare_bracket_path_is_quoted(self) -> None:
        cmd = "git diff HEAD -- client/src/app/repos/[repoId]/page.tsx"
        updated = rewritten(cmd, "architecture")
        self.assertEqual(updated, {"command": "git diff HEAD -- 'client/src/app/repos/[repoId]/page.tsx'"})

    def test_already_quoted_passes_unchanged(self) -> None:
        self.assertIsNone(rewritten("git diff HEAD -- 'client/src/app/repos/[repoId]/page.tsx'"))

    def test_other_glob_characters_stay_denied(self) -> None:
        for cmd in ["git diff HEAD -- client/src/app/*.tsx", "git diff HEAD -- {a,b}", "git log ?"]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd), "deny")


class VerifyProfileReadOnlyExtras(unittest.TestCase):
    """`gh pr view --json`, `docker info` and a plain `diff` are read-only and `verify`-only.

    Without them plan-verifier could not read PR bodies (2 denials), could not tell whether
    Docker was up (1), and re-ran `diff -rq` in a shape the hook refused (1)."""

    def test_allowed_in_verify(self) -> None:
        for cmd in [
            "gh pr view 19 --json body",
            "gh pr view 19 --json body,title --jq .body",
            "gh pr view 19 --json body -q .body",
            "gh pr view https://github.com/HlibHav/dev-digest/pull/19 --json body",
            "gh pr view 19 --repo HlibHav/dev-digest --json body",
            "docker info",
            "diff -u server/INSIGHTS.md client/INSIGHTS.md",
            "diff -ruN server/src/vendor/shared client/src/vendor/shared",
            "diff server/AGENTS.md client/AGENTS.md",
        ]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd, "verify"), "allow")

    def test_denied_shapes(self) -> None:
        for cmd in [
            "gh pr view 19 --web",
            "gh pr view 19",  # no --json: opens the pager / human output, not needed
            "gh pr edit 19 --body x",
            "gh pr checks 19",
            "gh api repos/HlibHav/dev-digest",
            "gh pr view 19 --repo ../x --json body",
            "docker run alpine",
            "docker ps",
            "diff --output=x a b",
            "diff -u a ../b",
            "diff -u a server/clones/x",
            "diff -r / /tmp",  # absolute paths read outside the repo
            "diff -u /etc/hosts server/AGENTS.md",
        ]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd, "verify"), "deny")

    def test_other_profiles_do_not_get_them(self) -> None:
        for cmd in ["gh pr view 19 --json body", "docker info", "diff -u a b"]:
            for profile in ("architecture", "test"):
                with self.subTest(cmd=cmd, profile=profile):
                    self.assertEqual(decide(cmd, profile), "deny")


class ShellExpansionBypasses(unittest.TestCase):
    """The shell must see exactly the tokens the hook checked."""

    def test_denied(self) -> None:
        for cmd in [
            "git diff {--output=/tmp/x,HEAD}",
            "git log {--output=/tmp/zshenv,-1,--format=%B} HEAD",
            "git -C {.,-c,diff.external=sh} diff {--ext-diff,HEAD~1}",
            "git diff {--ext-diff,HEAD}",
            "git diff $'--output=/tmp/x' HEAD",
            "git diff ${OUT} HEAD",
            "git diff $HOME HEAD",
            'git diff "--output=/tmp/x" HEAD',
            "git diff ~/x",
            "git diff --output=/tmp/x",
            "git diff --outp=/tmp/x",  # git accepts unique abbreviations of long options
            "git log --out /tmp/x",
            "git diff --ext",
            "git diff --textc",
            "git diff HEAD --output /tmp/x",
            "git log --format=%B #comment",
            "git log *",
            "git diff \\--output=/tmp/x",
        ]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd), "deny")


class PackageDirectories(unittest.TestCase):
    """`--dir` / `--prefix` must name a package of this repo or of one of its worktrees."""

    def test_denied(self) -> None:
        for cmd, profile in [
            ("pnpm --dir server/clones/evil/server lint:boundaries", "architecture"),
            ("pnpm --dir /tmp/evil/server lint:boundaries", "architecture"),
            ("pnpm --dir /tmp/evil/server typecheck", "verify"),
            ("npm --prefix /tmp/evil/reviewer-core test", "verify"),
            ("npm --prefix server/clones/x/e2e run typecheck", "test"),
        ]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd, profile), "deny")

    def test_allowed(self) -> None:
        for cmd, profile in [
            (W + "pnpm --dir server lint:boundaries", "architecture"),
            (W + f"pnpm --dir {ROOT}/server lint:boundaries", "architecture"),
            ("pnpm --dir client typecheck", "verify"),
            (W + "npm --prefix reviewer-core test", "verify"),
        ]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd, profile), "allow")


class VitestArguments(unittest.TestCase):
    def test_denied(self) -> None:
        for cmd in [
            "pnpm --dir server exec vitest run -t --config=evil.ts",
            "pnpm --dir server exec vitest run {--config=evil.ts,test}",
            "pnpm --dir server exec vitest run --config=evil.ts",
            "pnpm --dir server exec vitest run ../../etc",
        ]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd, "verify"), "deny")

    def test_allowed(self) -> None:
        for cmd in [
            W + "pnpm --dir server exec vitest run --exclude '**/*.it.test.ts'",
            "pnpm --dir server exec vitest run .it.test",
            W + "pnpm --dir server exec vitest run test/agents-summary.it.test.ts -t 'returns 404'",
            W + "npm --prefix reviewer-core test -- test/core.test.ts",
        ]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd, "verify"), "allow")


class ReadOnlyGitStillWorks(unittest.TestCase):
    def test_allowed(self) -> None:
        for cmd in [
            "git diff --stat origin/main...HEAD",
            "git diff HEAD~1 HEAD",
            "git log --oneline -5",
            "git log --format=%H%x09%s -3",
            "git show HEAD:server/package.json",
            "git show HEAD^",
            "git status --porcelain",
            "git branch --show-current",
            f"git -C {ROOT} diff --stat",
            "diff -rq server/src/vendor/shared client/src/vendor/shared",
        ]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd), "allow")


class GitGrepSearch(unittest.TestCase):
    """Reviewers run without the Grep/Glob tools (L-10, L-11), so `git grep` is their search.
    `-O`/`--open-files-in-pager` runs a program; `--no-index` and `--no-exclude-standard` reach
    files outside the tracked set, gitignored secrets included."""

    def test_allowed_in_reviewer_profiles(self) -> None:
        for profile in ("architecture", "verify", "security"):
            for cmd in [
                "git grep -n 'lucide-react' -- client/src",
                "git grep -n -e x -- server/src",
                "git grep -l 'from lucide' -- client",
                "git grep -nI --count x",
                "git grep -n --untracked x -- client",
            ]:
                with self.subTest(profile=profile, cmd=cmd):
                    self.assertEqual(decide(cmd, profile), "allow")

    def test_denied(self) -> None:
        for cmd in [
            "git grep -n x | head",
            "git grep -O vim x",
            "git grep -Ovim x",
            "git grep -nOvim x",
            "git grep -iO x",
            "git grep --open-files-in-pager=vim x",
            "git grep --open x",
            "git grep --no-index x /etc",
            "git grep --no-ind x /etc",
            "git -c core.pager=sh grep -O x",
            # SR-1 (2026-10-06, verified on git 2.55): these read a gitignored server/.env
            "git grep --untracked --no-exclude-standard KEY -- server",
            "git grep --untracked --no-exclude KEY",
        ]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd), "deny")


class CodeRunsOnlyInTheSandbox(unittest.TestCase):
    """Anything that executes repo code (tests, the lint config) goes through run-tests.sh."""

    def test_unwrapped_code_runs_denied(self) -> None:
        for cmd, profile in [
            ("pnpm --dir server exec vitest run test/x.test.ts", "test"),
            ("pnpm --dir client test", "test"),
            ("npm --prefix reviewer-core test", "verify"),
            ("pnpm --dir server exec vitest run --exclude '**/*.it.test.ts'", "verify"),
            ("pnpm --dir server lint:boundaries", "architecture"),
            ("pnpm --dir server exec vitest run test/route-adapter-calls.test.ts", "architecture"),
            ("./.claude/sandbox/run-tests.sh pnpm --dir client test", "test"),
            (W + "git log", "test"),
            (W + "pnpm --dir server exec vitest run .it.test", "test"),
        ]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd, profile), "deny")

    def test_unwrapped_code_run_names_the_wrapped_command(self) -> None:
        # The refusal hands the agent the exact command to run instead, quoting kept.
        for cmd, profile in [
            ("pnpm --dir server exec vitest run test/foo.test.ts", "test"),
            ("pnpm --dir server exec vitest run --exclude '**/*.it.test.ts'", "verify"),
        ]:
            with self.subTest(cmd=cmd):
                self.assertIn(f"run it through the sandbox: {W}{cmd}", deny_reason(cmd, profile))

    def test_wrapped_and_non_executing_allowed(self) -> None:
        for cmd, profile in [
            (W + "pnpm --dir server exec vitest run test/x.test.ts", "test"),
            (W + "pnpm --dir client test", "test"),
            (W + "pnpm --dir server exec vitest run test/route-adapter-calls.test.ts", "architecture"),
            ("pnpm --dir server typecheck", "test"),
            ("pnpm --dir server exec vitest run .it.test", "verify"),
        ]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd, profile), "allow")

    def test_integration_suite_is_verify_only(self) -> None:
        self.assertEqual(decide("pnpm --dir server exec vitest run .it.test", "test"), "deny")

    def test_integration_suite_only_in_this_checkout(self) -> None:
        # It runs outside every sandbox, so only on code the main session has read: this checkout.
        self.assertEqual(decide(f"pnpm --dir {ROOT}/server exec vitest run .it.test", "verify"), "allow")
        other = next(
            (line[len("worktree "):] for line in subprocess.run(
                ["git", "-C", str(ROOT), "worktree", "list", "--porcelain"], capture_output=True, text=True
            ).stdout.splitlines() if line.startswith("worktree ") and Path(line[len("worktree "):]).resolve() != ROOT.resolve()),
            None,
        )
        if other is None:
            self.skipTest("no second worktree to test against")
        self.assertEqual(decide(f"pnpm --dir {other}/server exec vitest run .it.test", "verify", unsandboxed=True), "deny")


class McpServerPackage(unittest.TestCase):
    """Decision E: the sandbox and allowlist widen to `mcp-server/`, mirroring `server`/`client`."""

    def test_wrapped_allowed(self) -> None:
        for cmd, profile in [
            (W + "pnpm --dir mcp-server exec vitest run test/x.test.ts", "test"),
            (W + "pnpm --dir mcp-server test", "test"),
            (W + "pnpm --dir mcp-server exec vitest run test/x.test.ts", "verify"),
            (W + "pnpm --dir mcp-server test", "verify"),
        ]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd, profile), "allow")

    def test_typecheck_allowed_read_only(self) -> None:
        for profile in ("verify", "test"):
            with self.subTest(profile=profile):
                self.assertEqual(decide("pnpm --dir mcp-server typecheck", profile), "allow")

    def test_unwrapped_denied(self) -> None:
        for cmd, profile in [
            ("pnpm --dir mcp-server exec vitest run test/x.test.ts", "test"),
            ("pnpm --dir mcp-server test", "test"),
        ]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd, profile), "deny")

    def test_denied_for_security(self) -> None:
        for cmd in [
            W + "pnpm --dir mcp-server test",
            "pnpm --dir mcp-server typecheck",
        ]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd, "security"), "deny")

    def test_test_run_denied_for_architecture(self) -> None:
        # architecture may typecheck (like server/client) but not run mcp-server's test suite.
        self.assertEqual(decide(W + "pnpm --dir mcp-server test", "architecture"), "deny")


class SessionSandboxEscape(unittest.TestCase):
    """`dangerouslyDisableSandbox` is accepted only where srt or Docker needs it."""

    def test_denied(self) -> None:
        for cmd, profile in [
            ("git log", "architecture"),
            ("pnpm --dir server typecheck", "verify"),
            ("git diff HEAD", "test"),
        ]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd, profile, unsandboxed=True), "deny")

    def test_allowed(self) -> None:
        for cmd, profile in [
            (W + "pnpm --dir server exec vitest run test/x.test.ts", "test"),
            (W + "pnpm --dir server lint:boundaries", "architecture"),
            ("pnpm --dir server exec vitest run .it.test", "verify"),
        ]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd, profile, unsandboxed=True), "allow")


class SecurityProfile(unittest.TestCase):
    """security-reviewer reads the diff and never executes it: no test, lint or typecheck run,
    sandboxed or not, because the scripts and configs they load come from the diff itself."""

    def test_allowed(self) -> None:
        for cmd in [
            "git diff main...HEAD",
            "git diff --stat",
            "git log --oneline -5",
            "git show HEAD:server/src/app.ts",
            "diff -rq server/src/vendor/shared client/src/vendor/shared",
            "diff -u server/src/a.ts client/src/a.ts",
            "gh pr view 22 --json body,files",
        ]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd, "security"), "allow")

    def test_denied(self) -> None:
        for cmd in [
            W + "pnpm --dir server lint:boundaries",
            W + "pnpm --dir server exec vitest run test/route-adapter-calls.test.ts",
            W + "pnpm --dir client test",
            "pnpm --dir server typecheck",
            "npm --prefix reviewer-core run typecheck",
            "pnpm --dir server exec vitest run .it.test",
            "docker info",
            "cat server/.env",
            "git diff --output=/tmp/x",
        ]:
            with self.subTest(cmd=cmd):
                self.assertEqual(decide(cmd, "security"), "deny")

    def test_unsandboxed_code_run_denied(self) -> None:
        self.assertEqual(decide(W + "pnpm --dir server lint:boundaries", "security", unsandboxed=True), "deny")


class FailClosed(unittest.TestCase):
    def test_unreadable_input_denies(self) -> None:
        out = subprocess.run(
            [sys.executable, str(HOOK), "architecture"], input="{bad", capture_output=True, text=True
        )
        self.assertEqual(out.returncode, 0)
        self.assertIn('"deny"', out.stdout)


if __name__ == "__main__":
    unittest.main()
