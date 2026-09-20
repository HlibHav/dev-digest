# Spec: run cost (server)

Lab: "Run Cost Badge". Show what each agent review run cost, in tokens and USD,
without any extra model calls. The client half lives in
`client/specs/run-cost-badge.md`; the engine contract it relies on is
`reviewer-core/specs/run-cost.md`.

## Scope

In: persisting the per-run cost, exposing it on the run history, the run trace
and the PR list.
Out: cost of failed or cancelled runs, budgets and alerts, per-agent cost
analytics.

## Data model

- `agent_runs.cost_usd double precision NULL`, no default. Null means "no price
  data" and must never be written as `0`. A real `0` is a free model.
- `agent_runs.batch_id uuid NULL`, generated once per `POST /pulls/:id/review`
  and shared by every run that request creates. No FK.
- Index `agent_runs_pr_status_ran_idx (pr_id, status, ran_at DESC)`.
- Rows written before migration 0010 keep both columns null.

## API

| Endpoint | Field | Value |
|---|---|---|
| `GET /pulls/:id/runs` | `RunSummary.cost_usd` | the run's `agent_runs.cost_usd` |
| `GET /runs/:id/trace` | `stats.cost_usd` | same value, copied into the trace document when the run completes; absent on older traces |
| `GET /repos/:id/pulls` | `PrMeta.cost_usd` | sum of `cost_usd` over the PR's `done` runs |

`RunStats.cost_usd` is `.nullish()` because the trace jsonb is returned without
a zod parse. `RunSummary.cost_usd` is `.nullable()`.

## Semantics

- Run cost is `outcome.costUsd` from `reviewPullRequest`, taken as is.
- Only a run that reaches `done` stores a cost. Failure and cancel paths store null.
- PR-list cost = `SUM(cost_usd)` over runs with `status = 'done'`. Null costs are
  skipped. The result is null when the PR has no done runs or none of them is
  priced. Failed runs never add to it, even if a row carries a cost.

## Acceptance criteria

1. A completed run persists a non-null cost equal to the engine's `costUsd`, and
   the same number appears in the trace stats and the run history.
2. The PR list shows the sum across every completed run, including runs from
   earlier review requests.
3. A PR with no runs, or with only unpriced runs, lists `cost_usd: null`, never `0`.
4. No new LLM call is made to compute or display cost.

Covered by `server/test/reviews.it.test.ts` (the `run cost:` cases) and
`server/test/contracts.test.ts` ("run cost contracts").
