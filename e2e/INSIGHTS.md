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

- **2026-09-16** — `scripts/e2e.sh` boots Postgres, API and web, then dies at the very end with `sh: tsx: command not found` (exit 127) when `e2e/node_modules` is missing: it auto-installs deps for `server`, `client` and `reviewer-core` but never for `e2e`, and a missing `agent-browser` only prints a warning. Before running it: `cd e2e && npm ci`, plus once `npm i -g agent-browser && agent-browser install`. Evidence: `scripts/e2e.sh:113`, `scripts/e2e.sh:51`, `scripts/e2e.sh:163`

## Session Notes

## Open Questions
