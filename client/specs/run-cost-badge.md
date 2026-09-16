# Spec: Run Cost Badge (client)

Lab: "Run Cost Badge". Show run cost on the PR list, the PR detail page and the
Run Trace drawer, matching the designs. Server semantics are in
`server/specs/run-cost.md`.

## Surfaces

| Surface | Where | Content | Format |
|---|---|---|---|
| PR list | new **Cost** column between Status and Updated | sum over the PR's completed runs (`PrMeta.cost_usd`) | compact, e.g. `$0.011` |
| PR detail, Agent runs timeline | run row, second line under the time, `done` runs only | tokens in + out and run cost | detailed, e.g. `9,119 tok · $0.0013` |
| PR detail, Review runs accordion | header, between the score and the date | run cost (`RunSummary.cost_usd` matched by `run_id`) | compact, e.g. `$0.001` |
| Run Trace drawer | Stats block, **COST** tile between Tokens and Findings | `stats.cost_usd` | 4 decimals, e.g. `$0.06` |

Out of scope: the verdict banner and the design's Findings column on the list.

## Formatting: `formatCost(usd, decimals: 3 | 4)`

- `null`, `undefined`, `NaN` → `—`. Never `$0.00` and never `$NaN`.
- `0` → `$0.00`. A free model is real data.
- `0 < usd < 10^-decimals` → `<$0.001` or `<$0.0001`.
- `usd ≥ 1` → two decimals, e.g. `$1.23`.
- Otherwise `toFixed(decimals)`, trailing zeros trimmed, at least two decimals:
  `0.0600` → `$0.06`, `0.0013` → `$0.0013`.
- Compact uses 3 decimals, detailed and the trace tile use 4.
- Tokens: `{count, number} tok` (`common.runCost.tokens`). If both token counts
  are null, the tokens part is omitted.

## Look

Plain muted mono text, no chip: `var(--text-secondary)`, 12px compact and 11px
detailed. The trace tile reuses the drawer's existing `Stat` atom.

## i18n keys

`common.runCost.tokens`, `prReview.list.columns.cost`, `runs.trace.stat.cost`.

## Acceptance criteria

1. The PR list Cost column shows the summed cost, or `—` when the PR has no
   priced completed runs.
2. Every `done` run in the timeline shows its own tokens and cost. Failed,
   cancelled and running rows show no cost line.
3. The accordion header shows the cost of the run it belongs to.
4. The trace drawer shows a COST tile, and `—` for traces recorded before the
   feature.
5. Missing data renders `—` on every surface.
