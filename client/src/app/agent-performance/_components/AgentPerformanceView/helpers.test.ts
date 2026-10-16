import { describe, it, expect } from "vitest";
import { periodLabel, runsLine } from "./helpers";

describe("AgentPerformanceView helpers", () => {
  it("runsLine lists done plus non-zero failed/running/cancelled", () => {
    expect(runsLine({ running: 1, done: 11, failed: 2, cancelled: 0 })).toEqual([
      { kind: "done", count: 11 },
      { kind: "includes", status: "failed", count: 2 },
      { kind: "includes", status: "running", count: 1 },
    ]);
    expect(runsLine({ running: 0, done: 0, failed: 0, cancelled: 3 })).toEqual([
      { kind: "done", count: 0 },
      { kind: "includes", status: "cancelled", count: 3 },
    ]);
  });

  it("periodLabel names presets and a complete custom range", () => {
    expect(periodLabel({ period: "1d" })).toEqual({ key: "period.oneDay" });
    expect(periodLabel({ period: "30d" })).toEqual({ key: "period.thirtyDays" });
    expect(periodLabel({ period: "custom", from: "2026-10-01", to: "2026-10-07" })).toEqual({
      key: "period.range",
      values: { from: "2026-10-01", to: "2026-10-07" },
    });
    expect(periodLabel({ period: "custom", from: "2026-10-01", to: null })).toEqual({ key: "period.custom" });
  });
});
