import { describe, it, expect } from "vitest";
import type { EvalSuiteRunSummary } from "@devdigest/shared";
import { formatPct, formatCost, runLabel, deltaView, compareEnabled } from "./helpers";

const run = (status: EvalSuiteRunSummary["status"]) => ({ status }) as EvalSuiteRunSummary;

describe("eval helpers", () => {
  it("formats null metrics as an em dash and rounds the rest", () => {
    expect(formatPct(null)).toBe("—");
    expect(formatPct(0.823)).toBe("82%");
    expect(formatPct(0)).toBe("0%");
    expect(formatCost(null, false)).toBe("—");
    expect(formatCost(0.03, false)).toBe("$0.03");
    const partial = formatCost(0.03, true);
    expect(partial).toContain("0.03");
    expect(partial).not.toBe(formatCost(0.03, false));
  });

  it("labels a run by number and agent version", () => {
    expect(runLabel(3, 2)).toBe("run #3 · agent v2");
  });

  it("deltaView signs with + and U+2212 and picks a direction", () => {
    expect(deltaView(-0.02, "pts")).toEqual({ text: "−2 pts", direction: "down" });
    expect(deltaView(0.05, "pts")).toEqual({ text: "+5 pts", direction: "up" });
    expect(deltaView(0, "pts").direction).toBe("flat");
    expect(deltaView(0.001, "pts").direction).toBe("flat");
    expect(deltaView(null, "pts")).toEqual({ text: "—", direction: "none" });
    expect(deltaView(0.02, "usd")).toEqual({ text: "+$0.02", direction: "up" });
    expect(deltaView(-0.02, "usd")).toEqual({ text: "−$0.02", direction: "down" });
  });

  it("AC-49 compareEnabled only for exactly two done or partial runs", () => {
    expect(compareEnabled([])).toBe(false);
    expect(compareEnabled([run("done")])).toBe(false);
    expect(compareEnabled([run("done"), run("partial")])).toBe(true);
    expect(compareEnabled([run("done"), run("running")])).toBe(false);
    expect(compareEnabled([run("done"), run("failed")])).toBe(false);
    expect(compareEnabled([run("done"), run("done"), run("done")])).toBe(false);
  });
});
