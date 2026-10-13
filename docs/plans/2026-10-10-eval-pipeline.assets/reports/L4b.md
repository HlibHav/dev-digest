# Implementation Report: eval pipeline, lane 4b (history and rate-limit integration tests)
Status: done (typecheck clean; integration tests written but not run, no Docker)
Mode: lane 4b

## Steps
| id | BE/UI | status | files touched | note |
|---|---|---|---|---|
| 11 (Red-first rows AC-28, 45, 47, 48, 58) | BE (tests only) | done | `server/test/eval-history.it.test.ts`, `server/test/eval-rate-limit.it.test.ts` (both new) | |

Tests in `eval-history.it.test.ts`:
- AC-45: three suites inserted out of order. The history route returns them newest first with the summary fields. The list has no `snapshot`. The agent dashboard `history` has the same order.
- AC-47 (compare): the query names the newer run as `base`. The test expects `base` to be the older run, the signed deltas, the exact `prompt_diff`, and exactly three `config_changes` (model, skill_version, skill_added).
- AC-47 (422): same id, failed, running and cross-agent pairs all return 422. A valid done/done pair returns 200.
- AC-48: the older run's scored list holds a case that is then deleted from `eval_cases`. The test expects `case_set` of `{added:1, removed:1}` and recall delta 0.5. An identical set gives `{0,0}`.
- AC-58: 50 cases, 50 suites and 2500 `eval_runs` inserted directly. It checks that history returns 50 rows. It then makes 20 requests each to the agent dashboard, `/eval/dashboard` and the history route, and asserts p95 < 500 ms for each.

Tests in `eval-rate-limit.it.test.ts`:
- Named exactly "AC-28 the 11th POST /agents/:id/eval-runs within a minute answers 429". It builds its own app with `NODE_ENV=development`, copying the `brief-rate-limit` pattern.
- Two extra tests: `POST /eval-runs/all` also gets 429 on the 11th request, and `GET /eval-suite-runs/:id` is never limited.
- The agent in these tests has no cases, so each POST returns 422 and the limiter still counts it. The test checks only "no 429 in the first ten" and "11th is 429".

## Skills applied
- preloaded: onion-architecture, frontend-ui-architecture (neither applies to test-only files).
- invoked through Skill: none. The plan lists zod and security for step 11, but I wrote no schemas or production code, so I skipped them. Logged under Deviations.
- named by the plan but not invoked: zod, security, fastify-best-practices, drizzle-orm-patterns (test-only lane).

## Self-review
- Tests only. Fixtures follow the `GatedLLM`/`makeAgent` and `brief-rate-limit` patterns. `eval-history` does not need a gated LLM because it never runs the model, so I used a plain `MockLLMProvider`. No issues found.

## Tests
| command | package | exit code | result |
|---|---|---|---|
| `pnpm exec tsc -p <temp tsconfig including the two files and src>`; temp file deleted | server | 0 | no errors (one implicit-any in my own file fixed first) |
| integration run | server | not run | no Docker; the main session runs both files |

Because I could not run them, I have no red run to record. Red-first means these fail without the lane-4 code. They were written against the committed lane-4 code and are expected to pass against it.

## Deviations from plan
- AC-28 has two extra tests (run-all limit, GET not limited) beyond the single required one. AC-47 has an extra 422 test.
- The AC-45 test also reads the agent dashboard `history`, which the plan row mentions ("Evals tab or per-agent dashboard").
- The AC-48 UI notice string "case set changed: +X / −Y" is client-side. The server test checks the `case_set` data it is built from.
- zod and security skills were not invoked, as noted above.

## Not done / blocked
- None. No production bug was found by reading. Confirm by running the files.

## Insight candidates
- server: BSD sed on macOS needs `sed -i ''`. A failed sed inside an `&&` chain silently skipped my tsc run. Run the typecheck on its own, not behind an `&&` chain.

## Handoff to reviewers
- Surfaces and files touched: `server/test/eval-history.it.test.ts`, `server/test/eval-rate-limit.it.test.ts`, both untracked and uncommitted.
- plan-verifier / main session: run `cd server && pnpm exec vitest run test/eval-history.it.test.ts test/eval-rate-limit.it.test.ts` with Docker.
  - AC-58 p95 may flake on a slow testcontainer (the plan's own risk note).
  - If the AC-47 or AC-48 delta assertions fail on float noise, I used `toBeCloseTo`, so look at the data first.
- main session: `git status` also shows `server/src/db/seed.ts` modified. It is not from this lane, so check it belongs to a sibling lane.
- No architecture, acceptance or security verdict is given here.