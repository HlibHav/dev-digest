/**
 * FindingsPanel helpers — severity counts and the severity filter are plain
 * array work over the findings (no LLM involved).
 */
import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { countsBySeverity, visibleFindings } from "./helpers";

function f(id: string, severity: FindingRecord["severity"], confidence = 0.9): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: id,
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

const FINDINGS = [f("s1", "SUGGESTION"), f("c1", "CRITICAL"), f("w1", "WARNING", 0.3), f("c2", "CRITICAL")];

describe("countsBySeverity", () => {
  it("counts every severity, zero included", () => {
    expect(countsBySeverity([f("c1", "CRITICAL")])).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
  });

  it("counts the given list", () => {
    expect(countsBySeverity(FINDINGS)).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
  });
});

describe("visibleFindings", () => {
  it("sorts by severity with no filter", () => {
    expect(visibleFindings(FINDINGS, false).map((x) => x.id)).toEqual(["c1", "c2", "w1", "s1"]);
  });

  it("keeps only the selected severity", () => {
    expect(visibleFindings(FINDINGS, false, "CRITICAL").map((x) => x.id)).toEqual(["c1", "c2"]);
  });

  it("combines the severity filter with hide-low-confidence", () => {
    expect(visibleFindings(FINDINGS, true, "WARNING")).toEqual([]);
  });
});
