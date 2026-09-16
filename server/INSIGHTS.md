# server — insights

Findings that are true about this code but not visible in it. Maintained by the
`engineering-insights` skill: read before working here, add an entry after a
non-trivial task, skip routine changes. Append-only — never rewrite or delete an
entry; correct a stale one with a dated sub-bullet beneath it. Sections are
fixed — add to the one that fits.

## What Works

## What Doesn't Work

- **2026-09-16** — In `*.it.test.ts`, `expect(row.newColumn).not.toBeNull()` passes before the column exists: a drizzle row has no such key, so the value is `undefined`, not `null`, and the test goes green without the feature. Assert the type instead (`toEqual(expect.any(String))`) or a value (`toBeGreaterThan(0)`). Evidence: `server/test/reviews.it.test.ts:214`

## Codebase Patterns

- **2026-09-16** — `GET /runs/:id/trace` returns the `run_traces.trace` jsonb as stored, with no zod parse, so a field added to `RunStats` is simply absent on traces written before the change. Declare it `.nullish()` and make the client treat `undefined` like `null` (e.g. `stats.cost_usd` → "—"). Evidence: `server/src/modules/reviews/repository/run.repo.ts:190`, `server/src/vendor/shared/contracts/trace.ts:69`

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

- **2026-09-16** — Run Cost Badge (persist `agent_runs.cost_usd` + `batch_id`, surface cost on PR list / timeline / trace) → What Doesn't Work, Codebase Patterns; e2e → Recurring Errors & Fixes

## Open Questions
