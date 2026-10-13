# Fix4 server report
Status: done. Docker down, so integration tests (`test/eval-`) not run.

| id | test | red | green | files |
|---|---|---|---|---|
| CR-31 | eval-scoring.test.ts "CR-31: a precisely cited full-file-kind finding (5..5) matches by line intersection" | expected true to be false | passes | server/src/modules/eval/scoring.ts |
| CR-36 | eval-scoring.test.ts "CR-36: a whole-file finding that takes no open must_find is neither matched nor noise" | expected 3 to be 1 | passes | scoring.ts |
| CR-35 | eval-scoring.test.ts "CR-35: scoring uses the FULL_FILE_KINDS exported by reviewer-core" | scoring.FULL_FILE_KINDS was a separate Set (not the same reference) | passes | reviewer-core/src/grounding.ts (export), scoring.ts (import `@devdigest/reviewer-core/grounding.js`, re-export) |
| CR-33 | eval-service.test.ts "CR-33: insertCaseRun throwing counts that case as errored and advances cases_done" | expected 1 to be 2 (casesDone) | passes | server/src/modules/eval/service.ts |

The old test "matches whatever its lines (0..0 and 5..5)" encoded the CR-31 bug; it is now split into a 0..0 case and the CR-31 case.

CR-33: only the insertCaseRun throw is handled (case counted errored, progress advanced, then rethrown so the suite ends failed, like a runOne throw). A throwing updateSuiteProgress after a case was already counted, and it is already caught by the suite-level catch; its cases_done cannot be advanced by definition.

Checks: reviewer-core typecheck clean, npm test 64 passed; server typecheck clean; lint:boundaries no violations; unit vitest 50 files / 556 passed.
