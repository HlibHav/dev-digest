# Implementation Report: eval-pipeline, fix round 3 (server)
Status: done
Mode: fix

## Steps
| id | BE/UI | status | files touched | note |
|---|---|---|---|---|
| CR-22 | BE | fixed | server/src/modules/eval/scoring.ts, server/test/eval-scoring.test.ts, server/test/eval-service.test.ts | see Deviations |
| CR-20 | BE | fixed | server/src/modules/eval/service.ts, server/test/eval-service.test.ts | the crash path now does `done += 1` and calls `updateSuiteProgress` before it rethrows. A failure in that progress write is logged, so the original error is not masked. |
| CR-27 | BE | fixed | server/src/modules/eval/types.ts, repository.ts, repository/suite-run.repo.ts, service.ts, server/test/eval-service.test.ts | `runAll` makes one `agentsWithRunningSuite(workspaceId)` call up front and checks `running.has(agent.id)`. `hasRunningSuite` and `hasRunning` are removed. The `insertSuite` 'already_running' catch stays. |

## CR-22 variant chosen
- A finding is whole-file only if its `kind` is in `FULL_FILE_KINDS` (`secret_leak`, `lethal_trifecta`, `phantom`, `hook`). The set is a local copy in `scoring.ts` with a comment pointing at `reviewer-core/src/grounding.ts`.
- The `start_line === 0` rule is removed. Non-full-file findings use plain range intersection.
- A whole-file finding is noise against a `must_not_flag` on its file. It satisfies at most one `must_find`: the first one on that file that is still open. Line-range findings are processed first, so a whole-file finding only takes expectations they left open.
- `Range` now carries `kind?: string | null`, because `Finding.kind` can be null. `case-runner` already passes full `Finding` objects, so no wiring change was needed.
- The case-from-finding normalisation (stored expectation lines >= 1) is untouched.

## Skills applied
- preloaded: onion-architecture, frontend-ui-architecture
- invoked through Skill: onion-architecture, drizzle-orm-patterns, zod (as the brief asked)
- named by the plan but not invoked: none

## Self-review
- onion-architecture: the new store method is a port in `types.ts`, implemented in the repository and the sub-repo. `scoring.ts` still has no runtime imports. No new imports were added outside the module. No issues.
- drizzle-orm-patterns: `selectDistinct` with a workspace and `status = 'running'` filter, in one query. No issues.

## Tests
| command | package | exit | result |
|---|---|---|---|
| `pnpm exec vitest run test/eval-scoring.test.ts test/eval-service.test.ts`, with the old `scoring.ts` restored from `HEAD` and the new tests in place (red) | server | non-zero | 5 failed: 3 in eval-scoring and 2 in eval-service |
| `pnpm typecheck` | server | 0 | clean |
| `pnpm lint:boundaries` | server | 0 | no violations; the 34 known violations are ignored |
| `pnpm exec vitest run --exclude '**/*.it.test.ts'` (green, final) | server | 0 | 50 files, 552 tests passed |

The 5 red failures, by test name:
- eval-scoring, "a full-file-kind finding matches an expectation on its file whatever its lines (0..0 and 5..5)"
- eval-scoring, "a non-full-file finding spanning 0..12 gets no whole-file credit for line 400"
- eval-scoring, "one whole-file finding satisfies at most one of three must_find on its file (recall 1/3)"
- eval-service, "finishCaseRun throws after case 1 → suite failed with MSG.suiteFailed", which now asserts `casesDone` 2 and `casesErrored` 1
- eval-service, "runAll: disabled / no cases / too many cases / already running skipped", which now asserts a single `agentsWithRunningSuite` call

The runAll test failed because the new double no longer has `hasRunningSuite`, not on the query count itself.

## Deviations from plan
- The existing 0..0 scoring tests were rewritten to carry `kind: 'secret_leak'`. Under the new rule a plain 0..0 finding has no whole-file semantics.
- The service test "a case made from a 0..0 finding passes against a 0..0 finding" now uses a `secret_leak` grounded finding, and is renamed to match.
- Plan line 346 of `docs/plans/2026-10-10-eval-pipeline.md` still lists `hasRunningSuite`. It is outside my owned paths and I left it.

## Not done / blocked
- None. The integration tests were not run (no Docker). `eval-runs.it.test.ts` and the other `*.it.test.ts` files were not edited, and a grep found no remaining `hasRunning` references in `src` or `test`.

## Insight candidates
- server — Grounding decides "whole file" by `kind` (FULL_FILE_KINDS), not by line numbers. Any code that interprets `start_line: 0` must key on `kind` too.

## Handoff to reviewers
- Files touched: `server/src/modules/eval/{scoring,service,types,repository}.ts` and `server/src/modules/eval/repository/suite-run.repo.ts`, plus `server/test/eval-scoring.test.ts` and `server/test/eval-service.test.ts`.
- architecture-reviewer: check the port rename (`agentsWithRunningSuite`) and that `scoring.ts` stays pure.
- plan-verifier and main session: run the integration tests. `suite-run.repo.ts` has a new `selectDistinct` query, and the integration tests exercise runAll and the repository. Update the plan's `hasRunningSuite` mention if you want it consistent.
- Ledger: CR-20, CR-22 and CR-27 can be marked fixed.