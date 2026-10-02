# State: project-context
Stage: 3 Fix round 1 done · next: delta plan-verifier + architecture/security/code-review in parallel
Spec: specs/2026-10-02-project-context.md (SPEC-2026-10-02-project-context) · Plan: docs/plans/2026-10-02-project-context.md · Mode: multi-agent
Inputs: prompt none · designs design-1..4.png in the session scratchpad (S3 sources listed in the spec's Input provenance)
Red-first: implementer-owned
Levels: L0 → lane 0 → done · L1 → lanes 1, 4, 5, 6 → done · L2 → lane 2 → done · L3 → lane 3 → done
Expected red: —

## Checks already run
| check | command | head sha | result line |
|---|---|---|---|
| L0 server typecheck | cd server && pnpm typecheck | dc93891+L0 | exit 0 |
| L0 server unit | pnpm exec vitest run --exclude **/*.it.test.ts | dc93891+L0 | 31 files, 317 passed |
| L0 reviewer-core | npm run typecheck · npm test | dc93891+L0 | exit 0 · 5 files, 57 passed |
| L0 client | pnpm typecheck · pnpm test | dc93891+L0 | exit 0 · 41 files, 213 passed |
| L1 reviewer-core | npm run typecheck · npm test | ebf36fa+L1 | exit 0 · 6 files, 64 passed |
| L1 server | pnpm typecheck · vitest --exclude it | ebf36fa+L1 | exit 0 · 31 files, 317 passed |
| L1 client | pnpm typecheck · pnpm test | ebf36fa+L1 | exit 0 · 50 files, 265 passed |
| L2 server | pnpm typecheck · vitest --exclude it | 9ab573e+L2 | exit 0 · 33 files, 335 passed |
| L2 server it (lane 2 run, Docker) | vitest run test/project-context.it.test.ts | 9ab573e+L2 | 11 passed (implementer-reported) |
| L3 server | pnpm typecheck · vitest --exclude it | 678f4f9+L3 | exit 0 · 33 files, 335 passed |
| L3 server it (lane 3 run, Docker) | vitest run test/project-context-run.it.test.ts | 678f4f9+L3 | 10 passed (implementer-reported) |
| R1 server | pnpm typecheck · vitest --exclude it | 5bfc60a+R1 | exit 0 · 33 files, 335 passed |
| R1 client | pnpm typecheck · pnpm test | 5bfc60a+R1 | exit 0 · 50 files, 265 passed |

## Findings ledger
| id | source | severity | kind | `path:line` | round opened | status (open / closed / accepted / deferred) | round closed |
|---|---|---|---|---|---|---|---|
| MS-2 / PV-1 | main session + plan-verifier | major | local fix (lane 2) | `server/src/adapters/docs/fs-repo-docs.ts` | MAX_DOC_BYTES 1 MiB cap contradicts NC-4b (no max size) | L2 | closed | R1 |
| MS-1 | main session (design check) | minor | local fix (lane 4) | `client/src/vendor/ui/nav.ts:37` SKILLS LAB vs design WORKSPACE | L1 | closed | R1 |
| PV-2 | plan-verifier | must close (AC-33 partial) | local fix (lane 3) | `server/src/modules/reviews/run-executor.ts` specsRead drops modified_by_pr (R34) | R1 | closed | R1 |
| PV-3 | plan-verifier | not met (review focus) | accepted deviation, pending user | `server/src/app.ts:116` duplicate-path PUT → 422 not 400 (app-wide zod mapping; spec names no code) | R1 | open | |
| PV-5 | lane 2 report | major (product decision) | spec question | `server/src/adapters/tokenizer/index.ts` js-tiktoken stalls >10 min on a 1 MiB single-char run; with no size cap a pathological repo .md stalls the scan | R1 | open, ask Glib | |
| PV-4 | plan-verifier | must close (AC-35 partial) | local fix (lane 3) | `server/test/project-context-run.it.test.ts` asserts specs_tokens > 0 only | R1 | closed | R1 |

## Log
- 2026-10-02 — /implement started at dc93891 on feat/project-context; lane slices extracted from the plan
- 2026-10-02 — L0 lane 0 done (migration 0014; PUT for attachment writes; hooks imported from lib/hooks/project-context, not hooks/index); gate green; pre-existing vendor drift in eval-ci/knowledge/productionize untouched
- 2026-10-02 — L1 done: lanes 1, 4, 5, 6. Plan gap: `client/src/app/agents/[id]/page.tsx` VALID_TABS lacked "context"; main session granted lane 5 that file, fixed with page.test.tsx. MS-1: nav item placed in SKILLS LAB, design-1/2 show it under WORKSPACE. Gate green.
- 2026-10-02 — L2 lane 2 done. Deviations: PUT validation 422 (app-wide zod mapping, spec names no code); 1 MiB doc cap (MS-2, contradicts NC-4b); agent inherited list not deduped against own (AC-14 dedup to be checked by plan-verifier). Gate green.
- 2026-10-02 — L3 lane 3 done: resolver port in run-executor, wired in reviews/routes.ts (app.ts ReviewService only reaps stale runs, needs no resolver). Plan "review-focus" run cases not mapped to lane 3 rows; plan-verifier to judge. Gate green.
- 2026-10-02 — plan-verifier at 5bfc60a: gaps (24 met, 20 partial, 1 not met). 18 partials are "no red run recorded" only — main-session brief condensed reports and dropped the lanes' red-run tables (lanes 2,4,5,6 did report red runs); not code gaps. Integration 15 files / 88 passed. Fix round 1: PV-1 lane 2, PV-2+PV-4 lane 3, MS-1 lane 4.
- 2026-10-02 — Fix round 1: PV-1 (cap removed, >1 MiB test red→green), PV-2 (specs_read includes modified_by_pr, red→green), PV-4 (exact specs_tokens assertion), MS-1 (nav in WORKSPACE, red→green). New PV-5: tokenizer stall risk without a size cap. Gate green; project-context it tests run by lanes (12 + 10 passed), plan-verifier to confirm.
