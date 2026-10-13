# Implementation Report: eval pipeline, client structural move (fix round 3)
Status: done
Mode: fix (Red-first: implementer-owned)

Worktree: /Users/Glebazzz/Claude/PROJECTS/NEO/dev-digest/.claude/worktrees/eval-pipeline (client/ only; server/ untouched).

## Steps
| id | BE/UI | status | files touched | note |
|---|---|---|---|---|
| Shared suite tracking: CR-11, CR-13, CR-21, CR-24, CR-25 | UI | done | `client/src/lib/hooks/eval-tracked-suite.ts` (new), `.../eval-tracked-suite.test.tsx` (new), `client/src/lib/hooks/eval.ts` (useSuiteRun retry), `EvalsTab.tsx`, `AgentEvalDashboardView.tsx`, both `helpers.ts` | Both `runningProgress` copies are deleted, along with the dashboard view's `helpers.ts` and the EvalsTab `runningProgress` test. Both views call `useTrackedSuite`. |
| CR-8 remainder: CaseRow | UI | done | `CaseRow.tsx` | Follows the most recently set run id. |
| CR-8 remainder: CaseEditor | UI | done | `CaseEditor.tsx` | Every close goes through `closeWith`. |
| CR-23 | UI | done | `client/src/lib/hooks/eval.ts`, `CaseRow.tsx` | `useCaseRun` stops polling and reports `stalled`. |

## Skills applied
- preloaded: onion-architecture (not applicable, client only), frontend-ui-architecture.
- invoked through Skill: react-best-practices, react-testing-library, next-best-practices.
- named by the plan but not invoked: none.

## Self-review
- frontend-ui-architecture: the decision logic is a pure function, `decideSuite`, so it is unit-tested without React. Server state stays in `src/lib/hooks`. No new barrels. Nothing is imported from `app/**` into `lib`.
- react-best-practices: the tracked id and the adopted id are derived during render. Adoption uses the documented render-phase `setState`, and there are no effects for state sync. CaseRow tracks the previous prop value in state instead of using an effect.
- I grepped for leftovers (`runningProgress`, `setTrackedId`, `ownRunId`) and found none.

## Evidence per id
- CR-11 (fixed, kept): hook test "CR-11 an adopted suite stays tracked…". The existing view and EvalsTab CR-11 tests still pass.
- CR-13 (fixed, kept): `decideSuite` test, hook test, and the existing view and EvalsTab CR-13 tests.
- CR-21 (fixed): `useSuiteRun` now gets `retry: not 404 and count < 2`. A tracked id whose fetch errors with no data ever received counts as settled, so it stops showing "Running 0/N". Tests: hook test, dashboard view test and EvalsTab test (suite 404, Run all re-enabled).
- CR-24 (fixed): a settled tracked id ignores a history row with the same id. Tests: `decideSuite`, hook and dashboard view.
- CR-25 (fixed in the hook): the tracked state is `{agentId, id}`, and `trackedId` is null for another agent. Tests: hook test, which also checks that switching back shows the suite again, and dashboard view test. The view test already passed against the old code, so only the hook test was red for this id.
- CR-8 remainder (fixed): CaseRow tests "a newer run handed up by the editor is followed even after an older own run finished" and CaseEditor test "saving with Run on save switched off still hands a run that is still going".
- CR-23 (fixed): `useCaseRun` counts consecutive failed reads in the query function and resets the count on success. After `CASE_RUN_MAX_FAILURES` (3) it stops polling and returns `stalled: true`. CaseRow shows the error (role=alert) and Play starts a new run. The `retry` function now allows at most 2 retries (3 attempts, a total of 3 attempts counting retries).

## Tests
| command | package | exit | result |
|---|---|---|---|
| RED: `pnpm exec vitest run src/lib/hooks src/app/eval 'src/app/agents'` (after writing the tests, before the code) | client | 1 | 7 tests failed and 1 file failed to load. The 7: eval.test CR-23; view CR-21 and CR-24; EvalsTab CR-21; CaseEditor CR-8; CaseRow CR-23 and CR-8. The file that failed to load was `eval-tracked-suite.test.tsx`, because the module did not exist. |
| `pnpm exec vitest run src/lib/hooks src/components/eval src/app/eval 'src/app/agents'` | client | 0 | 22 files, 131 tests passed |
| `pnpm exec tsc --noEmit` | client | 0 | no errors |
| `pnpm test` | client | 0 | 80 files, 518 tests passed |

## Deviations from plan
- The hook is in a new file, `client/src/lib/hooks/eval-tracked-suite.ts`, not in `eval.ts`. Two reasons. The view tests mock `@/lib/hooks/eval` and stub `useSuiteRun`, and a hook inside that module would have been mocked away along with it. A separate file keeps those view tests exercising the real decision logic.
- The pure helper `decideSuite` is in the hook file, not `components/eval/helpers.ts`. `lib` may not import from `components`, so the path you suggested would break the downhill-only import rule.
- Two existing tests changed because they encoded the old behaviour. The transient-error test in `eval.test.tsx` now uses 2 transient failures, not 3. CaseRow's "CR-15 transient poll errors… neither end running nor re-enable Play" was replaced by the CR-23 test, which asserts the opposite.
- A test-hygiene trap hit while writing: `beforeEach(() => mock.mockReset())` returns the mock, and vitest calls a returned function as a cleanup hook. Use a block body.

## Not done / blocked
- None.

## Insight candidates
- client — `beforeEach(() => fn.mockReset())` returns the mock, which vitest then calls with no arguments as a cleanup hook (extra phantom calls or rejections). Use braces.
- client — "Which suite is running" now has one owner, `useTrackedSuite` (`client/src/lib/hooks/eval-tracked-suite.ts`). A route-local copy of the decision logic is what regressed twice.

## Handoff to reviewers
- Surfaces and files touched: client only. `client/src/lib/hooks/eval.ts`, `eval-tracked-suite.ts`, `eval-tracked-suite.test.tsx`, `eval.test.tsx`. Under `.../EvalsTab/`: `EvalsTab.tsx`, `EvalsTab.test.tsx`, `helpers.ts`, `helpers.test.ts`, `CaseRow/*`, `CaseEditor/*`. Under `client/src/app/eval/[agentId]/_components/AgentEvalDashboardView/`: `AgentEvalDashboardView.tsx`, its test, and `helpers.ts` (deleted).
- architecture-reviewer: placement of the hook file (lib/hooks) and no import from `lib` into `components` or `app`.
- plan-verifier: re-check AC-29, AC-34 and AC-35 against the tests listed above.
- main session: the package gate is already green on the combined client tree as above. Not run: `pnpm lint:boundaries` (server only). e2e and pr-self-review are left to the main session.