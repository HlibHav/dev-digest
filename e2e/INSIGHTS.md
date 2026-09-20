# e2e — insights

Findings that are true about this code but not visible in it. Maintained by the
`engineering-insights` skill: read before working here, add an entry after a
non-trivial task, skip routine changes. Append-only — never rewrite or delete an
entry; correct a stale one with a dated sub-bullet beneath it. Sections are
fixed — add to the one that fits.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

- **2026-09-20** — `find text … click` right after `wait --url` **races the fetch**: `wait --url` returns when the route changes, not when the data lands, so the click fails intermittently with `Command failed: agent-browser find text …`. Flows 04 and 05 failed this way on one run and passed on the next with no code change between them; flow 02 does the same journey and never flakes because it has a `wait --text` on the row first. Put a `wait --text` on the exact element before every `find … click` that depends on fetched data. Evidence: `e2e/specs/04-pr-findings.flow.json:6`, `e2e/specs/02-repo-pulls-detail.flow.json:6`

- **2026-09-16** — `scripts/e2e.sh` boots Postgres, API and web, then dies at the very end with `sh: tsx: command not found` (exit 127) when `e2e/node_modules` is missing: it auto-installs deps for `server`, `client` and `reviewer-core` but never for `e2e`, and a missing `agent-browser` only prints a warning. Before running it: `cd e2e && npm ci`, plus once `npm i -g agent-browser && agent-browser install`. Evidence: `scripts/e2e.sh:113`, `scripts/e2e.sh:51`, `scripts/e2e.sh:163`

## Session Notes

- **2026-09-20** — Added the Skills library flow and fixed the racing click in 04/05 → Recurring Errors & Fixes. Evidence: `e2e/specs/08-skills.flow.json:1`

## Open Questions
