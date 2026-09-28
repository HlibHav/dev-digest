import type { BlastDegradedReason } from "@devdigest/shared";
import type { GraphNode } from "./helpers";

/** Maps the server's `reason` enum to the blast.json label key for it —
    never the text itself (frontend-ui-architecture rule 5). */
export const REASON_LABEL_KEY: Record<BlastDegradedReason, string> = {
  no_data: "reason.noData",
  index_partial: "reason.indexPartial",
  index_failed: "reason.indexFailed",
  repo_too_large: "reason.repoTooLarge",
  flag_off: "reason.flagOff",
};

/** CSS-var colour tokens per graph node kind (BlastGraph): symbol and
    endpoint boxes read accent/blue, caller boxes read neutral, cron boxes
    read warn/amber — matches the design screenshot's column colours. */
export const GRAPH_NODE_STYLE: Record<GraphNode["kind"], { fill: string; stroke: string }> = {
  symbol: { fill: "var(--accent-bg)", stroke: "var(--accent)" },
  caller: { fill: "var(--bg-hover)", stroke: "var(--border-strong)" },
  endpoint: { fill: "var(--accent-bg)", stroke: "var(--accent)" },
  cron: { fill: "var(--warn-bg)", stroke: "var(--warn)" },
};

/** blast.json legend key per graph node kind — used to build the legend row. */
export const GRAPH_LEGEND_KEY: Record<GraphNode["kind"], string> = {
  symbol: "graph.legend.symbol",
  caller: "graph.legend.callers",
  endpoint: "graph.legend.endpoints",
  cron: "graph.legend.crons",
};
