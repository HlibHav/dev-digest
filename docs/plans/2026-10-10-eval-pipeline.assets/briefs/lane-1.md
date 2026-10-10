# Lane brief (plan slice, verbatim)

# Implementation Plan: Eval Pipeline (regression cases from findings, suite runs, code-only scoring, dashboards)
Status: ready
Spec: specs/2026-10-10-eval-pipeline.md (SPEC-2026-10-10-eval-pipeline, approved by Glib 2026-10-10; proof tags updated in 3f6b113)
Execution mode: multi-agent, chosen by the user. Lanes run as sonnet implementers (`.claude/agents/README.md` table).
Save as: docs/plans/2026-10-10-eval-pipeline.md
Architecture decisions: `/Users/Glebazzz/Claude/PROJECTS/NEO/decisions/2026-10-10-eval-suite-runs-table.md` (Accepted, with Follow-up and Follow-up 2, both accepted by Glib)
reviewer-core: unchanged. `reviewPullRequest` already returns grounded findings, `dropped` with reasons, and `costUsd` (`reviewer-core/src/review/run.ts:103-121`), which is everything AC-14, AC-15 and AC-24 need.


## Constraints
- Contracts are additive. The existing `EvalCase`, `EvalCaseInput`, `EvalRunRecord`, `EvalRun`, `EvalTrendPoint` and `EvalDashboard` are unchanged; new nullable-metric shapes live in new names. Edit the server copy first, mirror byte-identically to the client, and check `diff server/src/vendor/shared/contracts/eval-pipeline.ts client/src/vendor/shared/contracts/eval-pipeline.ts` (empty). Source: `.claude/rules/shared-contracts.md:9-14`; main-session coordination.
- Schema changes go through `server/src/db/schema/eval.ts`, then `pnpm db:generate`, then `pnpm db:migrate` (local DB on port 5632 per `CLAUDE.local.md`). Never hand-edit `server/src/db/migrations/**`. Source: root `CLAUDE.md` Do-not-touch; `.claude/rules/db-schema.md:9-12`.
- Routes parse, call the service and map; no query, no adapter call. Composition goes in `modules/eval/wiring.ts` as `buildEvalService(container, log, opts)`. Source: `.claude/rules/onion-boundaries.md:16-20`; onion-architecture steps 2 and 3.
- `service.ts` and `case-runner.ts` import no `fastify`, `drizzle-orm`, `src/db/**` or adapter. `parseUnifiedDiff` and `container.llm` come in as ports; agent, skill and finding data comes through container repos in wiring. Source: `.claude/rules/onion-boundaries.md:21-29`.
- `scoring.ts` and `compare.ts` are pure: they import only types from `@devdigest/shared` and `./types.js`. No I/O, no clock, no randomness, no tokenizer. They will be mutation-tested later. Source: main-session coordination; spec NFR Performance.
- Background execution goes through the `background(task)` port filled in wiring with `void task().catch(log)`. No `container.jobs`. A boot reaper marks leftover `running` runs. Source: ADR follow-up 2 (`../decisions/2026-10-10-eval-suite-runs-table.md:50-56`).
- reviewer-core is not changed. Source: spec header; main-session coordination.
- Case text never enters trusted framing: `task = EVAL_TASK` (constant), and title and body go in `prDescription`. Provider error text shown to users is the fixed `CASE_ERROR`; raw text goes to the log after `redactSecrets`. Source: spec Untrusted inputs and NFR Security; `server/INSIGHTS.md:30`.
- Every route declares `schema.response` with the shared contract. Polled GETs (`/eval-suite-runs/:id`, `/eval-case-runs/:id`) set `config: { rateLimit: false }`. The three run POSTs set `{ max: 10, timeWindow: '1 minute' }`. Source: `server/INSIGHTS.md:14`; `server/src/modules/brief/routes.ts:23,34`.
- Client placement: pieces used by both `/agents/[id]` and `/eval/**` live in `client/src/components/eval/` (second consumer exists in this change, same shape as `components/diff-viewer/`). Everything else is colocated in `_components/<Name>/`. No new `export *`. Data flows through `src/lib/hooks/eval.ts` → `api`. Source: frontend-ui-architecture steps 1, 2, 6, 7, 8.
- Every user string comes from the `eval` namespace (plus existing `agents` tab and `shell` nav labels). Model output and case text render as text only, never Markdown, links or HTML. Source: spec NFR i18n and Security.
- `src/vendor/ui` is not edited, except the one nav item the main session approved in `client/src/vendor/ui/nav.ts`. Source: `client/AGENTS.md:21-22`; main-session coordination.
- `seed.ts` stays idempotent. Source: `.claude/rules/db-schema.md:17-18`.
- e2e flows read seeded data only and trigger no LLM call. Source: `e2e/docs/hermetic-stack.md:53`; `e2e/run.ts:16`.


## Skills for the implementer
- client/** → frontend-ui-architecture, next-best-practices, react-best-practices, react-testing-library, security, zod
- server/** → onion-architecture, fastify-best-practices, drizzle-orm-patterns, security, zod
- server/src/db/** → the server row plus postgresql-table-design
- e2e/** → no skill; follow `e2e/CLAUDE.md`


## Lanes (this lane's row)
| lane | steps | owned paths | after |
|---|---|---|---|
| 1 | 3, 4, 5 | `server/src/modules/eval/types.ts`, `server/src/modules/eval/constants.ts`, `server/src/modules/eval/helpers.ts`, `server/src/modules/eval/scoring.ts`, `server/src/modules/eval/compare.ts`, `server/test/eval-helpers.test.ts`, `server/test/eval-scoring.test.ts`, `server/test/eval-compare.test.ts` | 0 |

## Steps (this lane)
3. [BE] server — eval module types, constants and pure helpers
   - files: `server/src/modules/eval/types.ts`, `constants.ts`, `helpers.ts` (new); `server/test/eval-helpers.test.ts` (new)
   - layer: domain (pure, in module) · lane: 1
   - skills: onion-architecture, zod, security
   - turns green: AC-6
   - test first: `server/test/eval-helpers.test.ts`:
     - "AC-6": `caseNameFromFinding({file:'src/config.ts', start_line:12, title:'Hardcoded Stripe secret key in commit'})` returns `'src/config.ts:12 — Hardcoded Stripe secret key in commit'`.
     - "buildCaseDiff": `buildCaseDiff('src/b.ts', '@@ -1 +1 @@\n-a\n+b')` starts with `diff --git a/src/b.ts b/src/b.ts\n--- a/src/b.ts\n+++ b/src/b.ts\n`.
     - "diffBytes": `diffBytes('é') === 2`.
     - "redactSecrets": masks `sk-abc123…` and `Bearer xyz`.
   - interfaces: produces
     - `types.ts`:
       - `EvalAgent {id, name, model, provider: Provider, strategy: 'auto'|'single-pass'|'map-reduce', systemPrompt, version: number, enabled: boolean}`
       - `EvalSkill {id, name, version: number, body, untrusted: boolean}`
       - `EvalCaseRecord {id, workspaceId, agentId, name, inputDiff, inputMeta: EvalCaseMeta, expectedOutput: EvalExpectation[], notes: string|null, sourceFindingId: string|null, source: EvalCaseSource|null}`
       - `CaseRunRecord {id, caseId, caseName, suiteRunId: string|null, ranAt: Date, status: EvalCaseResultStatus, error: string|null, grounded: Finding[], dropped: EvalDroppedFinding[], matchedMustFind, mustFindTotal, noiseCount, recall, precision, citationAccuracy, durationMs, costUsd}` (numbers nullable as in the contract)
       - `SuiteRunRecord {id, workspaceId, agentId, runNumber, agentVersion, status: EvalSuiteStatus, error, startedAt: Date, finishedAt: Date|null, casesTotal, casesDone, casesPassed, casesErrored, recall, precision, citationAccuracy, costUsd, costPartial, durationMs, scoredCases: EvalScoredCase[], snapshot: EvalAgentSnapshot|null}`
       - `NewEvalCase = Omit<EvalCaseRecord,'id'>`
       - `EvalCaseEdit = Pick<EvalCaseRecord,'name'|'inputDiff'|'inputMeta'|'expectedOutput'|'notes'>`
       - `NewSuiteRun {workspaceId, agentId, agentVersion, casesTotal, snapshot: EvalAgentSnapshot}`
       - `SuiteFinish {status: 'done'|'partial'|'failed', error: string|null, casesPassed, casesErrored, recall, precision, citationAccuracy, costUsd, costPartial, durationMs, scoredCases}`
       - `CaseRunFinish {status: 'passed'|'failed'|'errored', error, grounded, dropped, matchedMustFind, mustFindTotal, noiseCount, recall, precision, citationAccuracy, durationMs, costUsd}`
       - `interface EvalStore` with exactly these methods:
         - `listCases(workspaceId, agentId): Promise<EvalCaseRecord[]>`
         - `countCasesByAgent(workspaceId): Promise<Map<string, number>>`
         - `getCase(workspaceId, caseId): Promise<EvalCaseRecord|undefined>`
         - `insertCase(input: NewEvalCase): Promise<{record: EvalCaseRecord; created: boolean}>`
         - `updateCase(workspaceId, caseId, edit: EvalCaseEdit): Promise<EvalCaseRecord|undefined>`
         - `deleteCase(workspaceId, caseId): Promise<boolean>`
         - `lastResults(caseIds: string[]): Promise<Map<string, CaseRunRecord>>`
         - `insertSuite(input: NewSuiteRun): Promise<SuiteRunRecord|'already_running'>`
         - `hasRunningSuite(agentId): Promise<boolean>`
         - `getSuite(workspaceId, id): Promise<SuiteRunRecord|undefined>` (with snapshot)
         - `listSuites(workspaceId, agentId): Promise<SuiteRunRecord[]>` (newest first, `snapshot: null`)
         - `recentSuites(workspaceId, limit): Promise<(SuiteRunRecord & {agentName: string})[]>`
         - `updateSuiteProgress(id, casesDone): Promise<boolean>`
         - `finishSuite(id, f: SuiteFinish): Promise<boolean>`
         - `insertCaseRun(caseId, suiteRunId: string|null): Promise<CaseRunRecord|undefined>`
         - `finishCaseRun(id, f: CaseRunFinish): Promise<boolean>`
         - `getCaseRun(workspaceId, id): Promise<CaseRunRecord|undefined>`
         - `caseRunsForSuite(suiteRunId): Promise<CaseRunRecord[]>`
         - `reapInterrupted(reason: string): Promise<{suites: number; caseRuns: number}>`
     - `constants.ts`:
       - limits: `MAX_CASES_PER_SUITE = 50`, `MAX_DIFF_BYTES = 65_536`, `REGRESSION_POINTS = 2`, `RECENT_RUNS_LIMIT = 20`, `RECALL_TREND_POINTS = 10`, `RUN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' }`
       - `EVAL_TASK` (fixed review instruction, no case text)
       - messages: `MSG.noPatch = "This PR's diff is not stored yet. Open the PR once and try again."`, `MSG.diffTooLarge = 'The diff is over the 64 KB limit.'`, `MSG.undecided = 'Accept or dismiss the finding first.'`, `MSG.noAgent = "This finding's review has no agent."`, `MSG.noCases = 'This agent has no eval cases. A suite run needs 1 to 50 cases.'`, `MSG.tooManyCases(n) = \`This agent has ${n} eval cases; a suite run is limited to 50.\``, `MSG.alreadyRunning = 'A suite run for this agent is already running.'`, `MSG.caseError = 'The model call failed or timed out.'`, `MSG.suiteFailed = 'The suite run stopped on an unexpected error.'`, `MSG.interrupted = 'interrupted'`, `MSG.emptyDiff = 'This case has no diff.'`, `MSG.compareInvalid = 'Compare needs two completed runs of the same agent.'`
     - `helpers.ts`:
       - `caseNameFromFinding(f: {file: string; start_line: number; title: string}): string`
       - `buildCaseDiff(path: string, patch: string): string`
       - `diffBytes(text: string): number` (TextEncoder byte length)
       - `prDescription(meta: EvalCaseMeta): string | undefined` (`title\n\nbody` trimmed, undefined when empty)
       - `redactSecrets(text: string): string`
   - verify: `cd server && pnpm exec vitest run test/eval-helpers.test.ts` → all pass

4. [BE] server — pure scoring module
   - files: `server/src/modules/eval/scoring.ts` (new); `server/test/eval-scoring.test.ts` (new)
   - layer: domain (pure) · lane: 1
   - skills: onion-architecture
   - turns green: AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-24, AC-56 (computation)
   - test first: `server/test/eval-scoring.test.ts`:
     - one `it` per AC with the spec's verify data;
     - "reversed finding range still matches" (finding 15–12 vs expectation 12–12 → match);
     - "AC-56 boundary in integer points" (0.89→0.87 alerts, 0.90→0.89 doesn't, a null on either side doesn't);
     - "aggregateSuite of zero scores → all null, 0 passed".
   - interfaces: consumes `EvalExpectation`, `EvalMetricName` (step 1). Produces:
     - `type Range = {file: string; start_line: number; end_line: number}`
     - `findingMatches(f: Range, e: EvalExpectation): boolean`
     - `interface CaseScore {matchedMustFind: number; mustFindTotal: number; matchedFindings: number; noiseFindings: number; grounded: number; dropped: number; passed: boolean}`
     - `scoreCase(expectations: readonly EvalExpectation[], grounded: readonly Range[], droppedCount: number): CaseScore`
     - `interface SuiteMetrics {recall: number|null; precision: number|null; citation_accuracy: number|null; cases_passed: number}`
     - `aggregateSuite(scores: readonly CaseScore[]): SuiteMetrics` (errored cases are never passed in; also used per case with `[score]`)
     - `suiteCost(costs: readonly (number|null)[]): {cost_usd: number|null; cost_partial: boolean}`
     - `regressionDrops(previous: Pick<SuiteMetrics,'recall'|'precision'|'citation_accuracy'>, latest: same): {metric: EvalMetricName; points: number}[]` (points = `Math.round(prev*100) - Math.round(latest*100)`, kept when ≥ `REGRESSION_POINTS`)
   - verify: `cd server && pnpm exec vitest run test/eval-scoring.test.ts` → all pass; `grep -n "^import" server/src/modules/eval/scoring.ts` shows only `import type` lines

5. [BE] server — pure compare module
   - files: `server/src/modules/eval/compare.ts` (new); `server/test/eval-compare.test.ts` (new)
   - layer: domain (pure) · lane: 1
   - skills: onion-architecture
   - turns green: none directly (feeds AC-47 and AC-48 in step 11)
   - test first: `server/test/eval-compare.test.ts`:
     - "lineDiff one changed line": `['equal','remove','add','equal']` ops for prompts differing in line 2;
     - "lineDiff never truncates": 2,000-line input gives 2,000+ entries;
     - "configChanges lists a skill version bump": `{kind:'skill_version', name, from:'1', to:'2'}`, plus model/provider/strategy and skill added/removed;
     - "caseSetChange {a,b,c}→{b,c,d,e} = {added:2, removed:1}";
     - "metricDeltas null when either side null; cost delta signed".
   - interfaces: produces
     - `lineDiff(oldText: string, newText: string): EvalPromptDiffLine[]` (LCS over lines; no dependency)
     - `configChanges(base: EvalAgentSnapshot, head: EvalAgentSnapshot): EvalConfigChange[]`
     - `caseSetChange(base: EvalScoredCase[], head: EvalScoredCase[]): {added: number; removed: number}`
     - `metricDeltas(base: EvalSuiteRunSummary, head: EvalSuiteRunSummary): EvalMetricDeltas`
   - verify: `cd server && pnpm exec vitest run test/eval-compare.test.ts` → all pass


## Red-first rows this lane turns green
- AC-6 → `server/test/eval-helpers.test.ts` — "AC-6 caseNameFromFinding gives 'src/config.ts:12 — Hardcoded Stripe secret key in commit'" (L1)
- AC-16, 17, 18, 19, 20, 21, 24, 56 → `server/test/eval-scoring.test.ts` — one `it` per AC named "AC-n …", using the spec's verify numbers (AC-17 recall 0.667, AC-19 precision 0.75, AC-20 0.9, AC-24 0.03 partial, AC-56 0.93→0.91 gives precision 2 pts and 0.01 gives none) (L1)

## Contracts & data
- **Shared contract:** `contracts/eval-pipeline.ts` (step 1), server first, client mirror identical, one barrel line in each `index.ts`. Existing eval contracts unchanged.
- **Migration:** generated `0015_*.sql` (step 2) via `pnpm db:generate`, applied with `pnpm db:migrate` on the 5632 DB.
- **i18n:** `client/messages/en/eval.json`. L5 adds these keys (English as shown); L6 and L7 consume them and add none (a missing key is reported as a deviation for the main session).
  - `finding`:
    - `turnInto` "Turn into eval case"
    - `hintUndecided` "Accept or dismiss first"
    - `hintNoAgent` "This finding's review has no agent"
    - `created` "Eval case added to {agent}"
    - `openCase` "Open in Evals"
  - `metric`:
    - `recall` "Recall", `precision` "Precision", `citation` "Citation accuracy", `passed` "Passed", `cost` "Cost"
    - `none` "—", `neverRun` "never run"
    - `runLabel` "run #{n} · agent v{v}"
    - `up` "up", `down` "down"
    - `partialCost` "partial"
  - `status`:
    - `running` "Running {done}/{total}"
    - `done` "done", `partial` "partial", `failed` "failed", `passed` "passed", `errored` "errored", `neverRun` "never run"
  - `evalsTab` additions:
    - `passing` "passing {passed} / {total}"
    - `matched` "matched {matched} of {expected} expected"
    - `chip.mustFind` "must find", `chip.mustNotFlag` "must NOT flag", `chip.expectClean` "expect clean", `chip.mixed` "{count} expectations"
    - `runAll` "Run all evals", `newEvalCase` "New eval case", `viewDashboard` "View full dashboard"
    - `createdFrom` "Created from PR #{number}"
    - `reveal` "Reveal", `hide` "Hide", `masked` "•••• credential hidden"
    - `runCase` "Run case", `deleteConfirm` "Delete eval case \"{name}\"?"
  - `caseEditor` additions:
    - `findingSkeleton` "Finding skeleton", `runOnSave` "Run on save"
    - `neverMatched` "This expectation can never be matched"
    - `nameRequired` "Name is required", `diffRequired` "Diff is required"
    - `cancel` "Cancel"
    - `lastRunErrored` "Last run errored"
    - `lastRunSummary` "matched {matched} of {expected} · {duration}s · {cost}"
  - `history`:
    - `title` "Recent runs", `ranAt` "Ran at", `run` "Run", `status` "Status"
    - `pass` "{passed}/{executed}", `errored` "{count} errored"
    - `select` "Select {label}", `compare` "Compare", `selected` "{count} selected"
  - `compare`:
    - `title` "Compare runs · {base} → {head}"
    - `promptDiff` "System prompt diff", `configChanges` "Configuration changes", `noConfigChanges` "No model, provider or skill changes"
    - `caseSetChanged` "case set changed: +{added} / −{removed}"
    - `old` "{label} (old)", `new` "{label} (new)", `close` "Close"
  - `trend`:
    - `title` "Metric trend", `tooltip` "{label} · {cost}", `textAlt` "Trend points"
  - `dashboard` additions:
    - `subtitle` "Regression harness across all reviewer agents · pick an agent to see its runs"
    - `agents` "Agents", `recentAll` "Recent eval runs · all agents"
    - `runAllAgents` "Run all agents", `runAllResult` "{started} started · {skipped} skipped"
    - `skip.disabled` "disabled", `skip.noCases` "no cases", `skip.tooManyCases` "too many cases", `skip.alreadyRunning` "already running"
    - `emptyTitle` "No eval cases yet", `emptyBody` "Turn an accepted or dismissed finding into an eval case, or create one on an agent's Evals tab."
    - `lastRun` "Last {label} · {date} · {passed}/{executed} pass"
    - `allAgents` "All agents", `runEvalAgent` "Run eval", `switchAgent` "Switch agent"
    - `regression` "{metrics} dropped on {label}", `regressionItem` "{metric} −{points} pts"
- **Seed:** the eval demo block in `server/src/db/seed.ts` (step 22), idempotent.


## Acceptance criteria these steps trace to (verbatim)
- AC-6 WHEN a case is created from a finding, the system shall name the case "<file>:<start_line> — <finding title>". — proof: red-first unit
- AC-16 The system shall count a grounded finding as matching an expectation when the file paths are equal and the finding's line range intersects the expectation's inclusive range. Severity, category and title are not compared. — proof: red-first unit
- AC-17 The system shall compute recall as the number of matched `must_find` expectations divided by the number of `must_find` expectations, pooled over every scored case in the suite run. With zero `must_find` expectations, recall is null. — proof: red-first unit
- AC-18 The system shall treat as noise every grounded finding that matches a `must_not_flag` expectation of its case, and every grounded finding in an "expect clean" case. A finding that matches both a `must_find` and a `must_not_flag` expectation of the same case counts as noise and not as a match. — proof: red-first unit
- AC-19 The system shall compute precision as matched findings ÷ (matched findings + noise findings), pooled over the suite run. Matched findings are the grounded findings that match a `must_find` expectation of their case. Every other grounded finding that is not noise is neutral and excluded, including a finding outside the `must_not_flag` range of a `must_not_flag` case. With zero matched and zero noise findings, precision is null. — proof: red-first unit
- AC-20 The system shall compute citation accuracy as the number of grounded findings divided by grounded plus dropped findings, pooled over the suite run. With zero findings in total, it is null. — proof: red-first unit
- AC-21 The system shall mark a case passed when every `must_find` expectation is matched and the case has no noise finding. Otherwise the case is failed. A `must_not_flag` or "expect clean" case with zero grounded findings passes. — proof: red-first unit
- AC-24 The system shall compute a suite run's cost as the sum of the known case costs, flagged partial when at least one executed case reported no cost. When no case reported a cost, the suite cost is null and shown as "—". — proof: red-first unit
- AC-47 WHEN the user selects exactly two `done` or `partial` suite runs of the same agent and activates Compare, the system shall show: for each metric and the cost: the older run's value, the newer run's value and the signed delta; a line-level diff of the two snapshots' system prompts; the model, provider or linked-skill changes between the two snapshots. — proof: red-first integration
- AC-48 WHEN the two compared runs scored different case sets (from each run's own list of scored cases, so deleted cases still count), the compare view shall show the notice "case set changed: +X / −Y". The deltas are still computed over each run's full set. — proof: red-first integration
- AC-56 WHEN an agent's latest completed suite run has any metric 0.02 or more below the same metric of its previous completed run (both non-null), the system shall show a regression banner. The banner names each dropped metric with its drop in points and the run label. — proof: red-first unit
