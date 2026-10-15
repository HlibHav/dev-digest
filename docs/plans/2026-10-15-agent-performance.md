# Implementation Plan: Agent Performance dashboard and per-agent Stats
Status: ready
Spec: specs/2026-10-15-agent-performance.md (SPEC-2026-10-15-agent-performance)
Execution mode: multi-agent — chosen by the user
Save as: docs/plans/2026-10-15-agent-performance.md

## Open questions & recommendations
- contradiction (app convention) — AC-4 — The app maps every zod validation error to 422 (`server/src/app.ts:128-139`), and so does `ValidationError` (`server/src/platform/errors.ts:25-28`). AC-4 asks for 400. — default assumed: the spec wins. `period`/`from`/`to` stay out of any strict querystring schema. A pure resolver throws `new AppError('invalid_period', 'Invalid period', 400)` (`errors.ts:7-12`, where the default status is 400). — recommendation: keep 400 as the spec says. If the user prefers the app-wide 422, spec-creator updates AC-4. — blocking: no
- gap — AC-21 — A non-uuid `:id` answers 422 through `IdParams` before the handler runs, so only a well-formed unknown uuid reaches the 404. — default assumed: "random id" in the test is `randomUUID()`. — recommendation: spec-creator could add "a malformed id answers 422". — blocking: no
- ambiguity — AC-43 — "Every seeded finding shall belong to a review linked to a seeded run" also reads on PR #482's two findings. Their review has no run (`server/src/db/seed.ts:146-185`), and AC-51 keeps them unchanged. — default assumed: the sentence covers the demo block only; PR #482's review stays unlinked and adds no decisions (AC-6). — recommendation: spec-creator rewords to "every finding of the demo data". — blocking: no
- ambiguity — AC-4 — The boundary of "spans more than 366 days" is unspecified. — default assumed: the inclusive day count (`to − from + 1`) may be at most 366, so 367 answers 400. Also assumed: `period=1d|30d` ignores any `from`/`to`; an unknown `period` value answers 400. — recommendation: confirm in the spec. — blocking: no
- ambiguity — AC-27 — "per-status counts that are non-zero" has one example ("incl. 2 failed"). — default assumed: the Total runs card's sub-line is `"{done} done"`, followed by `" · incl. {n} {status}"` for each non-zero failed/running/cancelled count. The e2e flow uses that line (step 9). — assumed default — confirm. — blocking: no
- gap — design — The frame draws donuts for the cost breakdown, a ring on the Avg accept rate card and a sparkline, and no AC requires any of them. Non-goals drop the sparkline. — default assumed: the breakdown is two text lists (AC-37 and the a11y NFR) and the accept-rate card shows no ring. — recommendation: confirm, or add an AC for the donuts. — blocking: no
- gap — i18n NFR — The period selector and the by-model split are shared by the page (`agentPerformance` namespace) and the Stats tab (`agents` namespace). — default assumed: the shared components take every label as props, so each surface supplies its own namespace's strings and the Stats tab stays on `agents`. — blocking: no
- gap — data — `agent_runs.status` is nullable text (`server/src/db/schema/runs.ts:23`), although the app always writes one of four values. — default assumed: a null-status run counts toward `runs` and toward no status bucket. — recommendation: spec-creator may state it. — blocking: no
- feasibility — AC-45 — No index covers `agent_runs(workspace_id, ran_at)` or `reviews(run_id)`. Seq scans over 10k runs and 50k findings should fit in 1 s, so this plan makes **no schema change**. — default assumed: no migration. — recommendation: if the AC-45 timing fails, adding an index is a schema change (`pnpm db:generate` + `pnpm db:migrate`, never hand-written) and needs Glib's sign-off first. — blocking: no
- review-focus items (also listed below) for spec catch-up: a custom range whose `to` is today; an agent row whose `agent_id` is not in the workspace's agent list; a finding with a severity outside CRITICAL/WARNING/SUGGESTION; double-clicking Retry; a custom range typed with `from` > `to` in the browser.

## Acceptance criteria (from the spec, verbatim)
- AC-1 WHEN a stats or dashboard request names the period `1 day`, the system shall count the runs whose run time is later than the request instant minus 24 hours and not later than the request instant. — proof: red-first integration
- AC-2 WHEN a request names the period `30 days`, the system shall count the runs whose run time is later than the request instant minus 720 hours and not later than the request instant. — proof: red-first integration
- AC-3 WHEN a request names a custom range with dates `from` and `to`, the system shall count the runs whose run time is at or after `from` 00:00:00 UTC and before the day after `to` 00:00:00 UTC. — proof: red-first integration
- AC-4 IF a custom range is malformed, is missing `from` or `to`, has `from` after `to`, has `to` after today (UTC), or spans more than 366 days, THEN the system shall answer with a validation error (400) and return no aggregate. — proof: red-first integration
- AC-5 The system shall return, in every stats and dashboard response, the period kind and the resolved window as start and end instants. — proof: red-first integration
- AC-6 WHEN the system counts finding decisions for a period, it shall attribute each finding to the agent and the run time of the run that produced its review, whenever the finding was accepted or dismissed, and shall leave out findings whose review is linked to no run. — proof: red-first integration
- AC-7 The system shall count every run in the window toward Runs whatever its status (running, done, failed, cancelled), and shall return the count per status. — proof: red-first integration
- AC-8 The system shall compute Avg duration over the done runs that have a recorded duration only. — proof: red-first integration
- AC-9 The system shall compute Avg cost as the summed cost of the done runs that have a recorded cost, divided by the number of those runs. — proof: red-first integration
- AC-10 The system shall compute Total cost as the sum of every recorded cost among the counted runs, and shall report as unpriced the number of done runs that have no recorded cost. — proof: red-first integration
- AC-11 IF no counted run has a recorded cost, THEN the system shall return Total cost and Avg cost as null, never 0. — proof: red-first integration
- AC-12 The system shall compute an accept rate as accepted ÷ (accepted + dismissed), leave pending findings out, return the decision count (accepted + dismissed) beside it, and return null when the decision count is 0. — proof: red-first integration
- AC-13 The system shall compute the headline Avg accept rate as Σaccepted ÷ Σdecisions across every row of the period, the Deleted agent row included, not as the mean of the per-agent rates. — proof: red-first integration
- AC-14 The system shall flag a row, and the headline, as small sample when its decision count is below 10, zero included. — proof: red-first integration
- AC-15 The system shall gather runs whose agent was deleted into one "Deleted agent" row that counts toward Total runs, Total cost, the headline accept rate and the by-agent breakdown, and that is never chosen as Most-active. — proof: red-first integration
- AC-16 The system shall gather runs that have no recorded model into one "Unknown model" bucket of the by-model breakdown. — proof: red-first integration
- AC-17 The system shall return by-agent and by-model breakdowns whose costs each sum to Total cost within 1e-9 USD, and whose run counts each sum to Total runs. — proof: red-first integration
- AC-18 The system shall name as Most-active the existing agent with the most runs in the window, break ties by the latest last run and then by agent name A→Z, and return none when no existing agent ran. — proof: red-first integration
- AC-19 The system shall return one row for every agent of the workspace, disabled agents included, even when the agent has no runs in the window. — proof: red-first integration
- AC-20 WHEN the dashboard and an agent's Stats are requested for the same period at the same instant, the system shall return for that agent identical values for:
  - runs and per-status counts;
  - Total cost, Avg cost and the unpriced count;
  - Avg duration;
  - accepted, dismissed, pending, accept rate and the small-sample flag;
  - last run;
  - the split by model.

  — proof: red-first integration
- AC-21 IF the agent named in a Stats request does not exist in the caller's workspace, THEN the system shall answer 404 and return no aggregate. — proof: red-first integration
- AC-22 The system shall aggregate only the caller's workspace: no run, agent or finding of another workspace may affect any number or row. — proof: red-first integration
- AC-23 WHEN the dashboard or Stats endpoint answers, the system shall make no LLM provider call and write no row. — proof: red-first integration
- AC-24 The system shall show a GLOBAL sidebar group with one item, "Agent Performance", that opens the Agent Performance page and is marked active while that page is open. — proof: red-first unit
- AC-25 WHEN the Agent Performance page opens without a period in its address, the system shall select 30 days and offer the choices 1 day, 30 days and Custom range. — proof: red-first unit
- AC-47 WHEN the user picks a period, the system shall keep it in the page address so that a reload shows the same period. — proof: red-first unit
- AC-26 WHEN Custom range is chosen, the system shall let the user pick a from and a to date (UTC), and shall not request data until both are set and valid. — proof: red-first unit
- AC-27 WHEN data has loaded, the system shall show four cards, each naming the selected period:
  - Total runs, with the per-status counts that are non-zero (e.g. "incl. 2 failed");
  - Total cost, with the unpriced-run count;
  - Avg accept rate, with "n decisions", a note that it pools decisions across agents, and a small-sample badge when it applies;
  - Most-active agent, with name, runs, and accept rate with its decisions.

  — proof: red-first unit
- AC-46 The system shall state on the page that Runs counts every run in the period (running, done, failed, cancelled) and that Avg cost, Avg duration and the unpriced count cover completed runs only. — proof: red-first unit
- AC-28 The system shall label every cost figure on the page as "DevDigest estimate (token × price book)" and show "Reconciled billing: not connected" on the Total cost card, with no reconciled amount anywhere. — proof: red-first unit
- AC-29 The system shall show a table with the columns Agent, Runs, Avg cost, Avg duration, Accept rate (with "n decisions" and a "small sample" badge below 10), Last run and View. — proof: red-first unit
- AC-30 WHILE no column has been chosen, the system shall sort rows by accept rate, highest first, in this order:
  1. agents with 10 or more decisions;
  2. small-sample agents with 1 to 9 decisions;
  3. agents with no decisions;
  4. the Deleted agent row, always last.

  Ties break by runs (most first), then by name A→Z. — proof: red-first unit
- AC-31 WHEN the user sorts by a column (Agent, Runs, Avg cost, Avg duration, Accept rate, Last run), the system shall reorder the rows without any request. Empty values go last in either direction. Sorting by accept rate keeps the small-sample grouping, and the Deleted agent row stays last. — proof: red-first unit
- AC-32 WHEN an agent has no runs in the period, the system shall show its row with "No runs in this period" and "—" for every average, rate and last run. — proof: red-first unit
- AC-33 The system shall render every null metric as "—" and never as 0, $0.00 or 0%. — proof: red-first unit
- AC-34 WHILE the data for the selected period is loading, the system shall show placeholders in place of every card, row and breakdown, and no number. — proof: red-first unit
- AC-35 IF the dashboard request fails, THEN the system shall show an error state with a retry action and no number. — proof: red-first unit
- AC-36 WHEN no run of the workspace falls in the selected period, the system shall show a page-level empty state ("No agent runs in this period") with the period selector still usable, and no cards, table numbers or breakdowns. — proof: red-first unit
- AC-37 The system shall show a Cost breakdown with a By agent list and a By model list (by run model). Each list names every bucket that has runs, with its cost ("—" when unpriced), including the Deleted agent and Unknown model buckets when present. — proof: red-first unit
- AC-38 WHEN the user expands an agent row, the system shall show that agent's split by model (runs, cost, accept rate with decisions) from the data already loaded, without a new request. — proof: red-first unit
- AC-39 WHEN the user clicks View on an agent row, the system shall open that agent's Stats tab with the same period (the preset, or the same from and to dates). — proof: red-first unit
- AC-40 WHEN the dashboard or a Stats tab loads, reloads, changes period, sorts or expands a row, the browser shall send only GET requests to the stats, dashboard and agent endpoints, and no review-run request. — proof: browser (main session)
- AC-41 WHEN the agent editor opens with the Stats tab named in its address, the system shall show the Stats tab with the period named in the address (30 days when none). — proof: red-first unit
- AC-42 The system shall show on the Stats tab:
  - the same metrics as the agent's dashboard row: runs with per-status counts, Total cost with the unpriced count and the estimate label, Avg cost, Avg duration, accept rate with decisions and the small-sample badge, pending count, last run;
  - its split by model;
  - the same period selector.

  — proof: red-first unit
- AC-48 The system shall show on the Stats tab the no-runs, null, loading and error states of AC-32 to AC-35. — proof: red-first unit
- AC-43 WHEN the dev seed runs, the system shall store review runs, placed relative to the seed time, on a seeded PR of their own. They shall cover at least two agents and two models within the last 24 hours and within the last 30 days, and include:
  - one agent with 10 or more decisions;
  - one agent with 1 to 9 decisions;
  - one agent with no runs;
  - a failed run;
  - a done run with no recorded cost;
  - a run with no agent;
  - a run with no model.

  Every seeded finding shall belong to a review linked to a seeded run. — proof: red-first integration
- AC-49 WHEN the dev seed runs a second time, the system shall leave the number of seeded runs, reviews and findings unchanged, and shall move the seed-owned demo runs to the new seed time. — proof: red-first integration
- AC-50 WHEN the dev seed runs, the system shall make no LLM provider call. — proof: red-first integration
- AC-51 WHEN the demo data is seeded, the system shall leave the existing seeded screens unchanged: PR #482's latest review, its findings and its PR-list cost. — proof: e2e
- AC-44 WHEN the user opens Agent Performance from the sidebar on seeded data, the system shall show the seeded agents and support this journey: switch to 1 day with different totals, expand a row, and open View on the Stats tab with the same runs and accept rate as the row. — proof: e2e
- AC-45 WHEN the workspace holds 10,000 runs and 50,000 findings within the window, the system shall answer the dashboard request within 1 s on a local development machine. — proof: browser (main session)

## Traceability
| AC | step | test | proof |
|---|---|---|---|
| AC-1 | 3, 4 | `server/test/agent-performance.it.test.ts` "AC-1 …" | red-first integration |
| AC-2 | 3, 4 | same file "AC-2 …" | red-first integration |
| AC-3 | 3, 4 | same file "AC-3 …" | red-first integration |
| AC-4 | 3, 4 | same file "AC-4 …" (HTTP, both endpoints) | red-first integration |
| AC-5 | 3, 4 | same file "AC-5 …" | red-first integration |
| AC-6 | 4 | same file "AC-6 …" | red-first integration |
| AC-7 | 3, 4 | same file "AC-7 …" | red-first integration |
| AC-8 | 3, 4 | same file "AC-8 …" | red-first integration |
| AC-9 | 3, 4 | same file "AC-9 …" | red-first integration |
| AC-10 | 3, 4 | same file "AC-10 …" | red-first integration |
| AC-11 | 3, 4 | same file "AC-11 …" | red-first integration |
| AC-12 | 3, 4 | same file "AC-12 …" | red-first integration |
| AC-13 | 3 | same file "AC-13 …" | red-first integration |
| AC-14 | 3 | same file "AC-14 …" | red-first integration |
| AC-15 | 3, 4 | same file "AC-15 …" | red-first integration |
| AC-16 | 3, 4 | same file "AC-16 …" | red-first integration |
| AC-17 | 3 | same file "AC-17 …" | red-first integration |
| AC-18 | 3 | same file "AC-18 …" | red-first integration |
| AC-19 | 3, 4 | same file "AC-19 …" | red-first integration |
| AC-20 | 3, 4 | same file "AC-20 …" (service, pinned) + "AC-20 HTTP …" | red-first integration |
| AC-21 | 4 | same file "AC-21 …" | red-first integration |
| AC-22 | 4 | same file "AC-22 …" | red-first integration |
| AC-23 | 4 | same file "AC-23 …" | red-first integration |
| AC-24 | 5 | `client/src/components/app-shell/AgentPerformanceNav.test.tsx` | red-first unit |
| AC-25 | 5, 6 | `client/src/app/agent-performance/_components/AgentPerformanceView/AgentPerformanceView.test.tsx` "AC-25 …" | red-first unit |
| AC-47 | 5, 6 | same file "AC-47 …" | red-first unit |
| AC-26 | 5, 6 | same file "AC-26 …" | red-first unit |
| AC-27 | 6 | same file "AC-27 …" | red-first unit |
| AC-46 | 6 | same file "AC-46 …" | red-first unit |
| AC-28 | 6 | same file "AC-28 …" | red-first unit |
| AC-29 | 6 | same file "AC-29 …" | red-first unit |
| AC-30 | 6 | same file "AC-30 …" | red-first unit |
| AC-31 | 6 | same file "AC-31 …" | red-first unit |
| AC-32 | 6 | same file "AC-32 …" | red-first unit |
| AC-33 | 6 | same file "AC-33 …" | red-first unit |
| AC-34 | 6 | same file "AC-34 …" | red-first unit |
| AC-35 | 6 | same file "AC-35 …" | red-first unit |
| AC-36 | 6 | same file "AC-36 …" | red-first unit |
| AC-37 | 6 | same file "AC-37 …" | red-first unit |
| AC-38 | 5, 6 | same file "AC-38 …" | red-first unit |
| AC-39 | 6 | same file "AC-39 …" | red-first unit |
| AC-40 | 6, 7 | network panel on the dev stack | browser (main session) |
| AC-41 | 7 | `client/src/app/agents/[id]/page.stats.test.tsx` + `client/src/app/agents/[id]/page.test.tsx` "?tab=stats …" | red-first unit |
| AC-42 | 7 | `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/StatsTab.test.tsx` "AC-42 …" | red-first unit |
| AC-48 | 7 | same file "AC-48 …" | red-first unit |
| AC-43 | 8 | `server/test/seed-agent-performance.it.test.ts` "AC-43 …" | red-first integration |
| AC-49 | 8 | same file "AC-49 …" | red-first integration |
| AC-50 | 8 | same file "AC-50 …" | red-first integration |
| AC-51 | 8 | existing `e2e/specs/01…12` under `npm run e2e:hermetic` | e2e |
| AC-44 | 5, 6, 7, 8, 9 | `e2e/specs/13-agent-performance.flow.json` | e2e |
| AC-45 | 4 | three timed dashboard requests on a synthetic dev DB | browser (main session) |

## Red-first
Written in step 2 by one general-purpose agent restricted to test files, before lanes A/B/C start. Every file below is **read-only for every lane**. The client red runs are recorded by the writer. The server `*.it.test.ts` red runs are recorded by the main session after it has read the files, because they need Docker.
- AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23 → `server/test/agent-performance.it.test.ts` — one `it` per AC, named `"AC-N <short claim>"` (e.g. `"AC-1 1 day counts (now−24h, now]"`); AC-20 also `"AC-20 HTTP dashboard row equals GET /agents/:id/stats"`.
- AC-43, AC-49, AC-50 → `server/test/seed-agent-performance.it.test.ts` — `"AC-43 fresh seed covers every demo case for 1 day and 30 days on its own PR"`, `"AC-49 second seed keeps counts and moves demo runs to the new seed time"`, `"AC-50 seed makes no provider call"`.
- AC-24 → `client/src/components/app-shell/AgentPerformanceNav.test.tsx` — `"AC-24 GLOBAL → Agent Performance links to /agent-performance and is active there"`.
- AC-25, AC-47, AC-26, AC-27, AC-46, AC-28, AC-29, AC-30, AC-31, AC-32, AC-33, AC-34, AC-35, AC-36, AC-37, AC-38, AC-39 → `client/src/app/agent-performance/_components/AgentPerformanceView/AgentPerformanceView.test.tsx` — one `it` per AC, named `"AC-N …"`.
- AC-41 → `client/src/app/agents/[id]/page.stats.test.tsx` (new) `"AC-41 ?tab=stats&period=1d opens Stats with 1 day selected"`, plus two cases appended to `client/src/app/agents/[id]/page.test.tsx`: `"AC-41 ?tab=stats renders the Stats tab"` and the existing unknown-tab fallback, which stays.
- AC-42, AC-48 → `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/StatsTab.test.tsx` — `"AC-42 …"`, `"AC-48 no runs"`, `"AC-48 loading shows no digits"`, `"AC-48 error shows Retry"`.

How the red-first tests must reach the code (the interfaces in Steps 1, 3–7 are binding for them):
- **Server, pinned clock (AC-1..3, 5..20, 22):** service level, on workspaces the test inserts itself. Use `buildAgentPerformanceService(new Container(config(), pg.handle.db), { now: () => NOW })` with `NOW = new Date('2026-10-15T12:00:00.000Z')`, calling `service.dashboard(ws, query)` / `service.agentStats(ws, agentId, query)`. No `vi.useFakeTimers`: it breaks postgres-js (`server/test/onboarding-service.it.test.ts:35-37`). No `seed()` call, so lane C's demo data can never move these numbers. Runs are inserted with an explicit `ranAt`, `status`, `model`, `costUsd`, `durationMs`; reviews with `runId` set; findings with `acceptedAt`/`dismissedAt`.
- **Server, HTTP (AC-4, AC-21, AC-23, AC-20 HTTP):** `buildApp({ config: config(), db, overrides: { auth, llm } })`. `auth` is a test `AuthProvider` returning a workspace and user the test inserted (`server/src/vendor/shared/adapters.ts:274-277`). `llm` is one `MockLLMProvider` registered under `openai`, `anthropic` and `openrouter` (`server/INSIGHTS.md:80`, pattern `server/test/brief.it.test.ts:292`). Build the app **before** inserting any `running` run, and take AC-23's baseline row counts **after** `buildApp`, because boot reaps `running` runs to `failed` (`server/src/app.ts:81-86`). AC-4 uses real time, so "to after today" sends `to=2999-01-01`. The five inputs plus `period=week` go to both `/agent-performance` and `/agents/<live id>/stats`; expect status 400 and a body whose only key is `error`. AC-21 uses a uuid agent from a second workspace plus `randomUUID()`.
- **Client:** mock `@/lib/api` (`api.get` as `vi.fn`) with a real `QueryClientProvider` (retry off), as in `client/src/lib/hooks/brief.test.tsx:11-23`, so "zero new requests" and "Retry = one GET" count `api.get` calls. Mock `next/navigation` (`useSearchParams`, `useRouter().replace/push`) and `@/components/app-shell` as in `client/src/app/eval/_components/EvalDashboardView/EvalDashboardView.test.tsx:24-31`. Render inside `NextIntlClientProvider` with `messages/en/agentPerformance.json` (page) or `messages/en/agents.json` (Stats tab). Query with `getByRole`/`getByText`; `fireEvent` only (no user-event, `client/INSIGHTS.md:31`). Assert visible strings exactly as listed under *Contracts & data → i18n*.

## Review focus
- Custom range whose `to` is today (window ends tomorrow 00:00Z and must not be rejected as "after today") → pinned by `agent-performance-window.test.ts` "custom to = today is valid" in step 3.
- A run whose `agent_id` is not in the workspace's agent list → goes to the Deleted agent row, pinned by `agent-performance-helpers.test.ts` "unknown agent id lands in deleted_agents" in step 3.
- A finding with a severity outside CRITICAL/WARNING/SUGGESTION → counted in `findings_total`/decisions, absent from `findings_by_severity`, pinned by `agent-performance-helpers.test.ts` "unknown severity" in step 3.
- Double-clicking Retry → still one GET in flight, pinned by `AgentPerformanceView.test.tsx` (lane B's own) "Retry twice while pending issues one GET" in step 6.
- Custom range typed with `from` > `to` → no request plus an inline hint, pinned by `client/src/components/period-selector/helpers.test.ts` "from after to → null" in step 5.

## Context read
- `server/INSIGHTS.md:14` — declaring `response: { 200: <Zod> }` strips extra keys and turns a bad body into a 500. Both routes declare the contract, which also makes AC-20 an object compare.
- `server/INSIGHTS.md:88` — drizzle `sum()` returns a string. Write aggregates as raw `sql<number | null>`. Counts are `count(*)::int` (pattern `server/test/integration.it.test.ts:34`).
- `server/INSIGHTS.md:80` — register a mock LLM under every provider id (AC-23, AC-50).
- `server/INSIGHTS.md:65` — the two vendor copies already drift in comments. Diff only `observability.ts`.
- `server/INSIGHTS.md:85` — `pnpm typecheck` never sees `server/test/**`. Red tests importing a missing module pass typecheck, so only a vitest run proves anything.
- `server/test/onboarding-service.it.test.ts:35-37` — fake timers break postgres-js, so the clock is an injected `now` port.
- `server/src/app.ts:81-86` — boot reaps `running` runs, which shapes the AC-7 and AC-23 test order.
- `server/src/app.ts:128-139`, `server/src/platform/errors.ts:7-28` — zod errors → 422 and `AppError` defaults to 400, which drives the AC-4 decision.
- `server/src/db/schema/runs.ts:8-42`, `reviews.ts:9-46`, `agents.ts:8-39` — `agent_runs.agent_id` is set null on agent delete. `reviews.run_id` is not an FK. Decisions are `findings.accepted_at`/`dismissed_at`. The only existing index is `(pr_id, status, ran_at)`.
- `server/src/db/seed.ts:104-186, 331-352, 380-383` — PR #482 is inserted only when missing. Agents are looked up by name. `seedEvalDemo` stamps Security Reviewer onto every review with `model = 'seed'` and a null agent, so demo reviews must never use model `'seed'`.
- `server/src/modules/brief/wiring.ts:18-57`, `brief/routes.ts:16-41` — the composition pattern to copy. `buildProjectContextService(container)` shows that a builder without `log` is precedent.
- `client/INSIGHTS.md:17` — a new editor tab needs `AgentEditor/constants.ts` **and** the page's `VALID_TABS`, plus a page test for `?tab=<new>`.
- `client/INSIGHTS.md:35` — next-intl only logs `MISSING_MESSAGE`. Shared components take labels as props, and tests provide the namespace they render.
- `client/INSIGHTS.md:37` — client imports only types from the `@devdigest/shared` barrel; a runtime value needs a deep import of the contract file.
- `client/INSIGHTS.md:31` — no `@testing-library/user-event`; use `fireEvent`. In srt, client typecheck is `tsc --noEmit --incremental false`.
- `client/src/components/app-shell/helpers.ts:37` — `/agent-performance` already maps to key `agent-performance`. `client/messages/en/shell.json:27` has its label.
- `client/src/vendor/ui/nav.ts:21-42` — NAV has WORKSPACE and SKILLS LAB only, so GLOBAL is appended after SKILLS LAB. That matches the frame `specs/designs/agent-performance/1.webp`, which uses an Activity-style icon.
- `client/src/app/agents/[id]/page.tsx:17,31-36` — `VALID_TABS` and `setTab`, which copies existing search params, so `period` survives tab switches.
- `client/src/components/run-cost-badge/format.ts:7` — the existing cost formatter (`formatCost(usd, 3)`), reused for sub-cent display.
- `client/src/app/repos/[repoId]/pulls/helpers.ts:11` — `relativeTime` is route-private. Importing it would break frontend rule 7, so Last run uses next-intl `useFormatter().relativeTime`.
- `client/src/vendor/ui/primitives/ErrorState.tsx:51-54` — the Retry button text is "Retry".
- `e2e/INSIGHTS.md:13,24,21` — use `find text … click` rather than `role link --name`; put a `wait --text` before every click on fetched data; hermetic e2e breaks a running dev server's `.next`.

## Affected surfaces
- server → shared contract → contracts → `server/src/vendor/shared/contracts/observability.ts` (changed)
- client → shared contract mirror → `client/src/vendor/shared/contracts/observability.ts` (changed, byte-identical to server)
- server → agent-performance → route → `server/src/modules/agent-performance/routes.ts` (new)
- server → agent-performance → wiring → `server/src/modules/agent-performance/wiring.ts` (new)
- server → agent-performance → service → `server/src/modules/agent-performance/service.ts` (new)
- server → agent-performance → service helpers (pure) → `server/src/modules/agent-performance/helpers.ts`, `window.ts`, `types.ts`, `constants.ts` (new)
- server → agent-performance → repository → `server/src/modules/agent-performance/repository.ts` (new)
- server → module registry → `server/src/modules/index.ts` (changed)
- server → db seed → `server/src/db/seed.ts` (changed), `server/src/db/seed-agent-performance.ts` (new)
- client → nav config → `client/src/vendor/ui/nav.ts` (changed)
- client → data → `client/src/lib/hooks/agent-performance.ts` (new)
- client → shared components → `client/src/components/period-selector/**`, `client/src/components/model-split/**` (new)
- client → route `/agent-performance` → `client/src/app/agent-performance/page.tsx` + `_components/AgentPerformanceView/**` (new)
- client → agent editor → `client/src/app/agents/[id]/page.tsx`, `.../AgentEditor/AgentEditor.tsx`, `.../AgentEditor/constants.ts` (changed), `.../AgentEditor/_components/StatsTab/**` (new)
- client → i18n → `client/messages/en/agentPerformance.json` (rewritten), `client/messages/en/agents.json` (changed)
- e2e → `e2e/specs/13-agent-performance.flow.json` (new)

## Constraints
- **Where the aggregation lives: a new module `server/src/modules/agent-performance/` owns the one repository query and both routes (`GET /agent-performance` and `GET /agents/:id/stats`).**
  - Why not inside `agents`: it composes in `routes.ts` with a whole-`Container` service (`server/src/modules/agents/routes.ts:74`). That shape is grandfathered. Adding a port-based service there means either extending the grandfathered shape or migrating `agents` to `wiring.ts`, which nobody asked for (`.claude/skills/onion-architecture/SKILL.md:15,18`).
  - The new module gets its own `wiring.ts` → port-based service → repository (`SKILL.md:14-15,18`), its own `AgentPerformanceRepository` reading `agents`, `agent_runs`, `reviews` and `findings` through `src/db/schema`, and no import of another module's data access (`.claude/rules/onion-boundaries.md:21-25`).
  - Fastify route paths are global, so `/agents/:id/stats` registered by this module cannot collide with the `agents` module (there is no `/stats` route today).
  - One service method feeds both endpoints, so AC-20 parity holds by construction.
- **The route handler parses, calls the service, maps the result; no query, no adapter.** Source: `.claude/rules/onion-boundaries.md:16-17`. Routes call `buildAgentPerformanceService(container)` once.
- **Application code imports no `fastify`, `drizzle-orm` or `src/db/**`.** `service.ts`, `helpers.ts`, `window.ts` and `types.ts` import only `@devdigest/shared` and `../../platform/errors.js`. Source: `onion-boundaries.md:26-29`.
- **The service takes ports, not `Container`.** Source: `SKILL.md:18`.
- **Clock.** `now` is a service port. Window bounds and "today (UTC)" are computed from it in `window.ts` and passed to SQL as parameters. No `now()`, `current_date` or `current_timestamp` in any query. Source: test needs, plus `server/test/onboarding-service.it.test.ts:35-37`.
- **Aggregates in SQL** use raw `sql<number | null>` for sums and `count(*)::int` for counts. Every timestamp leaving the repository is normalised by `toIso(v: Date | string | null): string | null` (helpers), so `last_run_at` and `window.*` are `toISOString()` strings and AC-20 compares identical strings. Source: `server/INSIGHTS.md:88`.
- **No schema change, no migration.** If one turns out to be needed, it goes through `pnpm db:generate` + `pnpm db:migrate` after Glib's sign-off. Source: root `CLAUDE.md` Do-not-touch, `.claude/rules/db-schema.md:9-13`.
- **Contract first, mirrored byte-for-byte.** Server copy edited first, client copy identical. Check with `diff server/src/vendor/shared/contracts/observability.ts client/src/vendor/shared/contracts/observability.ts` (empty output). Ignore the other files' drift. Source: `.claude/rules/shared-contracts.md:9-14`, `server/INSIGHTS.md:65`.
- **400 for a bad period, fixed message.** `AppError('invalid_period', 'Invalid period', 400)` with no `details`. The querystring schema is permissive (`z.record(z.string(), z.unknown())`). Validation runs in `resolveWindow` before any query, then the agent check. Source: spec AC-4 and NFR security, `server/src/app.ts:165-169`.
- **Routes declare `response: { 200: AgentPerformance }` / `{ 200: AgentStats }`.** Source: `server/INSIGHTS.md:14`.
- **Seed stays idempotent, and the demo runs move.** Source: `.claude/rules/db-schema.md:18-19`.
  - Demo rows use fixed UUIDs. Runs are written with `onConflictDoUpdate({ target: id, set: { ranAt } })`.
  - Reviews and findings use `onConflictDoNothing`.
  - The demo PR is inserted only when missing. Demo reviews never use `model = 'seed'` (`server/src/db/seed.ts:380-383`).
- **Client placement.** Source: `.claude/skills/frontend-ui-architecture/SKILL.md:13-20`.
  - Route-only code is colocated under `app/agent-performance/_components/`.
  - `PeriodSelector` and `ModelSplit` have a second consumer from day one (the Stats tab in `/agents/[id]`), so they live in `src/components/period-selector/` and `src/components/model-split/`.
  - Data goes through `src/lib/hooks/agent-performance.ts` → `src/lib/api.ts`.
  - Imports point downhill only. No new `export *`.
- **Shared components take labels as props** (no `useTranslations` inside `period-selector` / `model-split`). Source: `client/INSIGHTS.md:35`, spec i18n NFR.
- **A new editor tab is two edits plus a page test.** Source: `client/INSIGHTS.md:17`.
- **Text-only rendering.** Agent and model names render as plain text: no `dangerouslySetInnerHTML`, no Markdown, no link. Long names truncate with a `title` attribute. Source: spec Untrusted inputs.
- **Accessibility.** Sortable headers are `<button>` with `aria-sort` on the `<th>`. The expand control is a `<button aria-expanded>`. Period choices are `<button aria-pressed>`. Date inputs are `<input type="date">` with labels. Source: spec NFR accessibility.
- **e2e.** Deterministic locators only. A `wait --text` goes before every click on fetched data. Nothing in the flow may trigger an LLM call. Source: `e2e/CLAUDE.md` Rules, `e2e/INSIGHTS.md:13,24`.
- **Never edit** `server/src/db/migrations/`, lock files, `.dependency-cruiser.cjs` or its baseline, the `GRANDFATHERED` list, or `server/clones/`. Source: root `CLAUDE.md`, `onion-boundaries.md:32-35`.

## Skills for the implementer
- client/** → frontend-ui-architecture, next-best-practices, react-best-practices, react-testing-library, security, zod
- server/** → onion-architecture, fastify-best-practices, drizzle-orm-patterns, security, zod
- server/src/db/** (lane C) → the server row plus postgresql-table-design
- e2e/** → no skill; review against `e2e/CLAUDE.md`

## Lanes
| lane | steps | owned paths | after |
|---|---|---|---|
| 0 | 1 | `server/src/vendor/shared/contracts/observability.ts`, `client/src/vendor/shared/contracts/observability.ts` | — |
| RF | 2 | test files only: `server/test/agent-performance.it.test.ts`, `server/test/seed-agent-performance.it.test.ts`, `client/src/components/app-shell/AgentPerformanceNav.test.tsx`, `client/src/app/agent-performance/_components/AgentPerformanceView/AgentPerformanceView.test.tsx`, `client/src/app/agents/[id]/page.stats.test.tsx`, `client/src/app/agents/[id]/page.test.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/StatsTab.test.tsx` | 0 |
| A | 3, 4 | `server/src/modules/agent-performance/**`, `server/src/modules/index.ts`, `server/test/agent-performance-window.test.ts`, `server/test/agent-performance-helpers.test.ts` | RF |
| B | 5, 6, 7 | `client/src/vendor/ui/nav.ts`, `client/src/lib/hooks/agent-performance.ts`, `client/src/components/period-selector/**`, `client/src/components/model-split/**`, `client/src/app/agent-performance/**` (except the RF test file), `client/src/app/agents/[id]/page.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`, `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/**` (except the RF test file), `client/messages/en/agentPerformance.json`, `client/messages/en/agents.json` | RF |
| C | 8, 9 | `server/src/db/seed.ts`, `server/src/db/seed-agent-performance.ts`, `server/test/seed-agent-performance-demo.test.ts`, `e2e/specs/13-agent-performance.flow.json` | RF |

DAG levels:
- Level 0 = lane 0.
- Level 1 = RF.
- Level 2 = A ∥ B ∥ C.
- After level 2: the main session runs the package gate, then the server integration suite through plan-verifier, then e2e.

Notes on lane C:
- `seed-agent-performance.it.test.ts` (AC-43/49) queries the aggregation, so it can go green only once lane A is done. It is judged at the final level, not inside lane C.
- `e2e/specs/13-…` asserts strings lane B renders. Those strings are fixed under *Contracts & data*, so C can write the flow in parallel.

## Steps
1. [BE] server + client — extend the shared observability contract and mirror it
   - files: `server/src/vendor/shared/contracts/observability.ts` (changed), `client/src/vendor/shared/contracts/observability.ts` (changed, byte-identical)
   - layer: contracts · lane: 0
   - skills: zod, onion-architecture
   - turns green: none
   - test first: none (types only; `AgentStats` has no reader today)
   - interfaces: produces these schemas and same-name types, all snake_case:
     - `StatsPeriod = z.enum(['1d','30d','custom'])`
     - `StatsQuery = z.object({ period: StatsPeriod.optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })`
     - `StatsWindow = z.object({ period: StatsPeriod, start: z.string(), end: z.string() })`
     - `RunsByStatus = z.object({ running, done, failed, cancelled })` (all int)
     - `AgentModelSplit = z.object({ model: z.string().nullable(), runs: int, total_cost_usd: number.nullable(), accepted: int, dismissed: int, decisions: int, accept_rate: number.nullable() })`
     - `AgentStatsMetrics` = every existing `AgentStats` field except `agent_id`/`agent_name`, plus `window: StatsWindow`, `runs_by_status: RunsByStatus`, `unpriced_runs: int`, `decisions: int`, `small_sample: boolean`, `last_run_at: z.string().nullable()`, `by_model: z.array(AgentModelSplit)`, `cost_basis: z.literal('estimate')`
     - `AgentStats = AgentStatsMetrics.extend({ agent_id: z.string(), agent_name: z.string() })`
     - `PerformanceTotals = z.object({ runs, runs_by_status: RunsByStatus, total_cost_usd: number.nullable(), unpriced_runs, accepted, dismissed, pending, decisions, accept_rate: number.nullable(), small_sample: boolean })`
     - `MostActiveAgent = z.object({ agent_id: z.string(), agent_name: z.string(), runs: int, accept_rate: number.nullable(), decisions: int })`
     - `CostByAgent = z.object({ agent_id: z.string().nullable(), agent_name: z.string().nullable(), runs: int, total_cost_usd: number.nullable() })`
     - `CostByModel = z.object({ model: z.string().nullable(), runs: int, total_cost_usd: number.nullable() })`
     - `AgentPerformance = z.object({ window: StatsWindow, small_sample_threshold: int, cost_basis: z.literal('estimate'), billing_reconciliation: z.literal('not_connected'), totals: PerformanceTotals, most_active: MostActiveAgent.nullable(), agents: z.array(AgentStats), deleted_agents: AgentStatsMetrics.nullable(), cost_by_agent: z.array(CostByAgent), cost_by_model: z.array(CostByModel) })`
     - Update the header comment to name `GET /agent-performance`.
   - verify: `diff server/src/vendor/shared/contracts/observability.ts client/src/vendor/shared/contracts/observability.ts` → no output; `pnpm --dir server typecheck` and `pnpm --dir client typecheck` → exit 0

2. [BE+UI] tests only — red-first tests (general-purpose agent, test files only)
   - files: the seven test files in lane RF (all new except `client/src/app/agents/[id]/page.test.tsx`, which gets cases appended)
   - layer: tests · lane: RF
   - skills: react-testing-library, zod (client); fastify-best-practices, drizzle-orm-patterns (server, test parts)
   - turns green: none (writes them red)
   - test first: every row of `## Red-first`, wired as described under it, against the interfaces of steps 1, 3–7 and the strings under *Contracts & data*.
   - interfaces: consumes step 1's names and these step 3–7 names, verbatim:
     - `buildAgentPerformanceService(container, { now })` with `.dashboard(ws, query)` and `.agentStats(ws, agentId, query)`
     - `StatsTab({ agent })`
     - `AgentPerformanceView()` (no props)
     - hooks `useAgentPerformance` / `useAgentStats` (mocked only through `@/lib/api`)
     - API paths `/agent-performance?…` and `/agents/<id>/stats?…`
     - URL params `period`, `from`, `to`, `tab=stats`
     - the e2e-visible strings
   - verify:
     - client: `pnpm --dir client exec vitest run src/components/app-shell/AgentPerformanceNav.test.tsx src/app/agent-performance src/app/agents/[id]` → every new `AC-…` case fails on a missing module, label or assertion. No syntax or import-path errors other than the not-yet-created modules. The pre-existing `page.test.tsx` cases still pass.
     - server: the main session reads both `.it.test.ts` files, then runs `pnpm --dir server exec vitest run test/agent-performance.it.test.ts test/seed-agent-performance.it.test.ts` → red on the missing `modules/agent-performance/wiring.js` (and on the missing demo data). It must not say "skipped": no Docker means not run.

3. [BE] server — period window resolver and the pure aggregation builder
   - files: `server/src/modules/agent-performance/types.ts`, `window.ts`, `helpers.ts`, `constants.ts` (new); `server/test/agent-performance-window.test.ts`, `server/test/agent-performance-helpers.test.ts` (new, lane-owned)
   - layer: service helpers (application, pure) · lane: A
   - skills: onion-architecture, zod, security
   - turns green: none on its own; with step 4, the AC-1..AC-20 rows
   - test first:
     - `agent-performance-window.test.ts`:
       - "1d → start now−24h exclusive, end now inclusive"
       - "30d → start now−720h"
       - "missing period → 30d"
       - "custom → [from 00:00Z, to+1 00:00Z)"
       - "custom to = today is valid"
       - "throws AppError 400 invalid_period for: period=week, malformed date, missing to, from>to, to>today, 367-day span", asserting `statusCode === 400` and `code === 'invalid_period'`
     - `agent-performance-helpers.test.ts`, on hand-built `RawAggregate` fixtures:
       - "avg duration uses done runs with duration only" (1000/3000 + failed 0 → 2000)
       - "avg cost over priced done runs" (0.02/0.04 + unpriced → 0.03)
       - "total cost null when nothing priced"
       - "accept rate pooled not averaged" (9/10 + 0/2 → 0.75)
       - "small sample below 10"
       - "deleted bucket never most-active"
       - "most-active tie → latest last run → name"
       - "by-agent and by-model sums equal totals within 1e-9"
       - "Unknown model bucket has model null"
       - "unknown agent id lands in deleted_agents"
       - "unknown severity counted, not in findings_by_severity"
       - "trend has one point per UTC day oldest→newest"
       - "toIso normalises Date and string"
   - interfaces: produces
     - `type WindowBounds = { period: StatsPeriod; start: Date; end: Date; startInclusive: boolean; endInclusive: boolean }`
     - `resolveWindow(query: unknown, now: Date): WindowBounds` — throws `AppError('invalid_period','Invalid period',400)`
     - `type RunGroupRow = { agentId: string | null; model: string | null; status: string | null; runs: number; costSum: number | null; priced: number; durationSum: number | null; durationN: number; lastRunAt: Date | string | null }`
     - `type FindingGroupRow = { agentId: string | null; model: string | null; severity: string; accepted: number; dismissed: number; pending: number }`
     - `type TrendRow = { agentId: string | null; day: string; runs: number }`
     - `type WorkspaceAgentRow = { id: string; name: string }`
     - `type RawAggregate = { runs: RunGroupRow[]; findings: FindingGroupRow[]; trend: TrendRow[] }`
     - `buildPerformance(agents: WorkspaceAgentRow[], raw: RawAggregate, w: WindowBounds): AgentPerformance`
     - `toIso(v: Date | string | null): string | null`
     - constant `SMALL_SAMPLE_THRESHOLD = 10`
     - Rows of `agents` are ordered by name A→Z. `cost_by_agent` holds live agents with runs > 0 plus the deleted bucket when present. `cost_by_model` holds every model with runs > 0.
   - verify: `pnpm --dir server exec vitest run test/agent-performance-window.test.ts test/agent-performance-helpers.test.ts` → all tests passed

4. [BE] server — repository, service, wiring, routes, registration
   - files: `server/src/modules/agent-performance/repository.ts`, `service.ts`, `wiring.ts`, `routes.ts` (new); `server/src/modules/index.ts` (changed: `import agentPerformance from './agent-performance/routes.js'` and the entry `agentPerformance`)
   - layer: repository → service → wiring → route · lane: A
   - skills: onion-architecture, fastify-best-practices, drizzle-orm-patterns, security, zod
   - turns green: `server/test/agent-performance.it.test.ts` AC-1 … AC-23 (green is proven by plan-verifier, since Docker is involved)
   - test first: none beyond step 3 (the SQL is proven by the red-first integration file)
   - interfaces: consumes step 3's types and `buildPerformance`; produces
     - `class AgentPerformanceRepository { constructor(db: Db); workspaceAgents(ws: string): Promise<WorkspaceAgentRow[]>; agentInWorkspace(ws: string, agentId: string): Promise<boolean>; aggregate(ws: string, w: WindowBounds): Promise<RawAggregate> }`
       - Every query filters `agent_runs.workspace_id = ws` and the window predicate built from `w`'s bounds and inclusivity.
       - Findings join `findings → reviews (reviews.run_id = agent_runs.id AND reviews.workspace_id = ws) → agent_runs`.
       - Decision state: accepted = `accepted_at IS NOT NULL`; dismissed = `dismissed_at IS NOT NULL AND accepted_at IS NULL`; pending = both null.
       - Trend day = `to_char(ran_at AT TIME ZONE 'UTC','YYYY-MM-DD')`.
     - `interface AgentPerformancePorts { now(): Date; workspaceAgents(ws): Promise<WorkspaceAgentRow[]>; agentInWorkspace(ws, id): Promise<boolean>; aggregate(ws, w): Promise<RawAggregate> }`
     - `class AgentPerformanceService { constructor(ports: AgentPerformancePorts); dashboard(ws: string, query: unknown): Promise<AgentPerformance>; agentStats(ws: string, agentId: string, query: unknown): Promise<AgentStats> }`
       - `agentStats` resolves the window first (400), then checks the agent (`NotFoundError('Agent not found')` → 404), then returns `buildPerformance(...).agents.find(a => a.agent_id === agentId)`. One code path, so parity holds.
     - `buildAgentPerformanceService(container: Container, opts: { now?: () => Date } = {}): AgentPerformanceService` (default `now = () => new Date()`)
     - routes: `GET /agent-performance` (`schema: { querystring: z.record(z.string(), z.unknown()), response: { 200: AgentPerformance } }`) and `GET /agents/:id/stats` (`params: IdParams`, same querystring, `response: { 200: AgentStats }`). Each resolves `getContext` and calls the service.
   - verify: `pnpm --dir server typecheck` → exit 0 on the lane's paths; `pnpm --dir server exec vitest run test/route-adapter-calls.test.ts` → passed (the new route file has zero adapter calls)

5. [UI] client — data hook, shared period selector and model split, GLOBAL nav
   - files:
     - `client/src/lib/hooks/agent-performance.ts` (new)
     - `client/src/components/period-selector/{PeriodSelector.tsx, PeriodSelector.test.tsx, helpers.ts, helpers.test.ts, styles.ts, index.ts}` (new)
     - `client/src/components/model-split/{ModelSplit.tsx, ModelSplit.test.tsx, helpers.ts, helpers.test.ts, styles.ts, index.ts}` (new)
     - `client/src/vendor/ui/nav.ts` (changed: append `{ section: "GLOBAL", items: [{ key: "agent-performance", label: "Agent Performance", icon: "Activity", href: "/agent-performance" }] }` after SKILLS LAB)
   - layer: lib/hooks · shared components · nav config · lane: B
   - skills: frontend-ui-architecture, react-best-practices, react-testing-library, next-best-practices, zod, security
   - turns green: `AgentPerformanceNav.test.tsx` AC-24
   - test first:
     - `period-selector/helpers.test.ts`:
       - "readPeriod: no param → 30d"
       - "readPeriod: period=custom&from&to round-trips"
       - "writePeriod keeps tab and other params"
       - "toStatsQuery: custom with only from → null"
       - "from after to → null"
       - "to after today → null"
       - "367-day span → null"
       - "1d → { period: '1d' }"
     - `PeriodSelector.test.tsx`:
       - "three buttons with aria-pressed on the selected one"
       - "Custom shows two labelled date inputs"
     - `model-split/helpers.test.ts`:
       - "formatPercent(0.818) → '82%'; null → '—'"
       - "formatDuration(6200) → '6.2s', 5000 → '5s', null → '—'"
     - `ModelSplit.test.tsx`: "renders one line per model with Unknown model label for null"
   - interfaces: produces
     - `useAgentPerformance(query: StatsQuery | null)` → `useQuery({ queryKey: ["agent-performance", query], queryFn: () => api.get<AgentPerformance>(\`/agent-performance?${statsSearch(query)}\`), enabled: query !== null })`
     - `useAgentStats(agentId: string, query: StatsQuery | null)` → key `["agent-stats", agentId, query]`, path `/agents/${agentId}/stats?${statsSearch(query)}`
     - `statsSearch(q: StatsQuery): string` (`period=1d` | `period=30d` | `period=custom&from=…&to=…`)
     - `type PeriodSelection = { period: "1d" } | { period: "30d" } | { period: "custom"; from: string | null; to: string | null }`
     - `readPeriod(sp: URLSearchParams): PeriodSelection`
     - `writePeriod(sp: URLSearchParams, sel: PeriodSelection): URLSearchParams`
     - `toStatsQuery(sel: PeriodSelection, todayUtc: string): StatsQuery | null`
     - `PeriodSelector({ value, onChange, labels }: { value: PeriodSelection; onChange: (s: PeriodSelection) => void; labels: { oneDay: string; thirtyDays: string; custom: string; from: string; to: string; invalidRange: string } })`
     - `ModelSplit({ rows, labels }: { rows: AgentModelSplit[]; labels: { unknownModel: string; runs: (n: number) => string; decisions: (n: number) => string } })`
     - `formatPercent(r: number | null): string`
     - `formatDuration(ms: number | null): string`
     - Types come from `@devdigest/shared` (type-only imports).
   - verify: `pnpm --dir client exec vitest run src/components/period-selector src/components/model-split src/components/app-shell/AgentPerformanceNav.test.tsx` → all passed

6. [UI] client — Agent Performance page and view
   - files:
     - `client/src/app/agent-performance/page.tsx` (new, thin: renders `<AgentPerformanceView />`)
     - `client/src/app/agent-performance/_components/AgentPerformanceView/{AgentPerformanceView.tsx, index.ts, styles.ts, helpers.ts, helpers.test.ts}` (new)
     - subcomponents under `AgentPerformanceView/_components/`: `SummaryCards/`, `AgentTable/` (with `helpers.ts` + `helpers.test.ts` for sorting), `CostBreakdown/` (with `helpers.ts` for the rounding footnote), each with `index.ts`
     - `client/messages/en/agentPerformance.json` (rewritten)
   - layer: route + colocated view · lane: B
   - skills: frontend-ui-architecture, react-best-practices, react-testing-library, next-best-practices, security
   - turns green: `AgentPerformanceView.test.tsx` AC-25, AC-47, AC-26, AC-27, AC-46, AC-28, AC-29, AC-30, AC-31, AC-32, AC-33, AC-34, AC-35, AC-36, AC-37, AC-38, AC-39
   - test first:
     - `AgentTable/helpers.test.ts`:
       - "defaultOrder: ≥10 decisions, then 1–9, then 0; ties runs desc then name"
       - "sortRows: nulls last both directions"
       - "sortRows by accept rate keeps small-sample grouping"
     - `CostBreakdown/helpers.test.ts`: "roundedSumDiffers true when cents of parts ≠ cents of total"
     - `AgentPerformanceView/helpers.test.ts`: "runsLine lists done plus non-zero failed/running/cancelled"
     - in lane B's own `AgentPerformanceView.retry.test.tsx`: "Retry twice while pending issues one GET"
   - interfaces:
     - consumes `useAgentPerformance`, `PeriodSelector`, `readPeriod`, `writePeriod`, `toStatsQuery`, `ModelSplit`, `formatPercent`, `formatDuration`, and `formatCost(usd, 3)` from `@/components/run-cost-badge/format`
     - produces `AgentPerformanceView()` (no props)
     - The view reads the period from `useSearchParams()` and writes it with `router.replace("/agent-performance?" + writePeriod(...))`.
     - View on a row → `router.push(\`/agents/${id}?tab=stats&${statsSearch(query)}\`)`.
     - The deleted row (`deleted_agents`) is passed separately and rendered last with label "Deleted agent". It has no View.
     - Expand uses only the loaded `by_model` (no fetch).
     - Last run uses `useFormatter().relativeTime`.
     - While loading, render `Skeleton`s only (no previous data). On error, render `ErrorState` with `onRetry={() => refetch()}`.
     - When `totals.runs === 0`, render the page empty state plus the selector only.
   - verify: `pnpm --dir client exec vitest run src/app/agent-performance` → all passed, including the 17 red-first cases

7. [UI] client — Stats tab in the agent editor
   - files:
     - `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/{StatsTab.tsx, index.ts, styles.ts}` (new)
     - `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` (changed: `tab === "stats" ? <StatsTab agent={agent} />`)
     - `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` (changed: `{ key: "stats", labelKey: "editor.tabs.stats", icon: "BarChart" }`)
     - `client/src/app/agents/[id]/page.tsx` (changed: `VALID_TABS` gains `"stats"`)
     - `client/messages/en/agents.json` (changed: `editor.tabs.stats` and a `stats.*` block)
   - layer: route-colocated tab · lane: B
   - skills: frontend-ui-architecture, react-best-practices, react-testing-library, next-best-practices
   - turns green: `page.stats.test.tsx` AC-41, `page.test.tsx` "AC-41 ?tab=stats …", `StatsTab.test.tsx` AC-42, AC-48 ×3
   - test first: none beyond the red-first rows (StatsTab composes step 5/6 pieces that are already tested)
   - interfaces:
     - consumes `useAgentStats`, `PeriodSelector` and its helpers, `ModelSplit`, the formatters, and `formatCost`
     - produces `StatsTab({ agent }: { agent: Agent })`
     - It reads and writes `period`/`from`/`to` on the agent page URL, keeping `tab=stats` (`router.replace(\`/agents/${agent.id}?${writePeriod(...)}\`)`).
     - Labels come from `agents.stats.*` (including the same visible period strings).
   - verify: `pnpm --dir client exec vitest run src/app/agents/[id]` → all passed (existing Config/Context/Evals cases included)

8. [BE] server — deterministic demo data in the dev seed
   - files: `server/src/db/seed-agent-performance.ts` (new), `server/src/db/seed.ts` (changed: one call `await seedAgentPerformanceDemo(db, workspaceId, repoId)` after `seedEvalDemo`), `server/test/seed-agent-performance-demo.test.ts` (new, lane-owned, pure)
   - layer: db seed · lane: C
   - skills: drizzle-orm-patterns, postgresql-table-design, security
   - turns green: `seed-agent-performance.it.test.ts` AC-50, and AC-43 / AC-49 once lane A is in (final level). Keeps AC-51's existing flows green.
   - test first: `seed-agent-performance-demo.test.ts`:
     - "DEMO_RUNS covers ≥2 agents and ≥2 models inside 24h and inside 30d"
     - "has a failed run, an unpriced done run, an agentless run, a modelless run"
     - "Security has ≥10 decisions and General 1–9; Test Quality has no run"
     - "every offset is ≥1h from the 24h and 720h boundaries"
     - "demoRunTime(seedNow, spec) = seedNow − offsetHours"
   - interfaces: produces
     - `DEMO_PR_NUMBER = 476`, title "Retry webhook deliveries with exponential backoff"; must not contain "Add rate limiting"
     - `DEMO_RUNS: readonly DemoRunSpec[]` with fixed UUIDs for run, review and findings
     - `demoRunTime(seedNow: Date, spec: DemoRunSpec): Date`
     - `seedAgentPerformanceDemo(db: Db, workspaceId: string, repoId: string, now?: Date): Promise<void>`
     - Agents are resolved by name, as `seedEvalDemo` does.
     - Review `agentId` equals its run's agent; review `model` equals its run's model and is never `'seed'`.
     - The demo set (offset hours before seed time):

       | run | agent | status | model | cost | ms | offset | findings (acc/dis/pend) |
       |---|---|---|---|---|---|---|---|
       | S1 | Security Reviewer | done | `deepseek/deepseek-v4-flash` | 0.012 | 42000 | 2 | 9/2/1 |
       | S2 | Security Reviewer | done | `openai/gpt-4.1-mini` | 0.020 | 38000 | 30 | 2/0/1 |
       | S3 | Security Reviewer | failed | `deepseek/deepseek-v4-flash` | null | 0 | 120 | no review |
       | G1 | General Reviewer | done | `deepseek/deepseek-v4-flash` | 0.008 | 30000 | 6 | 2/1/0 |
       | G2 | General Reviewer | done | `deepseek/deepseek-v4-flash` | null | 25000 | 240 | 0/0/1 |
       | P1 | Performance Reviewer | done | null | 0.005 | 20000 | 12 | 1/0/1 |
       | A1 | API Contract Reviewer | done | `openai/gpt-4.1-mini` | 0.015 | 33000 | 3 | 0/1/1 |
       | D1 | (no agent) | done | `openai/gpt-4.1-mini` | 0.010 | 28000 | 192 | 1/0/0 |

       Test Quality Reviewer gets no run.

       Expected aggregation:
       - 30 days: 8 runs ("7 done · incl. 1 failed"), total $0.07, 1 unpriced, headline 15/19 = 79%, Security 3 runs, 13 decisions, 85%.
       - 1 day: 4 runs ("4 done"), total $0.04, headline 12/16 = 75%, Security first row with 11 decisions, 82%, most-active Security.
     - Also grep the 26 `server/test/*.it.test.ts` that call `seed()` for assertions on the demo repo's PR-list length or order and on workspace-wide run, review or finding counts. Report any hit as `blocked`; never edit those tests.
   - verify: `pnpm --dir server exec vitest run test/seed-agent-performance-demo.test.ts` → all passed; `pnpm --dir server typecheck` → exit 0

9. [UI] e2e — hermetic flow for the journey
   - files: `e2e/specs/13-agent-performance.flow.json` (new)
   - layer: e2e · lane: C
   - skills: none (review against `e2e/CLAUDE.md`)
   - turns green: AC-44 (run by the main session)
   - test first: none
   - interfaces: consumes step 6/7 strings and step 8 numbers. Steps, in order:
     1. `open {BASE}/`
     2. `wait --url /pulls`
     3. `wait --text "Agent Performance"`
     4. `find text "Agent Performance" click`
     5. `wait --url /agent-performance`
     6. `wait --text "Security Reviewer"`
     7. `wait --text "7 done"`
     8. `wait --text "$0.07"`
     9. `find text "1 day" click`
     10. `wait --url period=1d`
     11. `wait --text "4 done"`
     12. `wait --text "$0.04"`
     13. `wait --text "Security Reviewer"`
     14. `find text "Models" click`
     15. `wait --text "deepseek/deepseek-v4-flash"`
     16. `find text "View" click`
     17. `wait --url tab=stats`
     18. `wait --url period=1d`
     19. `wait --text "Split by model"`
     20. `wait --text "11 decisions"`
     21. `wait --text "82%"`
   - verify: `python3 -c` is not in the lane's command set, so check by reading: the JSON parses (same shape as `e2e/specs/10-eval-dashboard.flow.json`) and no step uses `role link --name`. The hermetic run is the main session's.

## Contracts & data
- **Shared contract:** step 1, server copy first, client copy byte-identical (`diff` of the one file is empty). No barrel change: `index.ts:26` already re-exports `observability.js` on both sides.
- **Migrations:** none. **Schema:** unchanged.
- **Seed:** step 8; idempotent through fixed UUIDs. Re-seed updates `agent_runs.ran_at` only.
- **i18n.** Exact strings that tests and e2e assert. Lane B writes them; RF and C assert them.
  - `client/messages/en/agentPerformance.json`:
    - `title` "Agent Performance"
    - `subtitle` "Which agents earn their keep — accept rate is the quality signal"
    - `period.oneDay` "1 day", `period.thirtyDays` "30 days", `period.custom` "Custom range"
    - `period.from` "From (UTC)", `period.to` "To (UTC)"
    - `period.invalidRange` "Pick a valid range: from on or before to, not after today, at most 366 days."
    - `cards.totalRuns` "Total runs ({period})", `cards.totalCost` "Total cost ({period})", `cards.avgAcceptRate` "Avg accept rate ({period})", `cards.mostActive` "Most-active agent ({period})"
    - `cards.done` "{count} done", `cards.includes` "incl. {count} {status}"
    - `status.failed` "failed", `status.running` "running", `status.cancelled` "cancelled"
    - `cards.unpriced` "{count, plural, one {# unpriced run} other {# unpriced runs}}"
    - `decisions` "{count, plural, one {# decision} other {# decisions}}"
    - `cards.pooled` "Pooled across agents: all accepted ÷ all decisions"
    - `cards.noCurrentAgent` "No current agent ran"
    - `smallSample` "small sample"
    - `estimate` "DevDigest estimate (token × price book)"
    - `reconciled` "Reconciled billing: not connected"
    - `note` "Runs counts every run in the period (running, done, failed, cancelled). Avg cost, Avg duration and the unpriced count cover completed runs only."
    - `table.agent` "Agent", `table.runs` "Runs", `table.avgCost` "Avg cost", `table.avgDuration` "Avg duration", `table.acceptRate` "Accept rate", `table.lastRun` "Last run", `table.view` "View"
    - `table.models` "Models", `table.noRuns` "No runs in this period", `table.deletedAgent` "Deleted agent"
    - `breakdown.title` "Cost breakdown", `breakdown.byAgent` "By agent", `breakdown.byModel` "By model (run model)"
    - `breakdown.unknownModel` "Unknown model", `breakdown.roundingNote` "Rounded figures may not add up to the total."
    - `empty.title` "No agent runs in this period"
    - `loadError` "Could not load agent performance."
    - Period names inside card titles: "1 day", "30 days", "{from} – {to}".
  - `client/messages/en/agents.json` gains:
    - `editor.tabs.stats` "Stats"
    - `stats.title` "Stats", `stats.splitByModel` "Split by model", `stats.pending` "Pending", `stats.lastRun` "Last run"
    - `stats.period.*` with the same five visible strings as `agentPerformance.period.*`
    - the `stats.*` copies of the metric labels used on the tab: runs, total cost, avg cost, avg duration, accept rate, decisions, small sample, estimate, unpriced, no runs, load error

## Checks for the implementer
- multi-agent, per lane (targeted runs plus typecheck judged on owned paths only):
  - lane 0: `pnpm --dir server typecheck` · `pnpm --dir client typecheck` (`tsc --noEmit --incremental false` inside srt) · `diff` of the two contract files
  - lane A: `pnpm --dir server exec vitest run test/agent-performance-window.test.ts test/agent-performance-helpers.test.ts` · `pnpm --dir server exec vitest run test/route-adapter-calls.test.ts` · `pnpm --dir server typecheck`
  - lane B: `pnpm --dir client exec vitest run src/components/period-selector src/components/model-split src/components/app-shell/AgentPerformanceNav.test.tsx src/app/agent-performance src/app/agents/[id]` · `pnpm --dir client typecheck`
  - lane C: `pnpm --dir server exec vitest run test/seed-agent-performance-demo.test.ts` · `pnpm --dir server typecheck`
  - No lane runs `*.it.test.ts` or e2e.
- main session, after each DAG level (levels 0, 2; level 1 adds test files only):
  - server: `pnpm --dir server typecheck` · `pnpm --dir server exec vitest run --exclude '**/*.it.test.ts'`
  - client: `pnpm --dir client typecheck` · `pnpm --dir client test`

## Checks for reviewers          (plan-verifier first, then the rest in parallel)
- plan-verifier:
  - AC-1…AC-23, AC-24…AC-39, AC-41…AC-43, AC-46…AC-50 against the plan.
  - The integration suite with Docker: `pnpm --dir server exec vitest run .it.test` (the two new files plus all 26 seeding suites, since the demo seed touches them). Runs after the main session has read the new `.it.test.ts` files.
  - Confirms the red-first files are unchanged since step 2.
- architecture-reviewer: `pnpm --dir server lint:boundaries`, the onion-architecture step 9 report (including `cross-module-imports.py`), `server/test/route-adapter-calls.test.ts`; client placement against frontend-ui-architecture (the two promoted folders, no `relativeTime` cross-route import).
- security-reviewer: the diff — workspace scoping in every query (AC-22), 404 on a foreign agent (AC-21), period validation before any query and the fixed error body (AC-4), no SQL from request data, names rendered as text only.
- main session:
  - `/code-review` of the bundle
  - `E2E_PG_PORT=5633 E2E_API_PORT=3301 E2E_WEB_PORT=3300 npm run e2e:hermetic` from `e2e/` (AC-44, AC-51). Expect `13/13 flows passed`; exit code alone proves nothing (`e2e/INSIGHTS.md:27`). Stop the dev preview first, or `rm -rf client/.next` after.
  - AC-40 network panel on the dev stack.
  - AC-45 three timed dashboard requests on a synthetic 10k/50k dev DB.
  - `pr-self-review` before `gh pr create`.

## Out of scope
- Writing or changing the spec (spec-creator), architecture review (architecture-reviewer), acceptance verification (plan-verifier), security review (security-reviewer) and e2e (main session).
- Previous-period delta, trend arrows, sparkline drawing, donuts and accept-rate ring (see Open questions), other GLOBAL items (Memory, Multi-Agent Review, CI Runs), billing reconciliation, eval suite runs, export, per-repo filtering, any write from these screens.
- Any index or migration (see Risks), and any change to how run cost is recorded.

## Risks
- **AC-45 performance:** seq scans without a `(workspace_id, ran_at)` index on `agent_runs` and a `run_id` index on `reviews`. If the timing fails, the fix is a schema change through `pnpm db:generate` and needs Glib's sign-off as an ADR before any edit.
- **Demo seed vs existing integration suites:** 26 suites call `seed()`, and the demo PR (#476) and 8 runs now land in the default workspace. Suites scoped per PR are safe, and a grep found no PR-list-length assertion. A hidden workspace-wide count would surface only in plan-verifier's Docker run.
- **Permissive querystring schema:** whether `fastify-type-provider-zod` accepts `z.record(z.string(), z.unknown())` as a querystring schema is unverified. The fallback is `z.object({}).passthrough()`; either way the 400 comes from `resolveWindow`. If neither works, the caller should run `researcher` on fastify-type-provider-zod querystring handling.
- **Raw `max(ran_at)` decoding:** postgres-js may hand back a `Date` or a string through a raw `sql` aggregate. `toIso` normalises both, and the helper test pins it.
- **e2e locators:** `find text "Models"` and `find text "View"` click the first DOM match. Step 9's preceding `wait --text "Security Reviewer"` and the default sort (Security first in both periods) make that the Security row. A copy change in lane B can silently retarget the click (`client/CLAUDE.md` Gotchas).
- **Red-first writer:** the test-writer agent's write-scope hook mis-resolves worktree paths, so a general-purpose agent writes step 2. Nothing but the brief stops it from writing outside test files. The main session should check `git status` after step 2 shows only the seven listed files.
