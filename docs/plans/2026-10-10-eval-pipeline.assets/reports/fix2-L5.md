# Implementation Report: Eval Pipeline, lane 5 (client hooks, shared eval components, nav item)
Status: done
Mode: lane 5 (Red-first: implementer-owned)

## Steps
| id | BE/UI | status | files touched | note |
|---|---|---|---|---|
| 12 | UI | done | `client/src/lib/hooks/eval.ts`, `client/src/lib/hooks/eval.test.tsx`, `client/messages/en/eval.json` | All hooks from the plan. `useSuiteRun` and `useCaseRun` poll every 1500 ms (`EVAL_POLL_MS`) while `running` and stop at a terminal status. `useSuiteRun` invalidates `eval-dashboard`, `eval-cases` and `eval-history` for the agent on the running to terminal edge. i18n keys added. |
| 13 | UI | done | `client/src/components/eval/{constants.ts, helpers.ts, helpers.test.ts}`, `MetricStat/{MetricStat.tsx, .test.tsx, index.ts, styles.ts}`, `DeltaBadge/{DeltaBadge.tsx, .test.tsx, index.ts}` | AC-23 (MetricStat), AC-49 and AC-50 go red, then green. |
| 14 | UI | done | `client/src/components/eval/RunHistoryTable/{.tsx, .test.tsx, index.ts, styles.ts}`, `TrendChart/{.tsx, .test.tsx, index.ts, styles.ts}`, `CompareModal/{.tsx, .test.tsx, index.ts, styles.ts}` | AC-23 (history row) green. |
| 15 | UI | done | `client/src/vendor/ui/nav.ts` (one item, icon `Gauge`), `client/src/components/app-shell/EvalDashboardNav.test.tsx` | The test was red before the nav edit and green after. |

Placement:
- `components/eval/` is the promoted shared folder, because `/agents/[id]` and `/eval/**` both consume it.
- Each component is a `<Name>/` folder with `index.ts` (named exports) and a colocated test.
- Hooks live in `lib/hooks/eval.ts`.
- I did not add the hooks to `hooks/index.ts` (not an owned path, and no new `export *` is allowed). Consumers import `@/lib/hooks/eval`.

## Skills applied
- preloaded: onion-architecture (no backend code in this lane), frontend-ui-architecture
- invoked through Skill: react-best-practices, react-testing-library, security, zod, next-best-practices. All were named by the plan for client/**, and all loaded; `next-best-practices` loaded through Skill, so the Read fallback was not needed.
- named by the plan but not invoked: none

## Self-review (code writing)
- frontend-ui-architecture: placement, named-export barrels, no cross-route imports, no `fetch` in components. No issues.
- react-best-practices:
  - Derived values are computed in render. The only effects are the suite-run invalidation edge (external cache sync) and the modal Escape key listener (window event with cleanup).
  - Fixed keys. No render factories.
  - No issues.
- security:
  - Case and prompt text render as React text only, never Markdown or HTML. The CompareModal test checks that `<b>` in a prompt line stays as text.
  - `encodeURIComponent` on the compare query ids.
  - No issues.
- zod: no new schemas on the client. Types are `import type` from `@devdigest/shared`, which avoids the value-import trap in `INSIGHTS.md`.
- react-testing-library: queries are by role or text. The one `fireEvent` use is deliberate, because `user-event` is not installed. Mocks are at the `@/lib/api` boundary.

## Tests
| command | package | exit code | passed / failed |
|---|---|---|---|
| `pnpm exec vitest run src/components/app-shell/EvalDashboardNav.test.tsx` (red before the nav edit) | client | 1 | 1 failed (link not found) |
| `pnpm exec vitest run src/lib/hooks/eval.test.tsx` (red, module missing) | client | 1 | no tests ran |
| `pnpm exec vitest run src/components/eval/` (red, modules missing) | client | 1 | 3 files failed to import, then 3 more after the step-14 tests were written |
| `pnpm exec vitest run src/components/eval/ src/components/app-shell src/lib/hooks/eval.test.tsx` (final) | client | 0 | 10 files, 22 tests passed |
| `pnpm typecheck` | client | 0 | clean |

## Deviations from plan
- Added keys `compare.kind.{model, provider, strategy, skill_added, skill_removed, skill_version}` to `eval.json`. They are not in the plan's key list. CompareModal needs a label for each `EvalConfigChange.kind`, and a raw token would be a user string outside i18n. Step 12 and 14. L6/L7 can use them; no other keys were added.
- `helpers.ts` also exports `formatRanAt` (UTC `YYYY-MM-DD HH:mm`) and `executedCount` (`cases_done` minus `cases_errored`). RunHistoryTable needs both.
- Judgement calls:
  - "executed" in the passed/executed display is `cases_done - cases_errored`.
  - `formatCost` marks a partial total with a trailing `+`.
  - The cost delta colour is inverted (an increase reads as bad).
  - A delta whose rounded value is 0 is `flat`.
  - `compare` takes the older run as base and the newer as head.
- Several i18n keys from the plan are unused by this lane (`metric.runLabel`, `metric.partialCost`, `metric.up`/`down` are used). `runLabel` is the pure helper the plan's test mandates, so `metric.runLabel` is currently unused. L6/L7 may use it.
- Step 12 `verify` and step 13/14 verify ran as targeted runs, as specified. No package-wide command was needed.
- Skipped, as the plan assigns them to others: `lint:boundaries`, integration tests and e2e.

## Not done / blocked
- none

## Insight candidates
- client — A react-query poll test under `vi.useFakeTimers` needs `await act(async () => vi.advanceTimersByTimeAsync(n))`. `result.current.data` lags the call count by one notify tick, so assert the status after a later advance, not right after the 2nd fetch.
- client — The vendored `Modal` renders its own header "Close" button, so a footer Close button makes `getByRole("button", {name: "Close"})` ambiguous. Use `getAllByRole(...).at(-1)`.

## Handoff to reviewer
- Surfaces and files touched: client only. `lib/hooks/eval.ts`, `messages/en/eval.json`, `components/eval/**`, `vendor/ui/nav.ts` (the one approved item), `components/app-shell/EvalDashboardNav.test.tsx`.
- architecture-reviewer: confirm the `components/eval/` promotion shape and that no `export *` was added. The `hooks/index.ts` barrel is intentionally untouched.
- plan-verifier:
  - AC-23: `MetricStat.test.tsx` "AC-23 null value renders —" and `RunHistoryTable.test.tsx` "AC-23 null precision renders —".
  - AC-49: `helpers.test.ts`.
  - AC-50: `DeltaBadge.test.tsx`.
  - AC-51 is e2e (step 22).
  - The red-first tests are implementer-owned and uncommitted in the worktree.
- security-reviewer: model output and case text render as text only. See `CompareModal.tsx` (prompt diff) and `TrendChart.tsx`.
- main session:
  - Run the client package gate (`pnpm typecheck` and `pnpm test`) on the combined tree. I ran only targeted tests.
  - `diff -rq server/src/vendor/shared client/src/vendor/shared` reports `adapters.ts`, `contracts/eval-ci.ts` and `contracts/knowledge.ts` as differing. These are not in my paths and I did not touch them. Check whether lane 0/1 or earlier changes caused them.
  - e2e and pr-self-review are yours.
- No architecture, acceptance or security verdict is given here.

---

# Fix report: lane 5, round 1
Status: done
Mode: fix

## Findings addressed
- **CR-3** (`client/src/lib/hooks/eval.ts`): `useSuiteRun` now invalidates `eval-dashboard`, `eval-cases` and `eval-history` for the agent on reaching any terminal status, once per suite run id. This holds even when the first fetch is already done, partial or failed.
- **CR-6** (`eval.ts`):
  - `useSuiteRun` also invalidates `["eval-workspace-dashboard"]` on terminal.
  - `useEvalWorkspaceDashboard` polls every `EVAL_POLL_MS` only while `recent_runs` or an agent's `latest` is `running`.
  - `useAgentEvalDashboard` polls only while `latest.status` is `running`.
- **CR-5** (`client/src/components/eval/helpers.ts`): `compareEnabled` is true only for exactly two runs, both `done` or `partial`. The AC-49 test is updated: a `running` run now gives false.
- **SR-2** (`eval.ts`): every id in a path is encoded through a local `seg()` helper (`encodeURIComponent`). The compare query uses it too. A grep for remaining `${...}` path interpolations found none.
- **AR-2**: not moved. `DeltaBadge` has two consumers, `MetricStat` and `CompareModal`, both siblings inside `components/eval/`. Under frontend-ui-architecture rule 2 it stays lifted at `components/eval/DeltaBadge/`. L6 and L7 files import only `MetricStat`, not `DeltaBadge`.

## Red-first
Before the fix, `pnpm exec vitest run src/lib/hooks/eval.test.tsx src/components/eval/helpers.test.ts` gave 5 failed and 6 passed. The 5 failures were:
- the AC-49 test;
- first-fetch-terminal invalidation (including the workspace dashboard);
- workspace dashboard polling;
- agent dashboard polling;
- SR-2 path encoding.

## Tests
| command | exit | result |
|---|---|---|
| `pnpm exec vitest run src/lib/hooks src/components/eval` | 0 | 8 files, 32 tests passed |
| `pnpm typecheck` (client) | 0 | clean |

## Files touched
- `client/src/lib/hooks/eval.ts`
- `client/src/lib/hooks/eval.test.tsx`
- `client/src/components/eval/helpers.ts`
- `client/src/components/eval/helpers.test.ts`

I did not touch L6/L7 files. `eval.json` needed no change.

---

CR-6 correction applied, status done. Files: `client/src/lib/hooks/eval.ts` and `eval.test.tsx`.

- `useAgentEvalDashboard` now polls every `EVAL_POLL_MS` while any `history` entry has status `running`. It stops when none do. The old `latest.status` check is gone.
- `useEvalWorkspaceDashboard` now looks only at `recent_runs`. The `agents[].latest` check is gone.
- Red first: I changed the agent-dashboard test so the first response has `latest: done` and `history[0]: running`. With the old code that test failed (1 failed, 6 passed). After the change, `pnpm exec vitest run src/lib/hooks src/components/eval` gave 32 passed (8 files), and `pnpm typecheck` in client is clean.

---

# Fix report: lane 5, round 2
Status: done. Files: `client/src/lib/hooks/eval.ts` and `client/src/lib/hooks/eval.test.tsx`.

## Changes
- **CR-14 / CR-11**:
  - `useAgentEvalDashboard` no longer has a `refetchInterval`. `useSuiteRun` owns the refresh.
  - `useEvalWorkspaceDashboard` still polls, but at the new exported constant `EVAL_DASHBOARD_POLL_MS = 5000`, and only while `recent_runs` has a `running` entry.
- **CR-18 / CR-8 / CR-15**: `useCaseRun` now takes the agent id and handles errors itself.

## New API (for L6 and CaseRow/CaseEditor)
```ts
useCaseRun(caseRunId: string | null | undefined, agentId?: string | null): UseQueryResult<EvalCaseResult>
isCaseRunGone(error: unknown): boolean   // true for an ApiError with status 404
```
- **Terminal refresh**: when `agentId` is passed, any terminal status invalidates `["eval-cases", agentId]` and `["eval-dashboard", agentId]` once per `caseRunId`. This includes a first fetch that is already terminal. Without `agentId`, nothing is invalidated, so the old call sites still typecheck.
- **Polling**:
  - It runs every `EVAL_POLL_MS` until `data.status` is not `running`, or the error is a 404.
  - Transient errors keep polling.
  - Retry is `!isCaseRunGone(err) && count < 2`.
- **Telling transient from gone**:
  - Use `query.error` and `query.data`.
  - `isCaseRunGone(query.error)` means the run is gone: show "interrupted/gone" and stop.
  - A non-404 `query.error` with `data` still `running` (or no data) means a transient error: keep the spinner or show a soft retry notice.
  - Read `query.error` during render, because react-query only re-renders for fields the render touched.
  - The old call sites need no change. L6 can drop its own cases-invalidate effects and pass `agentId`.

## Tests
- **Red first**: before the implementation, 4 tests failed:
  - the workspace dashboard poll (it was at 1500 ms);
  - "agent dashboard does not poll";
  - the `useCaseRun` first-fetch-terminal invalidation;
  - the transient-error/404 test (missing `isCaseRunGone`).
- **Green**: `pnpm exec vitest run src/lib/hooks src/components/eval` passed 34 tests.
- **Typecheck**: no errors in my files. The only `pnpm typecheck` errors are in L6's in-progress `AgentEvalDashboardView.tsx:91` (`RunProgress` has no `cases_done` or `cases_total`). I did not touch that file.