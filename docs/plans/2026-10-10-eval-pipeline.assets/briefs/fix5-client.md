# Fix brief: eval pipeline, round 5 (client polling, Glib's call: remove the stop)

Mode: fix. Red-first: implementer-owned (failing test first, record red line, then fix).
Worktree: /Users/Glebazzz/Claude/PROJECTS/NEO/dev-digest/.claude/worktrees/eval-pipeline. Do not commit.
Owned paths: client/src/lib/hooks/eval.ts, client/src/lib/hooks/eval-tracked-suite.ts (+ tests), client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/**, client/src/app/eval/[agentId]/_components/AgentEvalDashboardView/**. Nothing in server/.
Skills: frontend-ui-architecture (preloaded), react-best-practices, react-testing-library.
Budget: <= 60 tool calls or 25 min.
Context: reports/review3-code-review.md (CR-28..34), reports/fix4-client.md (what round 4 did), and the round-4 review findings below.

Decision (Glib): transient errors never stop polling. Remove the "stalled after 3 failed polls" stop entirely.

Required behaviour, owned by usePolledRun in hooks/eval.ts:
- Polling stops ONLY on a terminal status or a 404 (`gone`).
- On a non-404 failure polling continues with backoff: the interval grows per consecutive failed poll (e.g. 1.5 s → 3 → 6 → capped at 10 s) and resets to the normal interval on success.
- The hook exposes a "connection problem" flag (rename `stalled` to something like `reconnecting`, true while the last poll failed and the run is not gone/terminal). Views show it as a non-blocking notice (role="status" or alert) while keeping the running state and progress visible.
- decideSuite: only `gone` (404) or a terminal status settles a tracked suite. A transient failure never settles it, whether or not data arrived earlier; it shows the last data's progress, else the same-id running history row, else 0/N. Run all / Run eval stay disabled while it is unsettled.

Round-4 review findings this closes:
- CR-37 (eval-tracked-suite.ts:32): a running suite was dropped after 3 failed polls and never re-polled (refetchOnWindowFocus is false in providers.tsx:29).
- CR-38 (CaseEditor.tsx:51): `runDone = runFailed || …` treated a stalled run as done so closeWith did not hand it to CaseRow. Only `gone` or terminal may block the handoff.
- CR-39 (EvalsTab.tsx:106): `startSuite.error ?? suiteError` let a stale start-mutation error shadow the suite poll state. The poll state of the currently tracked suite wins; the start error clears when a new suite is tracked (or is shown only until the next track/adopt).
- Also finishes CR-29 and CR-32 remainders (a ~3 s API restart must leave both case runs and suites tracking and recovering on their own).

Keep: retry: false (one attempt per poll), errorUpdateCount subscription if still needed, un-spread query (CR-34), 404 handling (CR-28), CaseEditor alert for `gone` (CR-30).

Tests must cover at least: suite with running data + 5 consecutive failed polls then success → still tracked, notice shown during failures, progress updates after recovery, Run all disabled throughout; same for a case run in CaseRow; CaseEditor hands a reconnecting run to CaseRow on close; EvalsTab shows the poll notice of the tracked suite over an older 409 start error; backoff interval grows and resets (test the pure interval function).

Checks: client `pnpm typecheck` and full `pnpm test`; paste result lines.
Report: docs/plans/2026-10-10-eval-pipeline.assets/reports/fix5-client.md — per id: test, red line, green line, files touched.
