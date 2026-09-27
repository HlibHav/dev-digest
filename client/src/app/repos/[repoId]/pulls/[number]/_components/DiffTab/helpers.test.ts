import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { latestReviewFindings } from "./helpers";

function finding(id: string): FindingRecord {
  return {
    id,
    severity: "CRITICAL",
    category: "bug",
    title: id,
    file: "a.ts",
    start_line: 1,
    end_line: 1,
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

function review(id: string, agentId: string | null, findings: FindingRecord[]): ReviewRecord {
  return {
    id,
    pr_id: "pr1",
    agent_id: agentId,
    run_id: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-01-01T00:00:00.000Z",
    findings,
  };
}

describe("latestReviewFindings", () => {
  it("keeps only the newest review per agent_id (reviews are newest-first)", () => {
    const reviews = [
      review("r2", "a1", [finding("newer")]),
      review("r1", "a1", [finding("older")]),
    ];
    expect(latestReviewFindings(reviews).map((f) => f.id)).toEqual(["newer"]);
  });

  it("treats a null agent_id as its own key", () => {
    const reviews = [
      review("r3", null, [finding("f-null")]),
      review("r2", "a1", [finding("f-a1")]),
      review("r1", null, [finding("f-null-old")]),
    ];
    expect(latestReviewFindings(reviews).map((f) => f.id)).toEqual(["f-null", "f-a1"]);
  });

  it("flattens findings in review order", () => {
    const reviews = [review("r1", "a1", [finding("f1"), finding("f2")])];
    expect(latestReviewFindings(reviews).map((f) => f.id)).toEqual(["f1", "f2"]);
  });
});
