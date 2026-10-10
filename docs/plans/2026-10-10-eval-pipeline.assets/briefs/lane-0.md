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
| 0 | 1, 2 | `server/src/vendor/shared/contracts/eval-pipeline.ts`, `server/src/vendor/shared/index.ts`, `client/src/vendor/shared/contracts/eval-pipeline.ts`, `client/src/vendor/shared/index.ts`, `server/src/db/schema/eval.ts`, `server/src/db/schema.ts`, `server/src/db/migrations/**` (generated only), `server/test/eval-contract.test.ts` | — |

## Steps (this lane)
1. [BE] shared — eval-pipeline contracts plus client mirror
   - files: `server/src/vendor/shared/contracts/eval-pipeline.ts` (new); `server/src/vendor/shared/index.ts` (changed: `export * from './contracts/eval-pipeline.js';`); `client/src/vendor/shared/contracts/eval-pipeline.ts` (new, identical); `client/src/vendor/shared/index.ts` (changed, same line); `server/test/eval-contract.test.ts` (new)
   - layer: contract · lane: 0
   - skills: zod, security
   - turns green: AC-1
   - test first: `server/test/eval-contract.test.ts` "AC-1": `EvalExpectedOutput.safeParse` accepts `[]`, one `must_find` and one `must_not_flag`. It rejects an item with no `type`, no `file`, or `start_line > end_line`, and the issue path names the field. Unknown keys are stripped.
   - interfaces: produces these zod schemas and types of the same name, all snake_case:
     - `EvalExpectationType` (`'must_find'|'must_not_flag'`)
     - `EvalExpectation` (`{type, file: string min 1, start_line: int ≥ 1, end_line: int ≥ 1, severity?, category?, title?}`, refined `end_line >= start_line` with path `['end_line']`)
     - `EvalExpectedOutput = z.array(EvalExpectation)`
     - `EvalCaseMeta {title: string, body: string}`
     - `EvalCaseSource {repo_id, pr_id, pr_number: int}`
     - `EvalCaseResultStatus` (`running|passed|failed|errored`)
     - `EvalCaseLastResult {status: passed|failed|errored, matched: int, expected: int, duration_ms: int|null, cost_usd: number|null, ran_at: string}`
     - `EvalCaseView = EvalCase.extend({ agent_id: string, input_meta: EvalCaseMeta, expected_output: EvalExpectedOutput, source_finding_id: string|null, source: EvalCaseSource|null, last_result: EvalCaseLastResult|null })`
     - `EvalCaseWrite {name: min 1, input_diff: min 1, input_meta: EvalCaseMeta, expected_output: EvalExpectedOutput, notes: string|null optional}`
     - `EvalCaseCreated {case: EvalCaseView, agent: {id, name}}`
     - `EvalDroppedFinding {finding: Finding, reason: string}`
     - `EvalCaseResult {id, case_id, case_name, suite_run_id: string|null, ran_at, status: EvalCaseResultStatus, error: string|null, grounded_findings: Finding[], dropped_findings: EvalDroppedFinding[], matched_must_find: int, must_find_total: int, noise_count: int, recall|null, precision|null, citation_accuracy|null, duration_ms|null, cost_usd|null}`
     - `EvalSuiteStatus` (`running|done|partial|failed`)
     - `EvalScoredCase {case_id, case_name, status: passed|failed|errored}`
     - `EvalSnapshotSkill {id, name, version: int, body}`
     - `EvalAgentSnapshot {system_prompt, model, provider, strategy, skills: EvalSnapshotSkill[]}`
     - `EvalSuiteRunSummary {id, agent_id, run_number, agent_version, status, error|null, started_at, finished_at|null, cases_total, cases_done, cases_passed, cases_errored, recall|null, precision|null, citation_accuracy|null, cost_usd|null, cost_partial: boolean, duration_ms|null, scored_cases: EvalScoredCase[]}`
     - `EvalSuiteRun = EvalSuiteRunSummary.extend({snapshot: EvalAgentSnapshot})`
     - `EvalSuiteRunDetail = EvalSuiteRun.extend({case_results: EvalCaseResult[]})`
     - `EvalSuiteRunAccepted {suite_run_id, status: 'running', run_number, cases_total}`
     - `EvalCaseRunAccepted {case_run_id, status: 'running'}`
     - `EvalSkipReason` (`'disabled'|'no cases'|'too many cases'|'already running'`)
     - `EvalRunAllResult {started: [{agent_id, suite_run_id}], skipped: [{agent_id, reason: EvalSkipReason}]}`
     - `EvalMetricName` (`recall|precision|citation_accuracy`)
     - `EvalMetricDeltas {recall|null, precision|null, citation_accuracy|null, cost_usd|null}`
     - `EvalPromptDiffLine {op: equal|add|remove, text}`
     - `EvalConfigChange {kind: model|provider|strategy|skill_added|skill_removed|skill_version, name: string|null, from: string|null, to: string|null}`
     - `EvalCompare {base: EvalSuiteRunSummary, head: EvalSuiteRunSummary, deltas: EvalMetricDeltas, prompt_diff: EvalPromptDiffLine[], config_changes: EvalConfigChange[], case_set: {added: int, removed: int}}`
     - `EvalRegressionAlert {run_number, agent_version, drops: [{metric: EvalMetricName, points: int}]}`
     - `EvalTrendRunPoint {suite_run_id, run_number, agent_version, started_at, recall|null, precision|null, citation_accuracy|null, cost_usd|null}`
     - `EvalAgentDashboard {agent: {id, name, model}, cases_total, latest: EvalSuiteRunSummary|null, previous: EvalSuiteRunSummary|null, deltas: EvalMetricDeltas, trend: EvalTrendRunPoint[], history: EvalSuiteRunSummary[], alert: EvalRegressionAlert|null}`
     - `EvalWorkspaceAgentRow {agent_id, name, model, cases_total, latest: EvalSuiteRunSummary|null, recall_trend: (number|null)[]}`
     - `EvalRecentRun = EvalSuiteRunSummary.extend({agent_name})`
     - `EvalWorkspaceDashboard {agents: EvalWorkspaceAgentRow[], recent_runs: EvalRecentRun[]}`
   - verify: `cd server && pnpm exec vitest run test/eval-contract.test.ts` → all AC-1 cases pass; `diff server/src/vendor/shared/contracts/eval-pipeline.ts client/src/vendor/shared/contracts/eval-pipeline.ts` → no output

2. [BE] server — schema for suite runs, case ownership and case-run fields
   - files: `server/src/db/schema/eval.ts` (changed); `server/src/db/schema.ts` (changed: add `evalSuiteRuns` to imports and the `schema` object); `server/src/db/migrations/0015_*.sql` + `meta/**` (generated by `pnpm db:generate`, never edited)
   - layer: db · lane: 0
   - skills: drizzle-orm-patterns, postgresql-table-design, onion-architecture
   - turns green: none (AC-11, 27, 32, 57 and 58 depend on these constraints; proven in step 11)
   - test first: none (schema; proven by the step 11 integration suite on a fresh testcontainer)
   - interfaces: produces these tables:
     - `evalSuiteRuns` (`eval_suite_runs`):
       - columns: `id` uuid pk; `workspaceId` FK workspaces cascade not null; `agentId` FK agents cascade not null; `runNumber` int not null; `agentVersion` int not null; `status` text enum `running|done|partial|failed` not null default `running`; `error` text; `startedAt` timestamptz default now not null; `finishedAt` timestamptz; `casesTotal` int not null; `casesDone`, `casesPassed`, `casesErrored` int not null default 0; `recall`, `precision`, `citationAccuracy`, `costUsd` doublePrecision; `costPartial` bool not null default false; `durationMs` int; `scoredCases` jsonb not null default `[]`; `snapshot` jsonb not null
       - indexes: unique `(agent_id, run_number)`; unique index on `(agent_id)` WHERE `status = 'running'`; index `(agent_id, started_at)`; index `(workspace_id, started_at)`
     - `evalCases` gains: `agentId` uuid FK agents `onDelete: 'cascade'` (nullable for skill-owned rows); `sourceFindingId` uuid FK findings `onDelete: 'set null'`; `source` jsonb; `createdAt` timestamptz default now not null; unique `(agent_id, source_finding_id)`
     - `evalRuns` gains: `suiteRunId` uuid FK evalSuiteRuns cascade (nullable); `status` text enum `running|passed|failed|errored` not null default `running`; `error` text; `matchedMustFind`, `mustFindTotal`, `noiseCount` int; index `(case_id, ran_at)`; index `(suite_run_id)`
     - `actualOutput` holds `{grounded: Finding[], dropped: {finding, reason}[]}`
   - verify: `cd server && pnpm db:generate && pnpm db:migrate` → a new `0015_*.sql` with `CREATE TABLE "eval_suite_runs"` and the unique index `WHERE "status" = 'running'`, and migrate exits 0 against `DATABASE_URL` on port 5632


## Red-first rows this lane turns green
- AC-1 → `server/test/eval-contract.test.ts` — "AC-1 expectation shape: both types and an empty list parse; missing type, missing file or start_line > end_line fail with a field path" (L0)

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
- AC-1 The system shall store every eval case with an ordered list of expectations. Each expectation has a type (`must_find` or `must_not_flag`), a file path and an inclusive line range, plus optional severity, category and title for display. An empty list means "expect clean": the agent must produce no grounded finding. — proof: red-first unit
- AC-11 WHEN "Turn into eval case" is activated for a finding that already has a case in the same agent's set, the system shall return the existing case and create no second one. — proof: red-first integration
- AC-27 IF a suite run for the same agent is already running, THEN the system shall refuse a new one with 409. — proof: red-first integration
- AC-32 The system shall number suite runs per agent from 1, in start order, and label each run "run #N · agent vM", where M is the agent's config version when the run started. — proof: red-first integration
- AC-57 WHEN an agent is deleted, the system shall delete its cases, suite runs and case results with it. — proof: red-first integration
