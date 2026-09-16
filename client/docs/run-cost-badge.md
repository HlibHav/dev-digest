# Run Cost Badge: how it is wired

The spec is `specs/run-cost-badge.md`. This page covers where the pieces live
and where the data comes from.

## Component

`src/components/run-cost-badge/` sits in `src/components` because it is shared
across routes. Vendored primitives in `src/vendor/ui` stay untouched.

- `format.ts`: `formatCost(usd, 3 | 4)`, a pure function. All missing-data
  handling lives here, so callers pass the raw value, `undefined` included.
- `RunCostBadge.tsx`: `variant="compact"` renders only the cost.
  `variant="detailed"` renders `tokens · cost` and reads the
  `common.runCost.tokens` message through `useTranslations("common")`.
- `index.ts` re-exports both.

## Surfaces and their data

| Surface | File | Data hook → endpoint |
|---|---|---|
| PR list cell | `src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:63` | `usePulls` → `GET /repos/:id/pulls` (`PrMeta.cost_usd`) |
| Timeline row | `src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx:202` | `usePrRuns` → `GET /pulls/:id/runs` (`RunSummary`) |
| Accordion header | `.../ReviewRunAccordion/ReviewRunAccordion.tsx:110`, prop `costUsd` passed from `FindingsTab` | `usePrRuns`, matched on `run_id` |
| Trace COST tile | `.../RunTraceDrawer/_components/TraceBody/TraceBody.tsx:67` | `useRunTrace` → `GET /runs/:id/trace` (`stats.cost_usd`) |

The PR list grid gained a 7th track. `src/app/repos/[repoId]/pulls/constants.ts`
keeps `GRID` and `COLUMN_KEYS` in step: `"cost"` sits between `"status"` and
`"updated"`, so Updated stays last and right-aligned.

The timeline renders the badge only when the run has settled as `done`. Other
statuses keep the original single-line layout from the design's error row.

## Why `undefined` counts as missing

`GET /runs/:id/trace` returns the stored jsonb without a zod parse, so traces
recorded before the feature simply lack `stats.cost_usd`. `RunStats.cost_usd` is
therefore `.nullish()` in the shared contract, and `formatCost` treats
`undefined` like `null`.

## Contracts

The shared contracts are vendored twice. Change `server/src/vendor/shared`
first, mirror to `client/src/vendor/shared`, then check with
`diff -rq server/src/vendor/shared client/src/vendor/shared`.

## Tests

- `src/components/run-cost-badge/RunCostBadge.test.tsx`: the `formatCost` table
  and both variants.
- `PRRow.test.tsx`: `$0.014` and `—`. The fixture sets `updated_at`, so the only
  `—` on the row comes from cost.
- `RunHistory.test.tsx`: `9,119 tok · $0.0013`, a done run without cost, and a
  failed run without a cost line.
- `ReviewRunAccordion.test.tsx`: cost between score and date, `—` when missing.
- `RunTraceDrawer.test.tsx`: `$0.06`, and `—` for a legacy trace.
