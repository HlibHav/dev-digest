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
| 5 | 12, 13, 14, 15 | `client/src/lib/hooks/eval.ts`, `client/src/lib/hooks/eval.test.tsx`, `client/messages/en/eval.json`, `client/src/components/eval/**`, `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/EvalDashboardNav.test.tsx` | 0 |

## Steps (this lane)
12. [UI] client — eval hooks and i18n keys
    - files: `client/src/lib/hooks/eval.ts` (new); `client/src/lib/hooks/eval.test.tsx` (new); `client/messages/en/eval.json` (changed: add the keys in *Contracts & data*, keep existing keys)
    - layer: lib · lane: 5
    - skills: react-best-practices, zod, react-testing-library
    - turns green: none directly
    - test first: `client/src/lib/hooks/eval.test.tsx`:
      - "useSuiteRun polls every 1500 ms while running and stops at done" (mocked fetch, fake timers);
      - "useCaseRun stops at errored".
    - interfaces: consumes step 1 types (`import type` from `@devdigest/shared`). Produces:
      - `useEvalCases(agentId)`, query key `['eval-cases', agentId]`
      - `useCreateEvalCase(agentId)`, `useUpdateEvalCase(agentId)`, `useDeleteEvalCase(agentId)`
      - `useCreateCaseFromFinding()`, mutation over `{findingId}` returning `EvalCaseCreated`; the error is `ApiError` with the server message
      - `useStartCaseRun()`, `useCaseRun(caseRunId|null)`, polling while `running`
      - `useStartSuiteRun()`, mutation over `agentId`
      - `useSuiteRun(suiteRunId|null)`, polling while `running`, and on the edge into a terminal status invalidating `['eval-dashboard', agentId]`, `['eval-cases', agentId]`, `['eval-history', agentId]`
      - `useRunAllAgents()`
      - `useEvalHistory(agentId)`, `useEvalCompare(baseId|null, headId|null)`, `useAgentEvalDashboard(agentId)`, `useEvalWorkspaceDashboard()`
    - verify: `cd client && pnpm exec vitest run src/lib/hooks/eval.test.tsx` → pass

13. [UI] client — shared eval helpers, MetricStat, DeltaBadge
    - files: `client/src/components/eval/helpers.ts`, `helpers.test.ts`, `constants.ts`, `MetricStat/{MetricStat.tsx, MetricStat.test.tsx, index.ts, styles.ts}`, `DeltaBadge/{DeltaBadge.tsx, DeltaBadge.test.tsx, index.ts}` (new)
    - layer: shared component (promoted: consumers `/agents/[id]` Evals tab and `/eval/**`) · lane: 5
    - skills: frontend-ui-architecture, react-testing-library, react-best-practices
    - turns green: AC-23 (MetricStat), AC-49, AC-50
    - test first: the three red-first rows, plus helpers tests:
      - `formatPct(null) === '—'`, `formatPct(0.823) === '82%'`;
      - `formatCost(null,false) === '—'`, `formatCost(0.03,true)` contains `0.03` and a partial marker;
      - `runLabel(3,2) === 'run #3 · agent v2'`.
    - interfaces: produces
      - `formatPct(v: number|null): string`
      - `formatCost(v: number|null, partial: boolean): string`
      - `runLabel(runNumber: number, agentVersion: number): string`
      - `deltaView(delta: number|null, unit: 'pts'|'usd'): {text: string; direction: 'up'|'down'|'flat'|'none'}` (sign `+`/`−`, U+2212)
      - `compareEnabled(selected: readonly EvalSuiteRunSummary[]): boolean`
      - `<MetricStat label value={number|null} delta={number|null} neverRun?: boolean />`
      - `<DeltaBadge delta={number|null} unit />`: renders sign, arrow icon and a visually hidden "up" or "down" text alternative
    - verify: `cd client && pnpm exec vitest run src/components/eval/` → pass

14. [UI] client — RunHistoryTable, TrendChart, CompareModal
    - files: `client/src/components/eval/RunHistoryTable/**`, `TrendChart/**`, `CompareModal/**` (new, each with `<Name>.tsx`, `<Name>.test.tsx`, `index.ts`, `styles.ts` as needed)
    - layer: shared component · lane: 5
    - skills: frontend-ui-architecture, react-testing-library, react-best-practices, security
    - turns green: AC-23 (history row)
    - test first:
      - `RunHistoryTable.test.tsx`:
        - "AC-23 null precision renders —";
        - "rows newest first show label, status, passed/executed, errored count only when > 0, cost";
        - "checkbox accessible name is the run label";
        - "Compare disabled unless compareEnabled";
        - "a running row shows Running k/N".
      - `CompareModal.test.tsx`: "old → new values with DeltaBadge, prompt diff lines marked add/remove, config changes, 'case set changed: +2 / −1' when non-zero".
      - `TrendChart.test.tsx`: "text alternative lists each point's label and values, a null as —".
    - interfaces: consumes step 12 hooks and step 13 helpers. Produces:
      - `<RunHistoryTable runs={EvalSuiteRunSummary[]} onCompare={(base, head) => void} />` (selection state is local)
      - `<TrendChart points={EvalTrendRunPoint[]} />` (recharts direct, `connectNulls={false}`, tooltip `runLabel · formatCost`)
      - `<CompareModal baseId headId onClose />` (calls `useEvalCompare`; the prompt diff scrolls, no truncation; all text as text)
    - verify: `cd client && pnpm exec vitest run src/components/eval/` → pass

15. [UI] client — sidebar item
    - files: `client/src/vendor/ui/nav.ts` (changed: in `SKILLS LAB` after `conventions`, `{ key: "eval", label: "Eval Dashboard", icon: "Gauge" if present in `IconName`, else "Activity", href: "/eval" }`); `client/src/components/app-shell/EvalDashboardNav.test.tsx` (new)
    - layer: shell config · lane: 5
    - skills: frontend-ui-architecture, react-testing-library
    - turns green: none (AC-51 is e2e in step 22)
    - test first: `EvalDashboardNav.test.tsx` "Sidebar shows Eval Dashboard under SKILLS LAB, linking to /eval, active when activeKeyFor('/eval/abc') === 'eval'" (pattern: `client/src/components/app-shell/ProjectContextNav.test.tsx:11`)
    - interfaces: consumes `activeKeyFor` (unchanged)
    - verify: `cd client && pnpm exec vitest run src/components/app-shell/EvalDashboardNav.test.tsx` → pass


## Red-first rows this lane turns green
- AC-23 → `client/src/components/eval/MetricStat/MetricStat.test.tsx` "AC-23 null value renders —" and `client/src/components/eval/RunHistoryTable/RunHistoryTable.test.tsx` "AC-23 null precision renders —" (L5)
- AC-49 → `client/src/components/eval/helpers.test.ts` — "AC-49 compareEnabled only for exactly two non-failed runs" (L5)
- AC-50 → `client/src/components/eval/DeltaBadge/DeltaBadge.test.tsx` — "AC-50 −0.02 renders '−' and a down-arrow text alternative" (L5)

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
- AC-23 The system shall show every null metric as "—", never as 0% or 100%, on the Evals tab, the dashboards, the compare view and chart tooltips. — proof: red-first unit
- AC-49 WHILE fewer or more than two runs are selected, or a selected run is `failed`, the system shall keep Compare disabled. — proof: red-first unit
- AC-50 The system shall show metric deltas with a sign and an arrow as well as colour. — proof: red-first unit
- AC-51 The system shall show an "Eval Dashboard" item in the sidebar's Skills Lab section, opening the Eval Dashboard page. — proof: e2e
