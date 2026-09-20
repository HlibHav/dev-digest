#!/usr/bin/env python3
"""PreToolUse(Bash) gate in front of `gh pr create`.

Denies the PR until the pr-self-review skill has left a fresh verdict for this branch.
The skill runs in the normal session, where `.claude/skills/` is loaded natively, and writes
`~/.claude/state/pr-self-review/<repo>-<branch>.json`. This script never calls a model: it
reads that file, rechecks that it still describes the current working tree, and denies when
the verdict is missing, stale or `blocked`.

See ../decisions/2026-09-20-pr-self-review-enforcement.md for why the verdict is an artifact
rather than a nested `claude -p`: a nested run needs `--setting-sources ""` to avoid
re-triggering hooks, and that flag also stops it loading `.claude/skills/` — the very skills
this gate routes to.

Decision table:

  no `gh pr create` in the command ..... exit 0, no output, no git   (the 99% case)
  PR_SELF_REVIEW_OVERRIDE=1 in it ...... allow, logged as an override
  detached HEAD ........................ DENY (no branch to key a verdict on)
  no artifact / unreadable / not JSON .. DENY ("run the skill first")
  head_sha or dirty_hash moved ......... DENY as stale
  verdict == "blocked" ................. DENY with the findings
  verdict == "ready", keys match ....... exit 0, allow
  git or $HOME unusable ................ ALLOW, logged  (cannot judge, so do not block)

Fail open on infrastructure, fail closed on the absence of a verdict. Those are different
things: a broken `git` means the gate cannot form an opinion, while a missing artifact IS the
opinion — nobody reviewed this.

Matcher is the plain tool name `Bash`; all filtering happens here against `tool_input.command`.
Do not move the filter into an `if:`/`matcher` pattern — the `type: agent` hook with
`if: Bash(git push*)` was disabled on 2026-09-13 because the harness runs an `if`-filtered hook
anyway when it cannot parse the command, and 172 of its 198 blocks fired on commands that
contained no push at all.

Stdin: the PreToolUse hook JSON. Stdout: nothing, or the deny JSON. Exit code: always 0 —
a non-zero exit is a non-blocking error here and would never deny.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

STATE_DIR = Path(
    os.environ.get(
        "PR_SELF_REVIEW_STATE_DIR", str(Path.home() / ".claude" / "state" / "pr-self-review")
    )
)
LOG_FILE = STATE_DIR / "log.jsonl"

# `gh pr create` in COMMAND POSITION: start of the command, or after a shell separator,
# with optional VAR=value prefixes. Matching the bare phrase anywhere is the 2026-09-13 bug in
# another costume — observed live on 2026-09-20, when `prepush-review.py` spent $0.07 and 12.7s
# on a Sonnet review because the words "git push" appeared inside a heredoc it was writing.
# Here the same false positive would DENY an innocent command, so the phrase is matched only
# where a command can actually start, and only after heredoc bodies and quoted strings are
# stripped (`grep -rn 'gh pr create' docs/` must not trip the gate).
GH_PR_CREATE_RX = re.compile(
    r"(?:\A|[;&|(\n])\s*(?:\w+=\S*\s+)*gh\s+(?:--\S+\s+)*pr\s+create\b"
)
OVERRIDE_RX = re.compile(r"PR_SELF_REVIEW_OVERRIDE=1\b")
HEREDOC_RX = re.compile(r"<<-?\s*[\'\"]?(\w+)[\'\"]?")
QUOTED_RX = re.compile(r"'[^']*'|\"[^\"]*\"")


def strip_noise(command: str) -> str:
    """Drop heredoc bodies and quoted strings, so only real command text is matched.

    A conservative shell approximation, not a parser: it only ever removes text, so it can
    hide a real invocation (fails open on a weird command) but cannot invent one.
    """
    out, lines, i = [], command.split("\n"), 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        for m in HEREDOC_RX.finditer(line):
            delim = m.group(1)
            i += 1
            while i < len(lines) and lines[i].strip() != delim:
                i += 1  # body dropped
            break
        i += 1
    return QUOTED_RX.sub(" ", "\n".join(out))

# Must stay byte-for-byte identical to the pipeline in the skill's step 8, or every verdict
# reads as stale. Run through bash rather than reimplementing it in Python, so there is one
# definition and not two that can drift.
DIRTY_HASH_CMD = (
    "{ git diff HEAD; "
    "git ls-files --others --exclude-standard -z | sort -z | xargs -0 -I{} shasum -a 256 {}; } "
    "| shasum -a 256"
)


def log(**fields: object) -> None:
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as fh:
            stamp = datetime.now(timezone.utc).isoformat()  # noqa: UP017
            fh.write(json.dumps({"ts": stamp, **fields}, ensure_ascii=False) + "\n")
    except OSError as exc:  # logging must never break the gate
        print(f"pr-self-review: cannot write log: {exc}", file=sys.stderr)


def git(cwd: str, *args: str) -> tuple[int, str]:
    try:
        proc = subprocess.run(
            ["git", "-C", cwd, *args], capture_output=True, text=True, timeout=30, check=False
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 1, str(exc)
    return proc.returncode, proc.stdout.strip()


def dirty_hash(cwd: str) -> str | None:
    try:
        proc = subprocess.run(
            ["bash", "-c", DIRTY_HASH_CMD],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=cwd,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0:
        return None
    parts = proc.stdout.split()
    return parts[0] if parts else None


def deny(reason: str) -> None:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            },
            ensure_ascii=False,
        )
    )


def render_findings(findings: object) -> str:
    if not isinstance(findings, list) or not findings:
        return ""
    lines = []
    for f in findings:
        if not isinstance(f, dict):
            continue
        sev = str(f.get("severity", "?"))
        loc = str(f.get("path", "?"))
        if f.get("line"):
            loc = f"{loc}:{f['line']}"
        rule = str(f.get("rule", "")) or str(f.get("skill", ""))
        lines.append(f"  [{sev}] {loc} — {rule}")
    return "\n".join(lines)


def main() -> int:
    try:
        hook_input = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        return 0
    if hook_input.get("tool_name") != "Bash":
        return 0
    command = str((hook_input.get("tool_input") or {}).get("command", ""))
    if not GH_PR_CREATE_RX.search(strip_noise(command)):
        return 0  # the no-op path: no log, no git, no filesystem

    cwd = str(hook_input.get("cwd") or os.getcwd())

    if OVERRIDE_RX.search(command):
        log(decision="override", cwd=cwd, command=command[:300])
        return 0

    rc, common_dir = git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir")
    if rc != 0 or not common_dir:
        log(decision="fail-open", cwd=cwd, error="cannot resolve --git-common-dir")
        return 0
    repo = Path(common_dir).parent.name

    rc, branch = git(cwd, "branch", "--show-current")
    if rc != 0:
        log(decision="fail-open", cwd=cwd, repo=repo, error="git branch --show-current failed")
        return 0
    if not branch:
        log(decision="deny", cwd=cwd, repo=repo, reason="detached HEAD")
        deny(
            "pr-self-review: HEAD is detached, so there is no branch to key a review verdict on.\n"
            "Check out a branch and run the pr-self-review skill before opening a PR."
        )
        return 0

    artifact = STATE_DIR / f"{repo}-{branch.replace('/', '-')}.json"
    run_it = (
        f"Run the pr-self-review skill in pre-PR mode on `{branch}`, then open the PR.\n"
        f"(Deliberate bypass: prefix the command with PR_SELF_REVIEW_OVERRIDE=1)"
    )

    try:
        data = json.loads(artifact.read_text(encoding="utf-8"))
    except FileNotFoundError:
        log(decision="deny", cwd=cwd, repo=repo, branch=branch, reason="no verdict")
        deny(f"pr-self-review: no review verdict for `{branch}`.\n{run_it}")
        return 0
    except (OSError, json.JSONDecodeError) as exc:
        log(decision="deny", cwd=cwd, repo=repo, branch=branch, reason=f"unreadable: {exc}")
        deny(f"pr-self-review: the verdict for `{branch}` is unreadable ({exc}).\n{run_it}")
        return 0
    if not isinstance(data, dict):
        log(decision="deny", cwd=cwd, repo=repo, branch=branch, reason="artifact is not an object")
        deny(f"pr-self-review: the verdict for `{branch}` is malformed.\n{run_it}")
        return 0

    # Freshness: head_sha + dirty_hash only. base_sha is informational — origin/main moves on
    # any fetch, and keying staleness to it would deny PRs for code nobody touched.
    rc, head = git(cwd, "rev-parse", "HEAD")
    if rc != 0 or not head:
        log(decision="fail-open", cwd=cwd, repo=repo, branch=branch, error="cannot read HEAD")
        return 0
    dirty = dirty_hash(cwd)
    if dirty is None:
        log(decision="fail-open", cwd=cwd, repo=repo, branch=branch, error="dirty_hash failed")
        return 0

    if data.get("head_sha") != head:
        log(decision="deny", cwd=cwd, repo=repo, branch=branch, reason="stale: head moved")
        deny(
            f"pr-self-review: the verdict for `{branch}` was written for a different commit "
            f"({str(data.get('head_sha'))[:12]}, now {head[:12]}).\n{run_it}"
        )
        return 0
    if data.get("dirty_hash") != dirty:
        log(decision="deny", cwd=cwd, repo=repo, branch=branch, reason="stale: tree changed")
        deny(
            f"pr-self-review: uncommitted changes moved since the review of `{branch}`.\n{run_it}"
        )
        return 0

    # A pre-commit review only looked at uncommitted work, so its `ready` says nothing about the
    # commits the PR would carry. Only a pre-PR verdict may open a PR.
    mode = str(data.get("mode", ""))
    if mode != "pre-PR":
        log(decision="deny", cwd=cwd, repo=repo, branch=branch, reason=f"mode={mode or 'missing'}")
        deny(
            f"pr-self-review: the verdict for `{branch}` was produced in `{mode or 'unknown'}` "
            f"mode, which only covers uncommitted work.\n{run_it}"
        )
        return 0

    verdict = str(data.get("verdict", "")).lower()
    if verdict == "ready":
        log(decision="allow", cwd=cwd, repo=repo, branch=branch, head=head)
        return 0

    findings = render_findings(data.get("findings"))
    log(
        decision="deny",
        cwd=cwd,
        repo=repo,
        branch=branch,
        head=head,
        reason=f"verdict={verdict or 'missing'}",
    )
    deny(
        f"pr-self-review blocked this PR — verdict `{verdict or 'unknown'}` on `{branch}`."
        + (f"\n{findings}" if findings else "")
        + "\nFix the critical findings and re-run the pr-self-review skill."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
