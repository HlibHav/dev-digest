# State: onboarding-tour
Stage: 4 Close · next: e2e, minor findings to Glib, AC-40 demo, insights
Spec: specs/2026-10-02-onboarding-tour.md (SPEC-2026-10-02-onboarding-tour) · Plan: docs/plans/2026-10-02-onboarding-tour.md · Mode: multi-agent
Inputs: prompt none · designs specs/designs/onboarding-tour/tour-top.png, specs/designs/onboarding-tour/tour-run-and-reading.png
Red-first: test-writer (e84d133); red tests are read-only for implementers
Levels: 0 → lane 0 → done · 1 → lanes 1, 2, 3, 5, 6 → done · 2 → lane 4 → done
Expected red: server/test/onboarding-helpers.test.ts — level 1 (lane 3); client OnboardingTourNav.test.tsx — level 1 (lane 5); client OnboardingTourView.test.tsx — level 1 (lane 6); onboarding-service.it / onboarding-review-isolation.it (load-time) — level 2 (lane 4); server typecheck after lane 0 (RepoIntelService vs extended RepoIntel) — level 1 (lane 1)

## Checks already run
| check | command | head sha | result line |
|---|---|---|---|
| red-first unit (test-writer) | `pnpm --dir server exec vitest run test/onboarding-helpers.test.ts` | e84d133 | Failed to load url ../src/modules/onboarding/helpers.js |
| red-first component (test-writer) | `pnpm --dir client exec vitest run src/components/app-shell/OnboardingTourNav.test.tsx` | e84d133 | AC-1 no link /onboarding tour/i; AC-2 activeKeyFor('/onboarding') = 'onboarding-tour' |
| red-first component (test-writer) | `pnpm --dir client exec vitest run 'src/app/repos/[repoId]/onboarding'` | e84d133 | Failed to resolve import "./OnboardingTourView" |
| level 0 gate: server typecheck | `cd server && pnpm typecheck` | lane 0 | expected red only: RepoIntelService missing getRankedFiles, getRoutes (service.ts:101, container.ts:134-135) |
| level 0 gate: client typecheck | `cd client && pnpm typecheck` | lane 0 | expected red only: OnboardingTourView.test.tsx(99,36) TS2307 |
| level 0 gate: server unit | `pnpm exec vitest run --exclude '**/*.it.test.ts'` | lane 0 | 35 files passed, 1 failed (onboarding-helpers, expected); 343 tests passed |
| level 0 gate: client unit | `pnpm test` | lane 0 | 50 files passed, 2 failed (expected red-first); 271 passed, 2 failed |
| level 1 gate: server typecheck | `cd server && pnpm typecheck` | level 1 | 0 errors |
| level 1 gate: client typecheck | `cd client && pnpm typecheck` | level 1 | 0 errors |
| level 1 gate: server unit | `pnpm exec vitest run --exclude '**/*.it.test.ts'` | level 1 | 37 files, 362 tests passed |
| level 1 gate: client unit | `pnpm test` | level 1 | 53 files, 307 tests passed |
| lane 1 integration (implementer, Docker) | `pnpm exec vitest run test/repo-intel-onboarding-reads.it.test.ts` | level 1 | 2 passed (red before code: getRankedFiles/getRoutes not functions) |
| level 2 gate: server typecheck | `cd server && pnpm typecheck` | level 2 | 0 errors |
| level 2 gate: server unit | `pnpm exec vitest run --exclude '**/*.it.test.ts'` | level 2 | 37 files, 362 tests passed |
| onboarding integration (main session, Docker) | `pnpm exec vitest run test/onboarding.it.test.ts test/onboarding-service.it.test.ts test/onboarding-review-isolation.it.test.ts test/repo-intel-onboarding-reads.it.test.ts` | level 2 | 4 files, 27 tests passed, 0 skipped |
| lane 4 red run (implementer, Docker) | same three onboarding it files | before lane 4 | onboarding.it 15 failed (404 / waitReady); service.it and isolation.it failed at load on wiring.js |
| plan-verifier (Docker) | `pnpm --dir server exec vitest run .it.test` | ab9de07 | 19 files, 128 tests passed, 0 skipped |
| architecture-reviewer | `pnpm lint:boundaries` · `vitest run test/route-adapter-calls.test.ts` | ab9de07 | no violations (191 modules); 8 passed |
| AC-16 isolation grep (main session) | `grep -rn "modules/onboarding\|t\.onboarding" server/src reviewer-core/src` outside the module | 66982e4 | 0 hits |
| AC-15 backfill mutant (main session) | drop the `status === "full"` guard in TourHeader.tsx, run the view test, revert | 66982e4 | 2 failed (both new AC-15 cases); reverted |
| fix round 1 gate: client | `pnpm typecheck` · `pnpm test` | fix 1 | 0 errors; 53 files, 312 tests passed |

## Findings ledger
| id | source | severity | kind | `path:line` | round opened | status | round closed |
|---|---|---|---|---|---|---|---|
| PROC-1 | main session | minor | process | server/test/onboarding-helpers.test.ts | level 1 | open — lane 3 appended 8 tests after the code (never red); plan-verifier to confirm each can fail | |
| PV-1 | plan-verifier | major | spec is wrong | client/.../TourHeader/TourHeader.tsx:47 | review | closed — Glib chose the built behaviour; spec AC-15 updated (66982e4), backfill test added | review |
| AR — | architecture-reviewer | — | — | — | review | pass, 0 findings | — |
| CR-1 | /code-review | major | local fix | client/.../TourSection/TourSection.tsx:26 | review | closed — architecture card renders stack chips and folder rows; test "skeleton architecture shows stack and folder rows with counts" red → green | fix 1 |
| CR-2 | /code-review | minor | local fix | client/.../OnboardingTourView/helpers.ts:47 | review | closed — labeled edges stripped before counting; tests red ("expected 12 to be 10", "expected 14 to be 13") → green | fix 1 |
| SR-1 | security-reviewer | minor | — | client/src/vendor/ui/primitives/Markdown.tsx:10-37 | review | open — model-written overview can render a remote image / link; to Glib | |
| SR-2 | security-reviewer | minor | — | server/src/adapters/clone-scan/fs-clone-scanner.ts:84,59,44 | review | open — README/package.json read fully before slicing; no walk cap; to Glib | |
| PROC-2 | main session | minor | process | lanes 1, 2, 3, 6 | level 1 | open — plan-named skills not invoked (drizzle-orm-patterns, security, zod, next/react-best-practices, react-testing-library); reviewers check against them | |

## Log
- 2026-10-03 — security-reviewer: pass, SR-1/SR-2 minor; /code-review: CR-1, CR-2 → fix round 1 (lane 6), both closed; main session read the delta
- 2026-10-03 — plan-verifier: 58 met, 1 partial (AC-15 → PV-1), report docs/plans/2026-10-02-onboarding-tour.verify.md; architecture-reviewer: pass, 0 findings
- 2026-10-03 — level 2 lane 4 done; gate green; main session read every new *.it.test.ts (controls present: isolation marker in stored tour + review call made)
- 2026-10-03 — level 1 lanes 1, 2, 3, 5, 6 done; gate green
- 2026-10-03 — lane 0 implementer done; level 0 gate: only expected red
- 2026-10-02 — spec-creator: spec written, approved (6cd61e9), updated from planner findings (93a1c35)
- 2026-10-03 — implementation-planner: plan (3ea2947); S1–S5 signed off, ADR ../decisions/2026-10-03-onboarding-tour-architecture.md
- 2026-10-03 — cross-model review deepseek/deepseek-v3.2 (2ca3f5f); 7 findings applied (fa05fc5)
- 2026-10-03 — test-writer red-first: 6 files (e84d133), Status partial (lane-owned extra test files left to lanes, per plan)
