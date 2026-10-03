# State: onboarding-tour
Stage: 4 Close · next: push + PR on Glib's word
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
| fix round 2 gate: server | `pnpm typecheck` · unit · onboarding it (Docker) · `lint:boundaries` | fix 2 | 0 errors; 37 files / 365 tests; 3 files / 25 tests; no violations |
| fix round 2 gate: client | `pnpm typecheck` · `pnpm test` | fix 2 | 0 errors; 53 files / 313 tests |
| e2e hermetic | `E2E_PG_PORT=5633 E2E_API_PORT=3301 E2E_WEB_PORT=3300 npm run e2e:hermetic` | 183697a | 9/9 flows passed (first two runs invalid: e2e deps missing, then output truncated) |
| AC-40 demo (main session, browser) | honojs/hono indexed (423 files, full), Generate in the UI, model openrouter/openai/gpt-4.1-mini | 183697a | log: `llm_calls=1 tokens 2441/718 $0.0021 outcome=complete duration_ms=4521`; five sections rendered; Open → github blob at f23b146; screenshots in docs/plans/2026-10-02-onboarding-tour.assets/ |

## Findings ledger
| id | source | severity | kind | `path:line` | round opened | status | round closed |
|---|---|---|---|---|---|---|---|
| PROC-1 | main session | minor | process | server/test/onboarding-helpers.test.ts | level 1 | accepted — plan-verifier: all 8 can fail; two guard-level mutations (allow-list checks in mergeTour, extra slices in buildModelInput) are uncaught but redundant with the structure | review |
| PV-1 | plan-verifier | major | spec is wrong | client/.../TourHeader/TourHeader.tsx:47 | review | closed — Glib chose the built behaviour; spec AC-15 updated (66982e4), backfill test added | review |
| AR — | architecture-reviewer | — | — | — | review | pass, 0 findings | — |
| CR-1 | /code-review | major | local fix | client/.../TourSection/TourSection.tsx:26 | review | closed — architecture card renders stack chips and folder rows; test "skeleton architecture shows stack and folder rows with counts" red → green | fix 1 |
| CR-2 | /code-review | minor | local fix | client/.../OnboardingTourView/helpers.ts:47 | review | closed — labeled edges stripped before counting; tests red ("expected 12 to be 10", "expected 14 to be 13") → green | fix 1 |
| SR-1 | security-reviewer | minor | — | client/src/vendor/ui/primitives/Markdown.tsx:10-37 | review | closed — Glib: fix; overview renders images as alt text and links as text via local react-markdown renderers; test red (img present) → green | fix 2 |
| SR-2 | security-reviewer | minor | — | server/src/adapters/clone-scan/fs-clone-scanner.ts:84,59,44 | review | closed — Glib: fix; 64 KB capped reads, walk cap 200,000 (kept above the 5,000 index cap so AC-15's N < M rule still detects capped indexes); 3 tests red → green | fix 2 |
| PROC-2 | main session | minor | process | lanes 1, 2, 3, 6 | level 1 | accepted — plan-verifier: no AC, contract or step depends on a skill being invoked; each protected outcome has a test or quoted line | review |

## Log
- 2026-10-03 — pr-self-review (pre-PR, base 73d4922): ready, 7 minor client findings; Glib: fix before PR → fix round 3: 6 fixed (age text via i18n ICU select, STATUS_KEY to constants, share() timer cleared, spacing, contract types in the view test, waitFor instead of a 20 ms flush); 1 accepted (nav test asserts fontWeight because the vendored Sidebar exposes no aria-current); client tc 0, 53 files / 313 tests
- 2026-10-03 — plan-verifier delta at c20c73b: 0 not met, AC-40 partial → closed with two more screenshots; architecture delta pass; 41/41 met
- 2026-10-03 — e2e 9/9; AC-40 hono demo done (1 call, $0.0021, 4.5 s)
- 2026-10-03 — Glib: fix SR-1 and SR-2; fix round 2 done, gate green; walk cap raised from 5,000 to 200,000 by the main session (AC-15 regression risk)
- 2026-10-03 — security-reviewer: pass, SR-1/SR-2 minor; /code-review: CR-1, CR-2 → fix round 1 (lane 6), both closed; main session read the delta
- 2026-10-03 — plan-verifier: 58 met, 1 partial (AC-15 → PV-1), report docs/plans/2026-10-02-onboarding-tour.verify.md; architecture-reviewer: pass, 0 findings
- 2026-10-03 — level 2 lane 4 done; gate green; main session read every new *.it.test.ts (controls present: isolation marker in stored tour + review call made)
- 2026-10-03 — level 1 lanes 1, 2, 3, 5, 6 done; gate green
- 2026-10-03 — lane 0 implementer done; level 0 gate: only expected red
- 2026-10-02 — spec-creator: spec written, approved (6cd61e9), updated from planner findings (93a1c35)
- 2026-10-03 — implementation-planner: plan (3ea2947); S1–S5 signed off, ADR ../decisions/2026-10-03-onboarding-tour-architecture.md
- 2026-10-03 — cross-model review deepseek/deepseek-v3.2 (2ca3f5f); 7 findings applied (fa05fc5)
- 2026-10-03 — test-writer red-first: 6 files (e84d133), Status partial (lane-owned extra test files left to lanes, per plan)
