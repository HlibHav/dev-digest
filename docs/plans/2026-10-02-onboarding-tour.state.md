# State: onboarding-tour
Stage: 1 Implement · next: level 2 (lane 4 onboarding service)
Spec: specs/2026-10-02-onboarding-tour.md (SPEC-2026-10-02-onboarding-tour) · Plan: docs/plans/2026-10-02-onboarding-tour.md · Mode: multi-agent
Inputs: prompt none · designs specs/designs/onboarding-tour/tour-top.png, specs/designs/onboarding-tour/tour-run-and-reading.png
Red-first: test-writer (e84d133); red tests are read-only for implementers
Levels: 0 → lane 0 → done · 1 → lanes 1, 2, 3, 5, 6 → done · 2 → lane 4 → pending
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

## Findings ledger
| id | source | severity | kind | `path:line` | round opened | status | round closed |
|---|---|---|---|---|---|---|---|
| PROC-1 | main session | minor | process | server/test/onboarding-helpers.test.ts | level 1 | open — lane 3 appended 8 tests after the code (never red); plan-verifier to confirm each can fail | |
| PROC-2 | main session | minor | process | lanes 1, 2, 3, 6 | level 1 | open — plan-named skills not invoked (drizzle-orm-patterns, security, zod, next/react-best-practices, react-testing-library); reviewers check against them | |

## Log
- 2026-10-03 — level 1 lanes 1, 2, 3, 5, 6 done; gate green
- 2026-10-03 — lane 0 implementer done; level 0 gate: only expected red
- 2026-10-02 — spec-creator: spec written, approved (6cd61e9), updated from planner findings (93a1c35)
- 2026-10-03 — implementation-planner: plan (3ea2947); S1–S5 signed off, ADR ../decisions/2026-10-03-onboarding-tour-architecture.md
- 2026-10-03 — cross-model review deepseek/deepseek-v3.2 (2ca3f5f); 7 findings applied (fa05fc5)
- 2026-10-03 — test-writer red-first: 6 files (e84d133), Status partial (lane-owned extra test files left to lanes, per plan)
