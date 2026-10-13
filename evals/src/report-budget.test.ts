import { describe, expect, it } from "vitest";
import { relativeNodeid } from "./report.js";
import { overBudget, spentUsd } from "../scripts/eval-budget.mjs";

describe("relativeNodeid", () => {
  it("makes a local and a CI node id equal", () => {
    const local = "/Users/x/dev-digest/.claude/worktrees/w/evals/skills/zod/zod.eval.ts > skill:zod > case";
    const ci = "/home/runner/work/dev-digest/dev-digest/evals/skills/zod/zod.eval.ts > skill:zod > case";
    expect(relativeNodeid(local)).toBe("skills/zod/zod.eval.ts > skill:zod > case");
    expect(relativeNodeid(ci)).toBe(relativeNodeid(local));
  });

  it("does not cut at an /evals/ inside the test name", () => {
    expect(relativeNodeid("/r/evals/workflow/w.eval.ts > workflow:review > reads /evals/README")).toBe(
      "workflow/w.eval.ts > workflow:review > reads /evals/README",
    );
  });

  it("leaves an already relative id alone", () => {
    expect(relativeNodeid("agents/a/a.eval.ts > agent:a > case")).toBe("agents/a/a.eval.ts > agent:a > case");
  });
});

describe("budget", () => {
  it("is over only when the run spent more than the budget", () => {
    expect(spentUsd(6.5, 6.9)).toBeCloseTo(0.4);
    expect(overBudget(6.5, 6.9, 1)).toBe(false);
    expect(overBudget(6.5, 8, 1)).toBe(true);
  });

  it("never reports a negative spend", () => {
    expect(spentUsd(7, 6)).toBe(0);
  });
});
