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
| 4 | 11 | `server/src/modules/eval/wiring.ts`, `server/src/modules/eval/schemas.ts`, `server/src/modules/eval/routes.ts`, `server/src/modules/index.ts`, `server/src/app.ts`, `server/test/eval-cases.it.test.ts`, `server/test/eval-runs.it.test.ts`, `server/test/eval-history.it.test.ts`, `server/test/eval-rate-limit.it.test.ts` | 2, 3 |

## Steps (this lane)
11. [BE] server — wiring, routes, registration, boot reaper, integration suites
    - files:
      - new: `server/src/modules/eval/wiring.ts`, `schemas.ts`, `routes.ts`
      - changed: `server/src/modules/index.ts` (import `evalModule from './eval/routes.js'`, entry `eval: evalModule`); `server/src/app.ts` (after the agent-run reaper, the same non-fatal try/catch calls `await buildEvalService(container, app.log).reapInterrupted()`)
      - new tests: `server/test/eval-cases.it.test.ts`, `eval-runs.it.test.ts`, `eval-history.it.test.ts`, `eval-rate-limit.it.test.ts`
    - layer: edge (routes, wiring) · lane: 4
    - skills: onion-architecture, fastify-best-practices, zod, security, drizzle-orm-patterns
    - turns green: AC-2, 3, 4, 5, 7, 8, 9 (route half), 10, 11, 12 (integration), 13, 14, 15, 22, 25, 26, 27, 28, 29 (integration), 30, 31, 32, 33, 34, 42, 43 (integration), 45, 47, 48, 57, 58
    - test first: the four integration files from `## Red-first`.
      - Each test subclasses `MockLLMProvider` inside the test file (gated: `completeStructured` awaits a promise the test releases; failing on call n) and registers it under every provider id (`server/INSIGHTS.md:76`).
      - AC-30 part 1 builds the service with `buildEvalService(app.container, app.log, { store: wrappedStoreThatThrowsOnSecondFinishCaseRun })`.
      - AC-30 part 2 inserts a `running` suite row and a `running` case run, then calls `buildApp` again and reads both through the routes (`failed` / `errored`, error `interrupted`).
      - AC-28 builds the app with `NODE_ENV=development, LOG_LEVEL=silent` in its own file.
      - AC-58 inserts 50 suites × 50 eval_runs directly, then calls each of the three routes 20× and asserts p95 < 500 ms.
      - Cross-workspace tests insert a second workspace's agent, case and suite and expect 404 with valid uuids.
    - interfaces: consumes `EvalService` (steps 8–10), `EvalRepository` (step 6), `runEvalCase` (step 7).
      - Produces `buildEvalService(container: Container, log: FastifyBaseLogger, opts: Partial<EvalPorts> = {}): EvalService`. The wiring fills:
        - `store = new EvalRepository(container.db)`;
        - `getAgent` / `listAgents` from `container.agentsRepo.getById` / `.list`;
        - `resolveSkills` from `container.agentsRepo.enabledSkillsForAgent`, mapped with `isSkillUntrusted(skill.source)`;
        - `findingContext` from `container.reviewRepo.findingContext`, mapped with `accepted = !!acceptedAt`;
        - `prFilePatch` from `container.reviewRepo.getPrFiles`;
        - `runCase = (i) => runEvalCase({llm: async (p) => container.llm(p), parseDiff: parseUnifiedDiff, nowMs: Date.now}, i)`;
        - `background = (task) => void task().catch((e) => log.error({err: redactSecrets(String(e))}, 'eval: background task failed'))`.
      - Routes, each with `schema.params/body/querystring` and `response`:
        - `POST /findings/:id/eval-case` → 201 or 200 with `EvalCaseCreated`
        - `GET /agents/:id/eval-cases` → `EvalCaseView[]`
        - `POST /agents/:id/eval-cases` → 201 `EvalCaseView`
        - `PUT /eval-cases/:id` → `EvalCaseView`
        - `DELETE /eval-cases/:id` → `{ok: true}`
        - `POST /eval-cases/:id/run` → 202 `EvalCaseRunAccepted`, rate limit 10/min
        - `GET /eval-case-runs/:id` → `EvalCaseResult`, `rateLimit: false`
        - `POST /agents/:id/eval-runs` → 202 `EvalSuiteRunAccepted`, 10/min
        - `POST /eval-runs/all` → 202 `EvalRunAllResult`, 10/min
        - `GET /eval-suite-runs/compare?base=&head=` (registered before `/:id`; `CompareQuery = z.object({base: uuid, head: uuid})` in `schemas.ts`) → `EvalCompare`
        - `GET /eval-suite-runs/:id` → `EvalSuiteRunDetail`, `rateLimit: false`
        - `GET /agents/:id/eval-suite-runs` → `EvalSuiteRunSummary[]`
        - `GET /agents/:id/eval-dashboard` → `EvalAgentDashboard`
        - `GET /eval/dashboard` → `EvalWorkspaceDashboard`
    - verify: `cd server && pnpm exec vitest run test/route-adapter-calls.test.ts` → passes (no adapter call in `eval/routes.ts`). The integration files are run by plan-verifier.


## Red-first rows this lane turns green
- AC-2, 3, 4, 5, 7, 8, 9 (route half), 10, 11, 12, 13, 42, 43, 57 → `server/test/eval-cases.it.test.ts` — "AC-n …" (L4)
- AC-14, 15, 22, 25, 26, 27, 29, 30, 31, 32, 33, 34 → `server/test/eval-runs.it.test.ts` — "AC-n …" (L4)
- AC-45, 47, 48, 58 → `server/test/eval-history.it.test.ts` — "AC-n …" (L4)
- AC-28 → `server/test/eval-rate-limit.it.test.ts` — "AC-28 the 11th POST /agents/:id/eval-runs within a minute answers 429" (L4)

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
- AC-3 WHEN the user activates "Turn into eval case" on an accepted finding, the system shall create a case in the set of the agent that produced the finding's review. The case has one `must_find` expectation with the finding's file, start and end lines, severity, category and title. — proof: red-first integration
- AC-4 WHEN the user activates "Turn into eval case" on a dismissed finding, the system shall create a case with one `must_not_flag` expectation carrying the finding's file and line range. — proof: red-first integration
- AC-5 WHEN a case is created from a finding, the system shall save the full patch of the finding's file from that PR as the case diff. It saves the PR title and body as the case PR meta, and the PR's repository and number as the case source. — proof: red-first integration
- AC-7 IF the finding's file has no stored patch for that PR, THEN the system shall refuse to create the case with the message "This PR's diff is not stored yet. Open the PR once and try again." and create nothing. — proof: red-first integration
- AC-8 IF the patch saved for a case, or a diff pasted into the Case Editor, exceeds 64 KB, THEN the system shall refuse to save the case and say that the diff is over the 64 KB limit. — proof: red-first integration
- AC-9 WHILE a finding has neither an accepted nor a dismissed decision, the system shall show "Turn into eval case" disabled with the hint "Accept or dismiss first". The create route refuses such a finding with 422. — proof: e2e
- AC-14 WHEN a case is executed, the system shall give the review engine only the case diff, the case PR title and body, and the agent's system prompt, model, provider, strategy and linked skills, with skill bodies as of the moment of the run. It shall give no project-context docs, memory, PR intent, callers digest or repo map. — proof: red-first integration
- AC-15 WHEN a case is executed, the system shall apply the review engine's existing grounding gate against the case diff, and keep both the grounded findings and the dropped findings in the case result. — proof: red-first integration
- AC-22 IF a case's model call errors or times out, THEN the system shall record that case as errored with its reason and exclude it from recall, precision, citation accuracy and pass count. The suite run ends as `partial` instead of `done`. — proof: red-first integration
- AC-25 WHEN the user starts a suite run for an agent, the system shall accept it with 202 and return the new suite run's id, status `running`, its per-agent run number and the number of cases. The cases execute in the background. — proof: red-first integration
- AC-26 IF the agent has no cases or more than 50 cases, THEN the system shall refuse the suite run with 422 and a reason naming the limit. The Evals tab shows that reason. — proof: red-first integration
- AC-27 IF a suite run for the same agent is already running, THEN the system shall refuse a new one with 409. — proof: red-first integration
- AC-28 The system shall limit the suite-run, run-all and single-case-run routes to 10 requests per minute each. — proof: red-first integration
- AC-29 WHILE a suite run is in progress, the system shall report cases done out of cases total on the suite-run read route, and the Evals tab and the per-agent dashboard shall poll it and show "Running k/N" until it ends. — proof: red-first integration + red-first unit
- AC-30 IF a suite run fails as a whole (an unexpected error, or a process restart while it ran), THEN the system shall mark it `failed` with a reason. It never stays `running`. A suite still `running` at server start is marked `failed` with the reason "interrupted". — proof: red-first integration
- AC-31 WHEN a suite run starts, the system shall store a snapshot of the agent's system prompt, model, provider, strategy and each linked skill's id, name, version and body. Later edits or skill changes do not alter that snapshot. — proof: red-first integration
- AC-32 The system shall number suite runs per agent from 1, in start order, and label each run "run #N · agent vM", where M is the agent's config version when the run started. — proof: red-first integration
- AC-33 WHEN the user activates "Run all agents" on the Eval Dashboard, the system shall start one suite run per agent in the workspace that has at least one case, applying AC-26 and AC-27 to each agent separately. It skips disabled agents. It returns the runs it started and the agents it skipped, each with a reason ("disabled", "no cases", "too many cases" or "already running"). — proof: red-first integration
- AC-34 WHEN the user runs a single case (the row ▷ on the Evals tab, "Run case" in the Case Editor, or "Run on save" when saving), the system shall accept the request with 202 and a case-run id, execute that case alone in the background, and store the result as the case's last result only, outside any suite run. The client polls the case-run until it ends. A case's last result is its most recent result from either a single-case run or a suite run. — proof: red-first integration
- AC-45 WHEN the Evals tab or the per-agent dashboard opens, the system shall list that agent's suite runs newest first. Each row shows ran-at, the "run #N · agent vM" label, status, recall, precision, citation accuracy, passed / executed cases, the errored count when not zero, and cost. — proof: red-first integration
- AC-47 WHEN the user selects exactly two `done` or `partial` suite runs of the same agent and activates Compare, the system shall show: for each metric and the cost: the older run's value, the newer run's value and the signed delta; a line-level diff of the two snapshots' system prompts; the model, provider or linked-skill changes between the two snapshots. — proof: red-first integration
- AC-48 WHEN the two compared runs scored different case sets (from each run's own list of scored cases, so deleted cases still count), the compare view shall show the notice "case set changed: +X / −Y". The deltas are still computed over each run's full set. — proof: red-first integration
- AC-58 WHEN an agent has 50 suite runs, the system shall answer the per-agent dashboard, workspace dashboard and history routes with p95 under 500 ms. — proof: red-first integration
