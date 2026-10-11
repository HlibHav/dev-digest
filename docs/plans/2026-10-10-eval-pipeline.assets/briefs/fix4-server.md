# Fix brief: eval pipeline, extra round 4 (server + reviewer-core)

Mode: fix. Red-first: implementer-owned (write the failing test, run it, record the red line, then fix).
Worktree: /Users/Glebazzz/Claude/PROJECTS/NEO/dev-digest/.claude/worktrees/eval-pipeline. Do not commit.
Owned paths: server/src/modules/eval/**, server/test/eval-*.test.ts, reviewer-core/src/grounding.ts (+ its test). Nothing in client/.
Skills: onion-architecture (preloaded), plus whatever the touched files need.
Budget: <= 80 tool calls or 30 min, then stop and write the report as-is.
Full finding text: docs/plans/2026-10-10-eval-pipeline.assets/reports/review3-code-review.md.

Glib approved one narrow round beyond the 3-round limit. Fix exactly these ids, nothing else:

- CR-31 (scoring.ts:45): a finding is whole-file only when its kind is in FULL_FILE_KINDS AND its range is 0..0. A precisely cited secret_leak/hook (e.g. 5..5) is matched by line intersection like any other finding.
- CR-36 (scoring.ts:75): a whole-file finding counts in matchedFindings only when it actually takes an open must_find. One that takes nothing is neither matched nor noise (noise stays = must_not_flag hit or any finding in an expect-clean case).
- CR-35 (scoring.ts:12): export FULL_FILE_KINDS from reviewer-core/src/grounding.ts and import it in scoring.ts (raw TS via the existing path alias / how server already imports reviewer-core). scoring.ts must stay pure (no I/O); `pnpm lint:boundaries` must pass.
- CR-33 (service.ts:586, CR-16/20 remainder): if insertCaseRun (or updateSuiteProgress after a case) throws inside executeSuite, that case is counted as errored and cases_done advances, the same as a throw inside runOne. No case-run row is left `running`.

Checks to run and paste in the report: reviewer-core `npm run typecheck && npm test`; server `pnpm typecheck`, `pnpm lint:boundaries`, `pnpm exec vitest run --exclude '**/*.it.test.ts'`. If Docker is up (`docker info` < 5 s), also `pnpm exec vitest run test/eval-` (integration incl.).

Report: docs/plans/2026-10-10-eval-pipeline.assets/reports/fix4-server.md — per id: test name, red line, green line, files touched.
