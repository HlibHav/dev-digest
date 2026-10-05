import { describe, it, expect } from "vitest";
import {
  PrBrief,
  PrBriefResult,
  PrBriefResponse,
  PrBriefGenerateResponse,
} from "@devdigest/shared/contracts/brief";

const BASE = {
  summary: "Adds a limiter.",
  intent: { intent: "Add limiter", in_scope: ["api"], out_of_scope: [] },
  blast: { changed_symbols: [], downstream: [], summary: "none" },
  risks: {
    risks: [
      { kind: "logic", title: "Race", explanation: "May race.", severity: "high" as const, file_refs: ["a.ts", "b.ts"] },
    ],
  },
  review_focus: [{ file: "a.ts", line: 3, reason: "core change" }],
  history: { history: [] },
  head_sha: "abc1234",
  generated_at: "2026-10-03T00:00:00.000Z",
  model: "openai/gpt-4.1-mini",
  tokens_in: 10,
  tokens_out: 5,
  cost_usd: 0.001,
  missing_inputs: [],
  truncated_inputs: [],
};
const risk = (over: Record<string, unknown> = {}) => ({
  kind: "logic",
  title: "t",
  explanation: "e",
  severity: "low" as const,
  file_refs: ["a.ts"],
  ...over,
});
const withRisks = (risks: unknown[]) => ({ ...BASE, risks: { risks } });

describe("PrBrief contract (client copy)", () => {
  it("parses a full brief and a brief with null intent, blast, history", () => {
    expect(PrBrief.safeParse(BASE).success).toBe(true);
    expect(PrBrief.safeParse({ ...BASE, intent: null, blast: null, history: null, cost_usd: null }).success).toBe(true);
  });

  it("parses a risk with and without line_refs", () => {
    expect(PrBrief.safeParse(withRisks([risk()])).success).toBe(true);
    const lr = [{ file: "a.ts", start_line: 2, end_line: 4 }];
    expect(PrBrief.safeParse(withRisks([risk({ line_refs: lr })])).success).toBe(true);
  });

  it("rejects 6 risks, inverted lines, a foreign line ref and over-long strings", () => {
    expect(PrBrief.safeParse(withRisks(Array.from({ length: 6 }, () => risk()))).success).toBe(false);
    expect(PrBrief.safeParse(withRisks([risk({ line_refs: [{ file: "a.ts", start_line: 5, end_line: 4 }] })])).success).toBe(false);
    expect(PrBrief.safeParse(withRisks([risk({ line_refs: [{ file: "z.ts", start_line: 1, end_line: 2 }] })])).success).toBe(false);
    expect(PrBrief.safeParse({ ...BASE, summary: "x".repeat(1201) }).success).toBe(false);
    expect(PrBrief.safeParse(withRisks([risk({ file_refs: [] })])).success).toBe(false);
  });

  it("PrBriefResult and the responses wrap the stored shape", () => {
    expect(PrBriefResult.safeParse({ ...BASE, stale: false }).success).toBe(true);
    expect(PrBriefResponse.safeParse({ brief: null }).success).toBe(true);
    expect(PrBriefGenerateResponse.safeParse({ brief: null }).success).toBe(false);
  });
});
