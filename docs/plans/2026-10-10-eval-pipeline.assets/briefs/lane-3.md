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
| 3 | 7, 8, 9, 10 | `server/src/modules/eval/case-runner.ts`, `server/src/modules/eval/service.ts`, `server/test/eval-case-runner.test.ts`, `server/test/eval-service.test.ts` | 1 |

## Steps (this lane)
7. [BE] server — case-runner (fixed inputs → reviewer-core)
   - files: `server/src/modules/eval/case-runner.ts` (new); `server/test/eval-case-runner.test.ts` (new)
   - layer: application · lane: 3
   - skills: onion-architecture, security
   - turns green: none directly (AC-14 and AC-15 integration in step 11)
   - test first: `server/test/eval-case-runner.test.ts`, using `MockLLMProvider` and `parseUnifiedDiff` imported in the test only:
     - "passes only diff, PR meta, prompt, model, strategy and skills": the captured `completeStructured` messages contain the diff line and PR title, and contain none of `Project context`, `Intent`, `Callers`, `Repo skeleton`.
     - "keeps dropped findings": a finding outside the hunk lands in `dropped`.
     - "rethrows a model error".
   - interfaces: consumes `EvalAgent`, `EvalSkill`, `EVAL_TASK`, `prDescription`. Produces:
     - `interface CaseRunnerPorts {llm(provider: Provider): Promise<LLMProvider>; parseDiff(raw: string): UnifiedDiff; nowMs(): number}`
     - `interface CaseRunInput {inputDiff: string; meta: EvalCaseMeta; agent: EvalAgent; skills: readonly EvalSkill[]}`
     - `interface CaseRunOutput {grounded: Finding[]; dropped: EvalDroppedFinding[]; costUsd: number|null; durationMs: number}`
     - `runEvalCase(ports: CaseRunnerPorts, input: CaseRunInput): Promise<CaseRunOutput>`
     - It calls `reviewPullRequest({systemPrompt, model, diff, llm, strategy, skills (name, body, untrusted; omitted when empty), prDescription (omitted when undefined), task: EVAL_TASK})` and nothing else.
   - verify: `cd server && pnpm exec vitest run test/eval-case-runner.test.ts` → all pass

8. [BE] server — EvalService: cases (from finding, CRUD, list with last result)
   - files: `server/src/modules/eval/service.ts` (new); `server/test/eval-service.test.ts` (new, cases block)
   - layer: application · lane: 3
   - skills: onion-architecture, security, zod
   - turns green: none directly (AC-2–5, 7–13, 42, 43 integration in step 11)
   - test first: `server/test/eval-service.test.ts` with an in-memory `EvalStore` fake and port fakes:
     - "accepted → must_find with severity, category, title";
     - "dismissed → must_not_flag";
     - "undecided → 422 MSG.undecided";
     - "null agent → 422 MSG.noAgent";
     - "empty patch → 422 MSG.noPatch, nothing inserted";
     - "65 KB patch → 422 MSG.diffTooLarge";
     - "second call returns created:false and the same id";
     - "finding in another workspace → 404";
     - "create/update reject a 65 KB input_diff with 422".
   - interfaces: consumes `EvalStore`, step 3 helpers and constants, step 4 `scoreCase`/`aggregateSuite`, step 7 types. Produces:
     - `interface EvalPorts`:
       - `store: EvalStore`
       - `getAgent(workspaceId, agentId): Promise<EvalAgent|undefined>`
       - `listAgents(workspaceId): Promise<EvalAgent[]>`
       - `resolveSkills(workspaceId, agentId): Promise<EvalSkill[]>`
       - `findingContext(findingId): Promise<{finding: {id, file, start_line, end_line, severity, category, title, accepted: boolean, dismissed: boolean}; agentId: string|null; pull: {id, workspaceId, repoId, number, title, body: string|null}}|undefined>`
       - `prFilePatch(prId, path): Promise<string|null>`
       - `runCase(input: CaseRunInput): Promise<CaseRunOutput>`
       - `background(task: () => Promise<void>): void`
       - `now(): Date`
       - `log(fields: Record<string, unknown>, msg: string): void`
     - `class EvalService { constructor(ports: EvalPorts) }` with these methods:
       - `createFromFinding(workspaceId, findingId): Promise<{body: EvalCaseCreated; created: boolean}>`
       - `listCases(workspaceId, agentId): Promise<EvalCaseView[]>`
       - `createCase(workspaceId, agentId, input: EvalCaseWrite): Promise<EvalCaseView>`
       - `updateCase(workspaceId, caseId, input: EvalCaseWrite): Promise<EvalCaseView>`
       - `deleteCase(workspaceId, caseId): Promise<void>`
       - It throws `NotFoundError`, `ValidationError` (422) and `AppError('suite_running', MSG.alreadyRunning, 409)`.
   - verify: `cd server && pnpm exec vitest run test/eval-service.test.ts -t 'cases'` → all pass

9. [BE] server — EvalService: suite runs, run all, single-case runs, reap
   - files: `server/src/modules/eval/service.ts`, `server/test/eval-service.test.ts` (runs block)
   - layer: application · lane: 3
   - skills: onion-architecture, security
   - turns green: none directly (AC-22, 25–27, 29–34 integration in step 11)
   - test first: `server/test/eval-service.test.ts` "runs", with a `background` fake that collects tasks so the test can await them:
     - "start returns run_number and cases_total before any case runs";
     - "0 and 51 cases → 422 naming the limit";
     - "store returns already_running → 409";
     - "case 2 runCase throws → case errored with MSG.caseError, raw text logged redacted, metrics from cases 1 and 3, status partial";
     - "all cases errored";
     - "finishCaseRun throws after case 1 → suite failed with MSG.suiteFailed";
     - "suite stops when its row is gone (updateSuiteProgress false) and logs once";
     - "snapshot holds prompt, model, provider, strategy and skills at start";
     - "runAll: disabled / no cases / too many cases / already running skipped";
     - "startCaseRun: suiteRunId null, result written via finishCaseRun";
     - "reapInterrupted delegates with MSG.interrupted".
   - interfaces: produces these `EvalService` methods:
     - `startSuite(workspaceId, agentId): Promise<EvalSuiteRunAccepted>`: reads cases and skills at start; the background task runs cases sequentially (insertCaseRun → runCase → scoreCase → finishCaseRun → updateSuiteProgress), then `aggregateSuite` + `suiteCost` → `finishSuite` with status done or partial; the outer catch → `finishSuite` failed
     - `runAll(workspaceId): Promise<EvalRunAllResult>`
     - `startCaseRun(workspaceId, caseId): Promise<EvalCaseRunAccepted>`
     - `reapInterrupted(): Promise<{suites: number; caseRuns: number}>`
   - verify: `cd server && pnpm exec vitest run test/eval-service.test.ts -t 'runs'` → all pass

10. [BE] server — EvalService: reads, compare, dashboards
    - files: `server/src/modules/eval/service.ts`, `server/test/eval-service.test.ts` (reads block)
    - layer: application · lane: 3
    - skills: onion-architecture
    - turns green: none directly (AC-45, 47, 48, 52, 55, 56, 58 in step 11)
    - test first: `server/test/eval-service.test.ts` "reads":
      - "compare orders by started_at, 422 on failed/running/same id/different agents";
      - "agent dashboard: latest and previous are the last two done|partial, deltas, alert from regressionDrops, trend ascending of done|partial";
      - "workspace dashboard lists only agents with cases; recent_runs ≤ 20";
      - "getCaseRun of another workspace → 404".
    - interfaces: produces these `EvalService` methods:
      - `getSuite(workspaceId, id): Promise<EvalSuiteRunDetail>`
      - `getCaseRun(workspaceId, id): Promise<EvalCaseResult>`
      - `history(workspaceId, agentId): Promise<EvalSuiteRunSummary[]>`
      - `compare(workspaceId, baseId, headId): Promise<EvalCompare>`
      - `agentDashboard(workspaceId, agentId): Promise<EvalAgentDashboard>`
      - `workspaceDashboard(workspaceId): Promise<EvalWorkspaceDashboard>`
    - verify: `cd server && pnpm exec vitest run test/eval-service.test.ts` → all pass


## Red-first rows this lane turns green
(none tagged to this lane)

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
- AC-2 The system shall scope every eval case, suite run and case result to the workspace of the agent that owns it. A request for another workspace's case, run or agent returns 404. — proof: red-first integration
- AC-14 WHEN a case is executed, the system shall give the review engine only the case diff, the case PR title and body, and the agent's system prompt, model, provider, strategy and linked skills, with skill bodies as of the moment of the run. It shall give no project-context docs, memory, PR intent, callers digest or repo map. — proof: red-first integration
- AC-15 WHEN a case is executed, the system shall apply the review engine's existing grounding gate against the case diff, and keep both the grounded findings and the dropped findings in the case result. — proof: red-first integration
- AC-22 IF a case's model call errors or times out, THEN the system shall record that case as errored with its reason and exclude it from recall, precision, citation accuracy and pass count. The suite run ends as `partial` instead of `done`. — proof: red-first integration
- AC-25 WHEN the user starts a suite run for an agent, the system shall accept it with 202 and return the new suite run's id, status `running`, its per-agent run number and the number of cases. The cases execute in the background. — proof: red-first integration
- AC-45 WHEN the Evals tab or the per-agent dashboard opens, the system shall list that agent's suite runs newest first. Each row shows ran-at, the "run #N · agent vM" label, status, recall, precision, citation accuracy, passed / executed cases, the errored count when not zero, and cost. — proof: red-first integration
- AC-47 WHEN the user selects exactly two `done` or `partial` suite runs of the same agent and activates Compare, the system shall show: for each metric and the cost: the older run's value, the newer run's value and the signed delta; a line-level diff of the two snapshots' system prompts; the model, provider or linked-skill changes between the two snapshots. — proof: red-first integration
- AC-48 WHEN the two compared runs scored different case sets (from each run's own list of scored cases, so deleted cases still count), the compare view shall show the notice "case set changed: +X / −Y". The deltas are still computed over each run's full set. — proof: red-first integration
- AC-52 WHEN the Eval Dashboard opens, the system shall list every agent in the workspace that has at least one case. Each row shows the agent name, model, latest suite-run label and date, passed / executed, a recall trend sparkline, and the latest recall, precision and citation accuracy. Below the list, the 20 most recent suite runs of all agents appear newest first. — proof: e2e
- AC-55 WHEN the user opens an agent's row on the Eval Dashboard, or "View full dashboard" on its Evals tab, the system shall open the per-agent dashboard. It shows stat cards (latest value and delta against the previous completed run), the trend chart, the run history with selection and Compare, a "Run eval" action, and an agent switcher that changes the agent in place. — proof: e2e
- AC-56 WHEN an agent's latest completed suite run has any metric 0.02 or more below the same metric of its previous completed run (both non-null), the system shall show a regression banner. The banner names each dropped metric with its drop in points and the run label. — proof: red-first unit
- AC-58 WHEN an agent has 50 suite runs, the system shall answer the per-agent dashboard, workspace dashboard and history routes with p95 under 500 ms. — proof: red-first integration
