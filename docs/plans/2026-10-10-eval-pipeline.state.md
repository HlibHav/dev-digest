# State: eval-pipeline
Stage: 1 Implement · next: level 2 (L1, L5)
Spec: specs/2026-10-10-eval-pipeline.md (SPEC-2026-10-10-eval-pipeline) · Plan: docs/plans/2026-10-10-eval-pipeline.md · Mode: multi-agent
Inputs: prompt none · designs specs/designs/eval-pipeline/img1-6.png
Red-first: implementer-owned
Levels: 1 → L0 done · 2 → L1, L5 · 3 → L2, L3, L6, L7 · 4 → L4 · 5 → L4b (eval-history + eval-rate-limit it tests, split from L4), L8
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

## Findings ledger
| id | source | severity | kind | `path:line` | round opened | status | round closed |

## Log
- 2026-10-10 — plan 9138e20 approved by Glib ("так, погоджую, запускай"); briefs in docs/plans/2026-10-10-eval-pipeline.assets/briefs/
- 2026-10-10 — L0 done (after one fix pass: plan-named skills not loaded first time); gate green; committed
