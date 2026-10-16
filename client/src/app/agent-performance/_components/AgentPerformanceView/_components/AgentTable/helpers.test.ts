import { describe, it, expect } from "vitest";
import { defaultOrder, nextSort, sortRows, type SortableRow } from "./helpers";

function row(name: string, over: Partial<SortableRow> = {}): SortableRow {
  return {
    agent_name: name,
    runs: 0,
    decisions: 0,
    small_sample: true,
    accept_rate: null,
    avg_cost_usd: null,
    avg_latency_ms: null,
    last_run_at: null,
    ...over,
  };
}

const names = (rows: SortableRow[]) => rows.map((r) => r.agent_name);

describe("AgentTable helpers", () => {
  it("defaultOrder: ≥10 decisions, then 1–9, then 0; ties runs desc then name", () => {
    const rows = [
      row("None B", { runs: 1 }),
      row("Small High", { runs: 2, decisions: 3, accept_rate: 1 }),
      row("Big Low", { runs: 1, decisions: 20, accept_rate: 0.3, small_sample: false }),
      row("None A", { runs: 1 }),
      row("Big High", { runs: 1, decisions: 12, accept_rate: 0.9, small_sample: false }),
      row("None Busy", { runs: 5 }),
      row("Big Tie Busy", { runs: 4, decisions: 12, accept_rate: 0.3, small_sample: false }),
    ];
    expect(names(defaultOrder(rows))).toEqual([
      "Big High",
      "Big Tie Busy",
      "Big Low",
      "Small High",
      "None Busy",
      "None A",
      "None B",
    ]);
  });

  it("sortRows: nulls last both directions", () => {
    const rows = [row("A", { avg_cost_usd: 0.2 }), row("B"), row("C", { avg_cost_usd: 0.1 })];
    expect(names(sortRows(rows, { key: "avgCost", dir: "asc" }))).toEqual(["C", "A", "B"]);
    expect(names(sortRows(rows, { key: "avgCost", dir: "desc" }))).toEqual(["A", "C", "B"]);
    const runs = [row("x", { last_run_at: "2026-10-01T00:00:00.000Z" }), row("y"), row("z", { last_run_at: "2026-10-02T00:00:00.000Z" })];
    expect(names(sortRows(runs, { key: "lastRun", dir: "asc" }))).toEqual(["x", "z", "y"]);
    expect(names(sortRows(runs, { key: "lastRun", dir: "desc" }))).toEqual(["z", "x", "y"]);
  });

  it("sortRows by accept rate keeps small-sample grouping", () => {
    const rows = [
      row("small perfect", { decisions: 2, accept_rate: 1 }),
      row("big low", { decisions: 10, accept_rate: 0.1, small_sample: false }),
      row("none"),
      row("big high", { decisions: 30, accept_rate: 0.8, small_sample: false }),
    ];
    expect(names(sortRows(rows, { key: "acceptRate", dir: "asc" }))).toEqual(["big low", "big high", "small perfect", "none"]);
    expect(names(sortRows(rows, { key: "acceptRate", dir: "desc" }))).toEqual(["big high", "big low", "small perfect", "none"]);
  });

  it("nextSort flips the same column and starts a new one ascending", () => {
    expect(nextSort(null, "runs")).toEqual({ key: "runs", dir: "asc" });
    expect(nextSort({ key: "runs", dir: "asc" }, "runs")).toEqual({ key: "runs", dir: "desc" });
    expect(nextSort({ key: "runs", dir: "desc" }, "agent")).toEqual({ key: "agent", dir: "asc" });
  });
});
