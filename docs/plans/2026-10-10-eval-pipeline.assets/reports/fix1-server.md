# Implementation Report: Eval Pipeline, lane 3 (steps 7-10)
Status: done
Mode: lane 3 (Red-first: implementer-owned)

## Steps
| id | BE/UI | status | files touched | note |
|---|---|---|---|---|
| 7 | BE | done | server/src/modules/eval/case-runner.ts, server/test/eval-case-runner.test.ts | `runEvalCase` calls only `reviewPullRequest` with the fixed inputs. `skills` and `prDescription` are omitted when empty. `task` is `EVAL_TASK`. |
| 8 | BE | done | server/src/modules/eval/service.ts, server/test/eval-service.test.ts ("cases") | `createFromFinding`, `listCases`, `createCase`, `updateCase`, `deleteCase`. |
| 9 | BE | done | same two files ("runs") | `startSuite`, `runAll`, `startCaseRun`, `reapInterrupted`, background `executeSuite`. |
| 10 | BE | done | same two files ("reads") | `getSuite`, `getCaseRun`, `history`, `compare`, `agentDashboard`, `workspaceDashboard`. |

## Skills applied
- preloaded: onion-architecture, frontend-ui-architecture
- invoked through Skill: security, zod. Both are named by the plan for steps 7-9. Step 10 names only onion-architecture.
- named by the plan but not invoked: none

## Self-review
- onion-architecture: `service.ts` imports no fastify, drizzle, `src/db` or adapter. Its only runtime imports are `platform/errors` and the eval module's own files. `case-runner.ts` imports `@devdigest/reviewer-core` (domain, inward) and eval-local files. The service takes `EvalPorts`, not `Container`. No issues.
- security: users only see fixed messages (`MSG.caseError`, `MSG.suiteFailed`). Raw error text goes to `ports.log` after `redactSecrets`, and a test asserts the `sk-` key is masked. Case text goes only into `prDescription`, never into `task`. Nothing in the service reads the workspace from input: every store call is workspace-scoped. No issues.
- zod: the service takes already-parsed contract types, so there is no parsing in this layer. No issues.

## Tests
| command | package | exit code | result |
|---|---|---|---|
| `pnpm exec vitest run test/eval-service.test.ts test/eval-case-runner.test.ts test/route-adapter-calls.test.ts` | server | 0 | 35 passed, 0 failed (24 service, 3 case-runner, 8 route test) |
| `pnpm typecheck` | server | 0 | clean |

## Deviations from plan
- Red-first order: I wrote `case-runner.ts` and its test in the same pass. The one failing run I saw was a wrong fixture (severity enum), not a missing module. The service tests were written after `service.ts` and went green on the first run, so there is no recorded red run for them. Each test asserts a specific outcome, but treat red-first as not strictly observed.
- Per-case metrics (recall, precision, citation accuracy from a `CaseScore`) are a private `caseMetrics` function in `service.ts`. They are not in `scoring.ts` or `helpers.ts`, because L1 owns those files.

## Decisions the plan left open (reviewers may want to check)
- A suite where every case errored ends `partial`, with all metrics null, per AC-22.
- Errored cases contribute a null to `suiteCost`, so `cost_partial` is true when any case errored.
- `scored_cases` lists all cases that ran, including errored ones.
- `AppError('suite_running', …, 409)` is thrown only by `startSuite` when `insertSuite` returns `'already_running'`. `runAll` catches that code and reports "already running".
- `startCaseRun` returns 422 `MSG.emptyDiff` for a case with a blank diff.
- A case deleted mid-suite (`insertCaseRun` returns undefined) is skipped. It is not added to `scored_cases`, but progress still advances.
- `compare` puts the older run (by `startedAt`, then `runNumber`) in `base`, whatever order the ids were passed in.
- `createFromFinding` writes `severity`, `category` and `title` on the expectation for both accepted and dismissed findings.
- `workspaceDashboard` makes one `listSuites` call per agent that has cases. `latest` is the latest done or partial run only.

## Not done / blocked
- none

## Insight candidates
- server — `server/tsconfig.json` does not include `server/test`, so the two new test files are not covered by `pnpm typecheck`. Only the vitest run checks them.

## Handoff to reviewers
- Surfaces and files touched: `server/src/modules/eval/case-runner.ts`, `server/src/modules/eval/service.ts`, `server/test/eval-case-runner.test.ts`, `server/test/eval-service.test.ts`.
- Wiring (a later lane) must supply every field of `EvalPorts`, including `findingContext`, `prFilePatch`, `background` (`void task().catch(log)`) and `runCase` (built from `runEvalCase` with `container.llm`, `parseUnifiedDiff` and `Date.now`).
- Exports for later lanes: `FindingContext` and `EvalPorts` from `service.ts`, and `CaseRunnerPorts`, `CaseRunInput` and `CaseRunOutput` from `case-runner.ts`.
- architecture-reviewer: `pnpm lint:boundaries` and `scripts/cross-module-imports.py` were not run (not my job).
- plan-verifier: integration steps (step 11) were not run. I wrote no `*.it.test.ts`.
- main session: the server package gate on the combined tree. `reviewer-core` is unchanged. No typecheck errors were seen outside my owned paths.

---

# Fix round 1 report (lane 3 / server eval paths)
Status: done
Mode: fix

Checks, all run from `server/`:
- `pnpm typecheck`: clean.
- `pnpm lint:boundaries`: exit 0, "no dependency violations found", 34 known violations ignored as before.
- `pnpm exec vitest run --exclude '**/*.it.test.ts'`: 50 files, 544 tests, all pass.
- `cross-module-imports.py`: 0 VIOLATION lines.
- The `*.it.test.ts` suites were not run (no Docker).

## Per id
- **AR-1: fixed.** `wiring.ts` no longer imports `src/adapters`.
  - Precedent: the container is the only place that imports adapters. `reviews/diff-loader.ts` imports the parser directly, but that is a baselined application file.
  - I added a pure method `Container.parseDiff(raw)` that delegates to `adapters/git/diff-parser.ts`. `wiring.ts` passes `(raw) => container.parseDiff(raw)` as the case-runner's `parseDiff` port. Evidence: `lint:boundaries` exits 0 and the baseline is untouched.
  - **Edit outside the owned paths:** `server/src/platform/container.ts` has one import, one `UnifiedDiff` type import and one method.
- **CR-2: fixed.** A new `normalizeRange(start, end)` in `helpers.ts` gives `start = max(1, min(s, e))` and `end = max(start, max(s, e))`. `createFromFinding` uses it before the insert, so a start_line 0 or reversed range now stores valid data. New service test: a finding with start_line 0 gives lines 1/1, a 9/4 finding gives 4/9, and both results pass `EvalCaseView.safeParse`.
- **CR-4: fixed.** In `executeSuite`, if `runOne` throws after `insertCaseRun`, the case run is now closed as errored with `MSG.suiteFailed`. A failure of that cleanup is logged. The original error is then rethrown, so the suite still ends `failed`. New unit test: `finishCaseRun` throws on call 2, the suite is `failed`, and the case runs read `['passed', 'errored']`.
- **CR-10: fixed.**
  - Removed the `hasRunningSuite` pre-check. `runAll` now relies on the `suite_running` catch.
  - `startSuite` is split into a private `startSuiteFor(workspaceId, agent, cases)`. `runAll` reuses the agent it already listed and does one `listCases` per startable agent, with no `getAgent` refetch.
  - `ratio` is now exported from `scoring.ts`, and `service.ts` imports it instead of keeping a duplicate. `scoring.ts` stays pure.
- **SR-1: fixed.** `redactSecrets` now also masks `xai-`, `github_pat_`, `gh[pousr]_`, `AIza…` and `api_key=` / `access_token=` / `secret=` / `token=` / `key=` values (the `=` kept, the value replaced with `***`). New unit test in `eval-helpers.test.ts`.
- **CR-1 (server side): confirmed, no change needed.** `agentDashboard.history` is every suite from `listSuites`, newest first, mapped through `toSummary`, so running suites appear with `status: 'running'`, `cases_done` and `cases_total`. I added an assertion for this to the dashboard test.
- **CR-9: deferred as instructed.**

## Test double change
The fake store's `insertSuite` in `eval-service.test.ts` now returns `'already_running'` when the agent already has a running suite, as the real repository does. The runAll test needed this once the `hasRunningSuite` pre-check was removed.

## Files touched
- `server/src/modules/eval/service.ts`
- `server/src/modules/eval/helpers.ts`
- `server/src/modules/eval/scoring.ts` (only `export` on `ratio`)
- `server/src/modules/eval/wiring.ts`
- `server/src/platform/container.ts` (outside owned paths)
- `server/test/eval-service.test.ts`
- `server/test/eval-helpers.test.ts`

## Insight candidate
- server — `route-no-adapter-import` applies to `routes.ts` and `wiring.ts` but not to application files, so a pure adapter-side helper still has to come in through the Container. Evidence: `server/src/platform/container.ts` `parseDiff`.