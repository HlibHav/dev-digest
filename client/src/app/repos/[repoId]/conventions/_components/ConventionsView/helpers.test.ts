import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import {
  acceptedCandidates,
  confidencePercent,
  githubBlobUrl,
  pendingCandidates,
  rejectedCount,
} from "./helpers";

function candidate(over: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: "c1",
    category: "naming",
    rule: "Server files are kebab-case.",
    evidence_path: "server/src/modules/skills/service.ts",
    evidence_line: 4,
    evidence_snippet: "export class SkillsService {",
    confidence: 0.82,
    status: "pending",
    ...over,
  };
}

describe("githubBlobUrl", () => {
  it("points at the verified line", () => {
    expect(githubBlobUrl("acme/payments-api", "main", "src/a.ts", 12)).toBe(
      "https://github.com/acme/payments-api/blob/main/src/a.ts#L12",
    );
  });

  it("omits the fragment when the line is unknown", () => {
    expect(githubBlobUrl("acme/payments-api", "main", "src/a.ts", null)).toBe(
      "https://github.com/acme/payments-api/blob/main/src/a.ts",
    );
  });
});

describe("confidencePercent", () => {
  it("rounds to a whole percent", () => {
    expect(confidencePercent(0.826)).toBe(83);
  });
  it("clamps values outside 0..1", () => {
    expect(confidencePercent(1.4)).toBe(100);
    expect(confidencePercent(-0.2)).toBe(0);
  });
});

describe("partitioning", () => {
  const all = [
    candidate({ id: "a", status: "pending" }),
    candidate({ id: "b", status: "accepted" }),
    candidate({ id: "c", status: "rejected" }),
  ];

  it("separates the three states", () => {
    expect(pendingCandidates(all).map((c) => c.id)).toEqual(["a"]);
    expect(acceptedCandidates(all).map((c) => c.id)).toEqual(["b"]);
    expect(rejectedCount(all)).toBe(1);
  });

  it("keeps rejected candidates out of both visible lists", () => {
    const visible = [...pendingCandidates(all), ...acceptedCandidates(all)];
    expect(visible.some((c) => c.status === "rejected")).toBe(false);
  });
});
