# Fix brief: eval pipeline, extra round 4 (client run tracking)

Mode: fix. Red-first: implementer-owned (write the failing test, run it, record the red line, then fix).
Worktree: /Users/Glebazzz/Claude/PROJECTS/NEO/dev-digest/.claude/worktrees/eval-pipeline. Do not commit.
Owned paths: client/src/lib/hooks/eval.ts, client/src/lib/hooks/eval-tracked-suite.ts (+ tests), client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/** , client/src/app/eval/** (only if a view must surface the new state). Nothing in server/.
Skills: frontend-ui-architecture (preloaded), react-best-practices, react-testing-library.
Budget: <= 80 tool calls or 30 min, then stop and write the report as-is.
Full finding text: docs/plans/2026-10-10-eval-pipeline.assets/reports/review3-code-review.md.

Glib approved one narrow round beyond the 3-round limit. Previous rounds churned on this area, so keep one owner: useSuiteRun/useCaseRun own polling + failure state, decideSuite stays the pure decision. Fix exactly these ids:

- CR-29 (hooks/eval.ts:112): "3 consecutive failures" means 3 failed polls, not 3 queryFn attempts. Count failures per poll (e.g. retry: false and count in the query fn, or count in onError of the settled fetch). A ~3 s API restart must not stop polling. Apply the same rule to useSuiteRun.
- CR-28 (eval-tracked-suite.ts:30): a 404 at any time, including after earlier `running` responses, settles the tracked suite and stops polling (the suite is gone). Never "running" forever.
- CR-32 (eval-tracked-suite.ts:30): a transient non-404 failure (no data yet, or data still running) does not settle the suite. It keeps polling per CR-29; while it has no data it shows the same-id running history row's progress (or 0/N). Only stall (3 failed polls) or 404 settles it. After a stall the screen shows an error (role=alert), not "running", and the user can recover without a reload.
- CR-30 (CaseEditor.tsx:83): CaseEditor surfaces run.stalled / a 404 as an error instead of 'running' forever, matching CaseRow.
- CR-34 (hooks/eval.ts:137): don't spread the query result; return `stalled` (and any new flag) alongside the un-spread query so tracked props stay narrow. Update consumers.

Checks to run and paste in the report: client `pnpm typecheck` and `pnpm test` (full).

Report: docs/plans/2026-10-10-eval-pipeline.assets/reports/fix4-client.md — per id: test name, red line, green line, files touched.
