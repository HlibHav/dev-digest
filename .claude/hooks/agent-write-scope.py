#!/usr/bin/env python3
"""PreToolUse(Write|Edit|MultiEdit|NotebookEdit) path scope for the writing subagents.

Wired only from agent frontmatter (`.claude/agents/*.md`), never from `settings.json`:

  hooks:
    PreToolUse:
      - matcher: "Write|Edit|MultiEdit|NotebookEdit"
        hooks:
          - type: command
            command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/agent-write-scope.py tests'

Profiles:

  tests .. test-writer: test files, server test helpers, e2e flow specs. Denies any edit that
           adds `.skip`/`.only`/`.todo` (or x-prefixed) or leaves an existing file with fewer
           `it(`/`test(`/`expect(` calls than before — a weakened test is reported, not written.
  docs ... doc-writer: package `docs/` and `specs/`, root `docs/` (minus product prompts and
           house-rules skills). Never INSIGHTS.md, CLAUDE.md, AGENTS.md or the root README.

The file path is resolved (symlinks included) against `$CLAUDE_PROJECT_DIR`, the worktree
root; anything outside it is denied. The script fails closed: unreadable input denies.

Stdin: the PreToolUse hook JSON. Stdout: nothing (allow) or the deny JSON. Exit code: always 0.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

TEST_ALLOW = (
    re.compile(r"^(?:server/(?:src|test)|reviewer-core/(?:src|test)|client/src)/.+\.test\.tsx?$"),
    re.compile(r"^server/test/helpers/[^/]+\.ts$"),
    re.compile(r"^e2e/specs/\d{2}-[a-z0-9-]+\.flow\.json$"),
)
TEST_DENY = {
    "server/test/route-adapter-calls.test.ts",  # holds GRANDFATHERED; owned by architecture review
    "client/src/test/setup.ts",
}

DOCS_ALLOW = (
    re.compile(r"^(?:server|client|reviewer-core|e2e)/docs/.+\.md$"),
    re.compile(r"^(?:server|client|reviewer-core)/specs/[^/]+\.md$"),
    re.compile(r"^docs/.+\.md$"),
)
DOCS_DENY = (
    re.compile(r"^docs/skills/"),  # house-rules skills, mirrored into the product DB
    re.compile(r"^docs/agent-prompts/[^/]+-reviewer\.md$"),  # product prompts, mirrored into the DB
    re.compile(r"(?:^|/)(?:INSIGHTS|CLAUDE|AGENTS)\.md$"),
    re.compile(r"^README\.md$"),
)

SKIP_RX = re.compile(r"\b(?:it|test|describe|suite)\s*\.\s*(?:skip|only|todo|skipIf|runIf)\b|\bx(?:it|describe|test)\s*\(")
TEST_CALL_RX = re.compile(r"\b(?:it|test)\s*(?:\.each\s*\([^)]*\)\s*)?\(")
EXPECT_RX = re.compile(r"\bexpect\s*[.(]")


def deny(reason: str) -> None:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": f"agent-write-scope: {reason}",
                }
            }
        )
    )


def resulting_text(tool: str, tool_input: dict, old: str) -> str:
    """The file content after the edit, as far as the hook can reconstruct it."""
    if tool == "Write":
        return str(tool_input.get("content", ""))
    edits = tool_input.get("edits") if tool == "MultiEdit" else [tool_input]
    text = old
    for e in edits or []:
        old_s, new_s = str(e.get("old_string", "")), str(e.get("new_string", ""))
        text = text.replace(old_s, new_s) if e.get("replace_all") else text.replace(old_s, new_s, 1)
    return text


def check_tests(rel: str, tool: str, tool_input: dict, target: Path) -> str | None:
    if rel in TEST_DENY:
        return f"{rel} is not writable by test-writer"
    if not any(rx.match(rel) for rx in TEST_ALLOW):
        return (
            f"{rel} is not a test path. test-writer may write *.test.ts(x) under server/, "
            "reviewer-core/ and client/src, server/test/helpers/*.ts and e2e/specs/NN-name.flow.json. "
            "Report missing doubles or production changes as blocked instead"
        )
    old = target.read_text(encoding="utf-8") if target.is_file() else ""
    new = resulting_text(tool, tool_input, old)
    if len(SKIP_RX.findall(new)) > len(SKIP_RX.findall(old)):
        return "adding .skip/.only/.todo (or xit/xdescribe) is not allowed"
    if old:
        for name, rx in (("it()/test()", TEST_CALL_RX), ("expect()", EXPECT_RX)):
            if len(rx.findall(new)) < len(rx.findall(old)):
                return (
                    f"this edit removes {name} calls from an existing test file; weakening or "
                    "deleting tests is out of scope — report the test under 'Suspect tests' instead"
                )
    return None


def check_docs(rel: str) -> str | None:
    if any(rx.search(rel) for rx in DOCS_DENY):
        return f"{rel} is not writable by doc-writer (INSIGHTS/CLAUDE/AGENTS, root README, product prompts and skills are owned elsewhere)"
    if not any(rx.match(rel) for rx in DOCS_ALLOW):
        return f"{rel} is not a docs path. doc-writer may write <pkg>/docs/**/*.md, <pkg>/specs/*.md and docs/**/*.md"
    return None


def main() -> int:
    profile = sys.argv[1] if len(sys.argv) > 1 else ""
    if profile not in ("tests", "docs"):
        deny(f"unknown profile {profile!r}")
        return 0
    try:
        payload = json.load(sys.stdin)
        tool = payload["tool_name"]
        tool_input = payload["tool_input"]
        if tool == "NotebookEdit":
            deny("notebooks are out of scope")
            return 0
        raw = tool_input["file_path"]
        root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or payload["cwd"]).resolve()
        target = Path(raw if os.path.isabs(raw) else root / raw).resolve()
        rel = target.relative_to(root).as_posix()
    except ValueError:
        deny("the file is outside the project directory")
        return 0
    except Exception as exc:  # any unreadable input must deny
        deny(f"hook input unreadable ({exc.__class__.__name__})")
        return 0
    try:
        reason = check_tests(rel, tool, tool_input, target) if profile == "tests" else check_docs(rel)
    except Exception as exc:  # e.g. an unreadable existing file
        reason = f"could not check the edit ({exc.__class__.__name__})"
    if reason:
        deny(reason)
    return 0


if __name__ == "__main__":
    sys.exit(main())
