# Fix4 client report: run tracking
Status: done. Mode: fix. No commit. Only client/ touched.

Red run (before code): 8 failed | 28 passed across the 3 test files (eval.test.tsx 4, eval-tracked-suite.test.tsx 3, CaseEditor.test.tsx 1).
Green run: `pnpm typecheck` exit 0; `pnpm test` (full): Test Files 80 passed, Tests 526 passed.

| id | test (red then green) | files |
|---|---|---|
| CR-29 | eval.test.tsx "CR-29/CR-34 a suite poll that fails 3 times in a row stalls..." (red: no `stalled` on useSuiteRun); "CR-29 two failed polls ... do not stall a suite run"; "CR-29 each failed poll is one attempt" (case run: 1 call in first 1000 ms, 2 by 1600 ms) | hooks/eval.ts |
| CR-28 | eval.test.tsx "CR-28 a 404 after earlier running responses stops polling and reports gone"; eval-tracked-suite.test.tsx decideSuite "CR-28 a failed poll settles the suite even when its last data said running" and hook "CR-28 a 404 after running responses settles the suite and stops polling" | hooks/eval.ts, hooks/eval-tracked-suite.ts |
| CR-32 | eval-tracked-suite.test.tsx "CR-32 a transient failure with no data keeps showing the history row's progress and keeps polling; a stall shows an error and recovers" (tracking a new id clears the error); AgentEvalDashboardView.test.tsx "CR-21/CR-32 ... stalled ... role=alert ... Run eval usable" | hooks/eval-tracked-suite.ts, EvalsTab.tsx, AgentEvalDashboardView.tsx (+styles.ts) |
| CR-30 | CaseEditor.test.tsx "CR-30 a run that is gone (404) shows an error instead of Running forever" (red: no alert) | CaseEditor.tsx |
| CR-34 | covered by the tests above, which read `{ query, gone, stalled }`; the old tests were moved to that shape | hooks/eval.ts, CaseRow.tsx, CaseEditor.tsx, hooks/eval-tracked-suite.ts |

## What changed
- hooks/eval.ts: one private `usePolledRun` owns polling and failure state for useCaseRun and useSuiteRun. `retry: false`, so one queryFn call is one poll; failures counted in the queryFn, reset on success; polling stops on terminal status, 404, or 3 failed polls. Both hooks return `{ query, gone, stalled }` (query un-spread, type `PolledRun<T>`). It reads `query.errorUpdateCount` to subscribe to every failure: an error equal to the previous one (same instance) changes no other tracked field, so the render that crosses the threshold would not happen.
- decideSuite stays the pure decision: `failed` now settles the suite regardless of earlier data (404 or stall); a transient failure is not `failed`, so it keeps the same-id history row progress or 0/N.
- useTrackedSuite returns `error` (the poll error once gone/stalled, else null). EvalsTab and AgentEvalDashboardView render it with role=alert; Run all/Run eval re-enable because `running` is false, and track(newId) clears it.
- CaseEditor: gone/stalled shows role=alert and the last-run panel no longer reads "running"; a failed run is not handed to the caller as pending.

## Deviations
- AgentEvalDashboardView.tsx, its styles.ts and test touched (inside the brief's `client/src/app/eval/**` allowance) to surface the error and adapt the hook mock to the new return shape.
- `useSuiteRun` previously retried non-404 errors twice with react-query backoff; it now counts polls like useCaseRun (as the brief asked for both).
- Old useCaseRun tests in eval.test.tsx edited only to read `.query` / `.stalled` from the new return shape; assertions unchanged.
