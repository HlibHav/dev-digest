# State: eval-pipeline
Stage: 3 Fix round 3 done · rounds exhausted · waiting for Glib on CR-16/20/21/23 remainders + CR-28..36
Spec: specs/2026-10-10-eval-pipeline.md (SPEC-2026-10-10-eval-pipeline) · Plan: docs/plans/2026-10-10-eval-pipeline.md · Mode: multi-agent
Inputs: prompt none · designs specs/designs/eval-pipeline/img1-6.png
Red-first: implementer-owned
Levels: 1 → L0 done · 2 → L1, L5 done · 3 → L2, L3, L6, L7 done · 4 → L4 done · 5 → L4b, L8 done
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
| eval history + rate-limit it (Docker, main session) | server: pnpm exec vitest run test/eval-history.it.test.ts test/eval-rate-limit.it.test.ts | level 5 | 8 passed (AC-58 p95 test 549 ms total) |
| all eval suites (unit + it, after seed change) | server: pnpm exec vitest run test/eval- | level 5 | 10 files, 99 passed |
| e2e hermetic | E2E_PG_PORT=5633 E2E_API_PORT=3301 E2E_WEB_PORT=3300 npm run e2e:hermetic | level 5 | 12/12 flows passed (after next.config extensionAlias fix + flow 12 fix) |
| eval-cases + eval-runs it (Docker, main session) | server: pnpm exec vitest run test/eval-cases.it.test.ts test/eval-runs.it.test.ts | level 4 | 29 passed (after L4 fix: GatedLLM did not record calls) |

## Findings ledger
| id | source | severity | kind | `path:line` | round opened | status | round closed |
|---|---|---|---|---|---|---|---|
| PV-1 | plan-verifier | partial | local fix (L6 test) | CaseEditor.test.tsx:106 AC-40 asserted file name only | review | closed | round 1 |
| PV-2 | plan-verifier | partial ×9 | red-first record (AC-9,12,29,35,38,39,41,43,44: no red run before code; mutation pairs only) | — | review | for Glib at close (cannot be fixed by code) | — |
| AR-1 | architecture-reviewer | major | local fix (server union) | server/src/modules/eval/wiring.ts:3 adapter import, lint:boundaries fails | review | closed | round 1 |
| AR-2 | architecture-reviewer | minor | local fix (L5) | client/src/components/eval/DeltaBadge single consumer | review | no change: 2 consumers (MetricStat, CompareModal) per L5 | round 1 |
| SR-1 | security-reviewer | minor | local fix (server union) | server/src/modules/eval/helpers.ts:22 redactSecrets narrow | review | closed | round 1 |
| SR-2 | security-reviewer | minor | local fix (L5) | client/src/lib/hooks/eval.ts ids unencoded | review | closed | round 1 |
| CR-1 | code-review | bug | L6 + L7 (+server check) | EvalsTab.tsx:45, AgentEvalDashboardView.tsx:31 resume reads latest (never running) | review | closed | round 1 |
| CR-2 | code-review | bug | server union | service.ts:221 finding range unchecked → 500 + broken case list | review | closed | round 1 |
| CR-3 | code-review | bug | L5 | hooks/eval.ts:119 no refresh when first poll is terminal | review | closed | round 1 |
| CR-4 | code-review | bug | server union | service.ts:579 case run left running on suite crash | review | closed | round 1 |
| CR-5 | code-review | bug | L5 | components/eval/helpers.ts:41 compare allows running | review | closed | round 1 |
| CR-6 | code-review | bug | L5 | hooks/eval.ts:133 dashboards don't poll while running | review | closed | round 1 |
| CR-7 | code-review | bug | L6 | CaseRow.tsx:32 start/poll errors swallowed, stuck running | review | closed | round 1 |
| CR-8 | code-review | bug | L5+L6 | CaseEditor.tsx:38 cases list not refreshed after run on save | review | closed | round 3 |
| CR-9 | code-review | efficiency | — | service.ts:475 N+1 / unbounded dashboard queries | review | deferred (AC-58 passes; for Glib) | — |
| CR-10 | code-review | cleanup | server union | service.ts:335 redundant runAll I/O, duplicate ratio | review | closed | round 1 |
| CR-11 | code-review r1 | bug (regression) | L6+L7 | EvalsTab.tsx:47 dashboard poll drops running suite before terminal → no invalidation | round 1 | closed | round 2 |
| CR-12 | code-review r1 | bug | server | helpers.ts:22 full-file finding 0..0 clamped to 1..1 never matches | round 1 | closed | round 3 |
| CR-13 | code-review r1 | bug | L6+L7 | EvalsTab.tsx:47 / AgentEvalDashboardView.tsx:33 finished startedId wins over newer running suite | round 1 | closed | round 2 |
| CR-14 | code-review r1 | efficiency | L5 | hooks/eval.ts:161 agent-dashboard poll duplicates suite poll; workspace poll N+1 every 1.5 s | round 1 | closed | round 2 |
| CR-15 | code-review r1 | bug | L6 | CaseRow.tsx:33 one transient poll error re-enables Play mid-run | round 1 | closed | round 2 |
| CR-16 | code-review r1 | bug | server | service.ts:590 crash-closed case run not counted as errored | round 1 | open after round 3 | — |
| CR-17 | code-review r1 | cleanup | server | types.ts:141 hasRunningSuite dead; runAll extra I/O on running agents | round 1 | closed | round 2 |
| CR-18 | code-review r1 | cleanup | L5+L6 | CaseEditor.tsx:44 duplicated terminal-refresh effect (belongs in useCaseRun) | round 1 | closed | round 2 |
| CR-19 | code-review r1 | bug | L6+L7 | EvalsTab.tsx:50 Run all re-enabled between start success and first poll | round 1 | closed | round 2 |
| CR-20 | code-review r2 | bug (regression of CR-16) | server | service.ts:596 crash path doesn't advance cases_done → executed count low/negative | round 2 | open after round 3 | — |
| CR-21 | code-review r2 | bug (regression of CR-19) | L6+L7 | EvalsTab/helpers.ts:160, AgentEvalDashboardView/helpers.ts:23 tracked id without data = running forever if first fetch fails | round 2 | open after round 3 | — |
| CR-22 | code-review r2 | bug (CR-12 too broad) | server | scoring.ts:34 start_line 0 matches every expectation; grounding keys on kind | round 2 | closed | round 3 |
| CR-23 | code-review r2 | bug (CR-15 side effect) | L5+L6 | hooks/eval.ts:106 persistent non-404 error polls forever, error hidden | round 2 | open after round 3 | — |
| CR-24 | code-review r2 | bug | L7 | AgentEvalDashboardView.tsx:40 stale history shows Running N/N after tracked cleared | round 2 | closed | round 3 |
| CR-25 | code-review r2 | bug | L6 | EvalsTab.tsx:39 tracked id not scoped to agent | round 2 | closed | round 3 |
| CR-26 | code-review r2 | cleanup | L5/L6/L7 | runningProgress duplicated in two route helpers | round 2 | closed | round 3 |
| CR-27 | code-review r2 | efficiency | server | service.ts:340 per-agent hasRunningSuite query | round 2 | closed | round 3 |
| CR-28 | code-review r3 | bug | client | eval-tracked-suite.ts:30 404 after a running response keeps the suite running forever (CR-21 remainder) | round 3 | open | — |
| CR-29 | code-review r3 | bug | client | hooks/eval.ts:112 failure counter counts retry attempts → one failed poll stalls polling (CR-23 remainder) | round 3 | open | — |
| CR-30 | code-review r3 | bug | client | CaseEditor.tsx:83 ignores stalled/error → 'running' forever | round 3 | open | — |
| CR-31 | code-review r3 | bug | server | scoring.ts:45 precise secret_leak/hook finding treated as whole-file (kind alone) | round 3 | open | — |
| CR-32 | code-review r3 | bug | client | eval-tracked-suite.ts:30 failed first fetch marks a running suite settled; history row ignored | round 3 | open | — |
| CR-33 | code-review r3 | bug | server | service.ts:586 insertCaseRun throw not counted (CR-20 remainder) | round 3 | open | — |
| CR-34 | code-review r3 | efficiency | client | hooks/eval.ts:137 spreading query result defeats tracked props | round 3 | open | — |
| CR-35 | code-review r3 | cleanup | server | scoring.ts:12 FULL_FILE_KINDS hand-copied from reviewer-core | round 3 | open | — |
| CR-36 | code-review r3 | bug | server | scoring.ts:75 whole-file finding with no open must_find still counted matched (precision inflated) | round 3 | open | — |
| PV-4 | plan-verifier r3 | doc | plan | docs/plans/2026-10-10-eval-pipeline.md:346 still names hasRunningSuite | round 3 | open (plan doc drift; /implement doesn't rewrite plans) | — |
| PV-3 | plan-verifier | partial | flow 10 uses `agent-browser select` (TESTING.md:96 allows open/wait/find) | e2e/specs/10-eval-dashboard.flow.json | review | for Glib at close | — |

## Log
- 2026-10-10 — plan 9138e20 approved by Glib ("так, погоджую, запускай"); briefs in docs/plans/2026-10-10-eval-pipeline.assets/briefs/
- 2026-10-10 — L0 done (after one fix pass: plan-named skills not loaded first time); gate green; committed
- 2026-10-10 — L1 + L5 done, gate green, committed 2c6bd5f; reports saved in .assets/reports/; level 3 launched (task ids: L2 a7e2415548759fc3a, L3 ab7a79c161fb7ac7e, L6 a9c4d88a7db53a2ce, L7 af02cd2b3d527b4bb)
- 2026-10-10 — level 3 done. Notes for plan-verifier: L3 service tests written after code (no red run; no Red-first row tagged L3); L6 red-first proven by mutation pairs (fix pass); L7 fix pass loaded security+zod and added agentId zod check; L2 loaded skills after writing (deviation recorded). Open for security-reviewer: L5 hooks interpolate ids into API paths unencoded.
- 2026-10-10 — L4 done (1 fix: AC-14 test bug), committed; level 5 launched
- 2026-10-10 — level 5 done. Browser check found every page 500 (Next can't resolve .js specifiers in vendored contract eval-pipeline.ts); Glib chose next.config extensionAlias (ADR ../decisions/2026-10-10-client-resolves-js-specifiers.md); flow 12 clicked an already-expanded finding (fixed). e2e 12/12.
- 2026-10-10 — plan-verifier: gaps (42 met / 10 partial / 0 not met / 6 unverifiable: e2e+browser are main session; e2e 12/12 ran on the tree committed as 61327e3). PV-1 fixed by L6. architecture-, security-reviewer and /code-review launched in parallel on 61327e3.
- 2026-10-10 — security-reviewer pass (2 minor); architecture-reviewer fail (AR-1 major); /code-review 10 items. Fix round 1 launched in parallel: server union (L3 agent), L5, L6, L7.
- 2026-10-10 — round 1 fixes done; gate: server tsc 0, lint:boundaries 0, unit 544; it 217 (hasDocker probe flaked under load in one full run, re-run of affected files green); client tsc 0, 492 passed. Out-of-lane edit: server/src/platform/container.ts parseDiff (for AR-1).
- 2026-10-10 — round-1 re-review: security pass (SR-1/2 closed), architecture pass (AR-1/2 closed), plan-verifier PV-1 closed / no AC regressed, code-review: 8 of 9 closed, CR-8 partial, 9 new (CR-11..19). Open must-close went 11 → 7 bugs. Round 2 launched.
- 2026-10-10 — round 2 fixes done; gate: server tsc 0, lint 0, unit 548, eval suites 106; client tsc 0, 503 passed; e2e 12/12.
- 2026-10-10 — round-2 re-review: security pass, plan-verifier no regressions; code-review: 7 closed, 3 partial (CR-8, 12, 16), new CR-20..27 incl. 4 regressions. Stop rule hit (must-close count did not drop) → asked Glib.
- 2026-10-11 — Glib chose a final round 3 with a rebuild (e5d9639). Server: kind-based full-file scoring (one whole-file finding satisfies at most one must_find), crash path advances cases_done, one agentsWithRunningSuite query. Client: shared useTrackedSuite (client/src/lib/hooks/eval-tracked-suite.ts), both runningProgress copies deleted, CaseRow follows newest run, every editor close hands up, useCaseRun stalls after 3 failures. Gate: server tsc 0, lint 0, unit 552, it 217 (Docker Desktop had to be started; `docker info` >5 s right after start makes every it suite skip); client tsc 0, 518; e2e 12/12 (one run failed on agent-browser daemon start, re-run green).
- 2026-10-11 — round-3 re-review: architecture pass; plan-verifier no regressions (PV-4 doc drift); code-review: CR-8/12/22/24/25/26/27 closed, CR-16/20/21/23 partial, 9 new (CR-28..36, 6 bugs). Three rounds used → to Glib.
