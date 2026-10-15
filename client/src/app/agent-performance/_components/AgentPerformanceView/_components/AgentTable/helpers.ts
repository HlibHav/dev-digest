/** Pure ordering for the agent table. Rows are sorted client-side; nothing is refetched. */
import type { AgentStats } from "@devdigest/shared";

export type SortKey = "agent" | "runs" | "avgCost" | "avgDuration" | "acceptRate" | "lastRun";
export type SortDir = "asc" | "desc";
export interface SortState {
  key: SortKey;
  dir: SortDir;
}

export type SortableRow = Pick<
  AgentStats,
  "agent_name" | "runs" | "decisions" | "small_sample" | "accept_rate" | "avg_cost_usd" | "avg_latency_ms" | "last_run_at"
>;

/** 0: a full sample (≥ threshold decisions), 1: a small sample (1…threshold−1), 2: no decisions. */
function sampleGroup(r: SortableRow): number {
  if (r.decisions === 0) return 2;
  return r.small_sample ? 1 : 0;
}

/** Empty values go last in either direction. */
function compareNullable(a: number | null, b: number | null, dir: SortDir): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === "asc" ? a - b : b - a;
}

/** Ties: most runs first, then name A→Z. */
function tieBreak(a: SortableRow, b: SortableRow): number {
  return b.runs - a.runs || a.agent_name.localeCompare(b.agent_name);
}

function valueOf(r: SortableRow, key: Exclude<SortKey, "agent" | "acceptRate">): number | null {
  if (key === "runs") return r.runs;
  if (key === "avgCost") return r.avg_cost_usd;
  if (key === "avgDuration") return r.avg_latency_ms;
  return r.last_run_at ? Date.parse(r.last_run_at) : null;
}

/** No column chosen: accept rate high→low inside the sample groups. */
export function defaultOrder<T extends SortableRow>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) => sampleGroup(a) - sampleGroup(b) || compareNullable(a.accept_rate, b.accept_rate, "desc") || tieBreak(a, b),
  );
}

/** Rows ordered by one column. Accept rate keeps the sample groups in both directions. */
export function sortRows<T extends SortableRow>(rows: readonly T[], sort: SortState): T[] {
  const { key, dir } = sort;
  return [...rows].sort((a, b) => {
    if (key === "agent") {
      const byName = a.agent_name.localeCompare(b.agent_name);
      return dir === "asc" ? byName : -byName;
    }
    if (key === "acceptRate") {
      return sampleGroup(a) - sampleGroup(b) || compareNullable(a.accept_rate, b.accept_rate, dir) || tieBreak(a, b);
    }
    return compareNullable(valueOf(a, key), valueOf(b, key), dir) || tieBreak(a, b);
  });
}

/** Clicking a header: the same column flips direction, a new one starts ascending. */
export function nextSort(current: SortState | null, key: SortKey): SortState {
  if (current?.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: "asc" };
}
