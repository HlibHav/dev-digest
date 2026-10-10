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
| 7 | 20, 21 | `client/src/app/eval/**` | 5 |

## Steps (this lane)
20. [UI] client — Eval Dashboard page (`/eval`)
    - files: `client/src/app/eval/page.tsx` (new, thin); `client/src/app/eval/_components/EvalDashboardView/{EvalDashboardView.tsx, EvalDashboardView.test.tsx, index.ts, styles.ts}`, `.../_components/AgentRow/**`, `.../_components/RecentRuns/**` (new)
    - layer: route · lane: 7
    - skills: frontend-ui-architecture, next-best-practices, react-testing-library, react-best-practices
    - turns green: AC-53, AC-54
    - test first: `EvalDashboardView.test.tsx`:
      - "AC-53 empty response → empty state pointing to findings and the Evals tab";
      - "AC-54 agent with cases and latest null → 'never run' and —";
      - "two agents with latest values and Sparkline; recent runs newest first";
      - "Run all agents shows started/skipped with reasons".
    - interfaces: consumes `useEvalWorkspaceDashboard`, `useRunAllAgents`, step 13 helpers, vendored `Sparkline` (null points dropped). Produces the page at `/eval` with crumb Skills Lab › Eval Dashboard, rows linking to `/eval/<agentId>`.
    - verify: `cd client && pnpm exec vitest run src/app/eval/_components` → pass

21. [UI] client — per-agent dashboard (`/eval/[agentId]`)
    - files: `client/src/app/eval/[agentId]/page.tsx` (new); `.../_components/AgentEvalDashboardView/{AgentEvalDashboardView.tsx, AgentEvalDashboardView.test.tsx, index.ts, styles.ts}`, `.../_components/RegressionBanner/**`, `.../_components/AgentSwitcher/**` (new)
    - layer: route · lane: 7
    - skills: frontend-ui-architecture, next-best-practices, react-testing-library, react-best-practices
    - turns green: AC-29 (unit, dashboard), AC-56 (render)
    - test first:
      - `RegressionBanner.test.tsx` "AC-56": an alert with precision 2 and run 7 v3 renders `role="alert"` naming precision, "2 pts" and "run #7 · agent v3"; a null alert renders nothing.
      - `AgentEvalDashboardView.test.tsx`:
        - "AC-29 Running k/N then metrics";
        - "stat cards show latest value and DeltaBadge vs previous";
        - "the switcher calls router.replace('/eval/<other>') and cards change";
        - "Run eval starts a suite".
    - interfaces: consumes `useAgentEvalDashboard`, `useStartSuiteRun`, `useSuiteRun`, `useAgents` (`client/src/lib/hooks/agents.ts`), and the `RunHistoryTable`, `TrendChart`, `CompareModal`, `MetricStat` components. Produces the page with crumb Skills Lab › Eval Dashboard › <agent>.
    - verify: `cd client && pnpm exec vitest run 'src/app/eval/[agentId]'` → pass


## Red-first rows this lane turns green
- AC-29 (unit) → `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.test.tsx` "AC-29 shows Running k/N then final metrics without reload" (L6) and `client/src/app/eval/[agentId]/_components/AgentEvalDashboardView/AgentEvalDashboardView.test.tsx` "AC-29 …" (L7)
- AC-53, 54 → `client/src/app/eval/_components/EvalDashboardView/EvalDashboardView.test.tsx` — "AC-53 empty state", "AC-54 never run with —" (L7)
- AC-56 (render) → `client/src/app/eval/[agentId]/_components/AgentEvalDashboardView/_components/RegressionBanner/RegressionBanner.test.tsx` — "AC-56 names precision, 2 pts and the run label; role=alert" (L7)

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
- AC-29 WHILE a suite run is in progress, the system shall report cases done out of cases total on the suite-run read route, and the Evals tab and the per-agent dashboard shall poll it and show "Running k/N" until it ends. — proof: red-first integration + red-first unit
- AC-53 IF no agent in the workspace has a case, THEN the Eval Dashboard shall show an empty state that points to creating a case from a finding or on an agent's Evals tab. — proof: red-first unit
- AC-54 WHILE an agent has cases but no completed suite run, the system shall show its dashboard row and metric cards as "never run" with "—" values. — proof: red-first unit
- AC-56 WHEN an agent's latest completed suite run has any metric 0.02 or more below the same metric of its previous completed run (both non-null), the system shall show a regression banner. The banner names each dropped metric with its drop in points and the run label. — proof: red-first unit
