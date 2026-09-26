import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@/lib/types";
import { findingKey, partitionFindings, filesWithFindings, severityLabel, highestSeverity } from "./findings";

function f(id: string, startLine: number, severity: FindingRecord["severity"] = "CRITICAL", file = "a.ts"): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: id,
    file,
    start_line: startLine,
    end_line: startLine,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

describe("findingKey", () => {
  it("keys on the new side by start_line", () => {
    expect(findingKey(f("f1", 42))).toBe("RIGHT:42");
  });
});

describe("partitionFindings", () => {
  it("splits matched vs. unanchored (a start_line with no rendered line)", () => {
    const anchored = f("f1", 10);
    const orphan = f("f2", 999);
    const { matched, unanchored } = partitionFindings([anchored, orphan], new Set(["RIGHT:10"]));
    expect(matched.get("RIGHT:10")).toEqual([anchored]);
    expect(unanchored).toEqual([orphan]);
  });

  it("groups multiple findings on the same line under one key", () => {
    const a = f("f1", 10);
    const b = f("f2", 10, "WARNING");
    const { matched } = partitionFindings([a, b], new Set(["RIGHT:10"]));
    expect(matched.get("RIGHT:10")).toEqual([a, b]);
  });
});

describe("filesWithFindings", () => {
  it("counts distinct paths that have at least one finding", () => {
    const findings = [f("f1", 1, "CRITICAL", "a.ts"), f("f2", 2, "CRITICAL", "a.ts"), f("f3", 3, "CRITICAL", "b.ts")];
    expect(filesWithFindings(["a.ts", "b.ts", "c.ts"], findings)).toBe(2);
  });

  it("is 0 when nothing has findings", () => {
    expect(filesWithFindings(["a.ts"], [])).toBe(0);
  });
});

describe("severityLabel", () => {
  it.each([
    ["CRITICAL", "blocker"],
    ["WARNING", "warning"],
    ["SUGGESTION", "suggestion"],
  ] as const)("%s → %s", (sev, label) => {
    expect(severityLabel(sev)).toBe(label);
  });
});

describe("highestSeverity", () => {
  it("picks CRITICAL over WARNING and SUGGESTION", () => {
    const w = f("w", 1, "WARNING");
    const c = f("c", 1, "CRITICAL");
    const s = f("s", 1, "SUGGESTION");
    expect(highestSeverity([s, w, c])).toBe(c);
  });

  it("returns undefined for an empty list", () => {
    expect(highestSeverity([])).toBeUndefined();
  });
});
