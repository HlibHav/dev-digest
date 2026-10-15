import type { SortKey } from "./helpers";

/** Sortable columns in display order; `labelKey` resolves under `agentPerformance`. */
export const SORT_COLUMNS: readonly { key: SortKey; labelKey: string }[] = [
  { key: "agent", labelKey: "table.agent" },
  { key: "runs", labelKey: "table.runs" },
  { key: "avgCost", labelKey: "table.avgCost" },
  { key: "avgDuration", labelKey: "table.avgDuration" },
  { key: "acceptRate", labelKey: "table.acceptRate" },
  { key: "lastRun", labelKey: "table.lastRun" },
];

export const COLUMN_COUNT = SORT_COLUMNS.length + 1;
