# Fix5 client report: polling never gives up
Status: done. Mode: fix. No commit. Only client/ touched.

Red run (tests written first, before code): hooks 8 failed (eval.test.tsx 6, eval-tracked-suite.test.tsx 2); components 5 failed (CaseRow 1, CaseEditor 1, EvalsTab 2, AgentEvalDashboardView 1).
Green: `pnpm typecheck` exit 0; `pnpm test` (full): Test Files 80 passed (80), Tests 532 passed (532).

| id | test (red then green) | files |
|---|---|---|
| CR-37 | eval.test.tsx "CR-37 pollIntervalMs grows ... resets" (pure: 1.5 s, 3, 6, cap 10 s); "CR-37 a suite poll that fails over and over keeps polling with backoff, reports reconnecting, then recovers"; "CR-37 a case run that keeps failing is never given up on"; eval-tracked-suite.test.tsx "CR-37 running data then 5 failed polls then success: still tracked, reconnecting meanwhile, progress updates after" and "CR-32/CR-37 a transient failure with no data ... never settles"; EvalsTab.test.tsx "CR-37 a resumed suite whose polls fail five times ... Run all disabled, progress updates after recovery"; CaseRow.test.tsx "CR-37 a case run whose polls fail five times ... stays running with a notice, then finishes"; AgentEvalDashboardView.test.tsx "CR-37 a suite whose polls are failing keeps Running k/N and a disabled Run eval, with a non-blocking notice" | hooks/eval.ts, hooks/eval-tracked-suite.ts, EvalsTab.tsx, CaseRow.tsx, AgentEvalDashboardView.tsx, messages/en/eval.json |
| CR-38 | CaseEditor.test.tsx "CR-38 a run that is reconnecting ... handed to the caller on close" (red: no notice) | CaseEditor.tsx |
| CR-39 | EvalsTab.test.tsx "CR-39 the poll notice of the tracked suite wins over an older 409 start error" (red: notice never shown) | EvalsTab.tsx |
| CR-29/CR-32 remainder | covered by the CR-37 tests: ~3 s outage (and a 40 s one) leaves case runs and suites tracking and recovering on their own | hooks |

## What changed
- hooks/eval.ts: `usePolledRun` stops only on a terminal status or a 404. New exported `pollIntervalMs(failures)` (1.5 s, then 3, 6, capped at `EVAL_POLL_MAX_MS` = 10 s) drives `refetchInterval`; the failure counter resets on success. `stalled` and `CASE_RUN_MAX_FAILURES` removed; hooks return `{ query, gone, reconnecting }` (`reconnecting` = last poll failed and the run is not gone/terminal). Kept: `retry: false`, `errorUpdateCount` subscription, un-spread query, 404 handling.
- eval-tracked-suite.ts: only `gone` settles (`failed: gone`); `decideSuite` unchanged in logic (doc updated). `useTrackedSuite` returns `reconnecting`; `error` is set only for `gone`.
- CaseEditor: `runDone = gone || terminal`, so a reconnecting run is handed to CaseRow on close; shows a role=status notice. CR-30 alert for `gone` kept.
- CaseRow: running through failures; notice (role=status) shown in place of an error; error only for `gone` or a start error.
- EvalsTab: `notice = suiteError ?? (reconnecting ? null : startSuite.error)`; reconnecting shows a role=status notice. A `useEffect` on `trackedId` calls `startSuite.reset()`, so a start error clears when another suite is tracked or adopted.
- AgentEvalDashboardView: non-blocking role=status notice beside Running k/N; Run eval stays disabled.
- New i18n key `eval.reconnecting` ("Connection problem, retrying…") and a `notice` style (warn colour) in the four styles.ts.

## Deviations
- Existing tests that encoded the removed stall (CR-23 hook test, fix4 CR-29 stall test, CR-23 CaseRow test, CR-32 tracked-suite stall test, dashboard stalled test) were replaced or reshaped to the new behaviour; "each failed poll is one attempt" now expects the backoff (2nd poll after 3 s).
- The start-error reset is an effect (state sync with the tracked id); the start error is not shown while the tracked suite is reconnecting.
