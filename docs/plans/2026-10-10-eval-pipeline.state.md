# State: eval-pipeline
Stage: 1 Implement · next: level 5 (L4b, L8)
Spec: specs/2026-10-10-eval-pipeline.md (SPEC-2026-10-10-eval-pipeline) · Plan: docs/plans/2026-10-10-eval-pipeline.md · Mode: multi-agent
Inputs: prompt none · designs specs/designs/eval-pipeline/img1-6.png
Red-first: implementer-owned
Levels: 1 → L0 done · 2 → L1, L5 done · 3 → L2, L3, L6, L7 done · 4 → L4 done · 5 → L4b (eval-history + eval-rate-limit it tests, split from L4), L8
Main-session amendments: AC-40 is red-first unit in L6 CaseEditor.test.tsx (spec 6f7c2a3), dropped from L8's e2e flow. L4 split: L4 writes code + eval-cases/eval-runs it tests; L4b writes eval-history/eval-rate-limit it tests.
Baseline: onion-skill-evals worktree clean; main checkout has foreign `M server/package.json`, `M server/pnpm-lock.yaml`, `?? benchmarks/` (untouched).
Expected red:

## Checks already run
| check | command | head sha | result line |
|---|---|---|---|
| migrate | server: pnpm db:migrate (5632) | L1 gate | ✓ migrations applied (0015_redundant_kang) |
| server typecheck | server: pnpm typecheck | L1 gate | clean |
| server unit | server: pnpm exec vitest run --exclude '**/*.it.test.ts' | L1 gate | 481 passed |
| client typecheck | client: pnpm typecheck | L1 gate | clean |
| client unit | client: pnpm test | L1 gate | 426 passed |
| server gate | typecheck + unit | 2c6bd5f | clean · 514 passed |
| client gate | typecheck + test | 2c6bd5f | clean · 445 passed |
| server gate | typecheck + unit | level 3 | exit 0 · 541 passed |
| client gate | typecheck + test | level 3 | exit 0 · 483 passed |
| server gate | typecheck + unit | level 4 | exit 0 · 541 passed |
| eval-cases + eval-runs it (Docker, main session) | server: pnpm exec vitest run test/eval-cases.it.test.ts test/eval-runs.it.test.ts | level 4 | 29 passed (after L4 fix: GatedLLM did not record calls) |

## Findings ledger
| id | source | severity | kind | `path:line` | round opened | status | round closed |

## Log
- 2026-10-10 — plan 9138e20 approved by Glib ("так, погоджую, запускай"); briefs in docs/plans/2026-10-10-eval-pipeline.assets/briefs/
- 2026-10-10 — L0 done (after one fix pass: plan-named skills not loaded first time); gate green; committed
- 2026-10-10 — L1 + L5 done, gate green, committed 2c6bd5f; reports saved in .assets/reports/; level 3 launched (task ids: L2 a7e2415548759fc3a, L3 ab7a79c161fb7ac7e, L6 a9c4d88a7db53a2ce, L7 af02cd2b3d527b4bb)
- 2026-10-10 — level 3 done. Notes for plan-verifier: L3 service tests written after code (no red run; no Red-first row tagged L3); L6 red-first proven by mutation pairs (fix pass); L7 fix pass loaded security+zod and added agentId zod check; L2 loaded skills after writing (deviation recorded). Open for security-reviewer: L5 hooks interpolate ids into API paths unencoded.
- 2026-10-10 — L4 done (1 fix: AC-14 test bug), committed; level 5 launched
