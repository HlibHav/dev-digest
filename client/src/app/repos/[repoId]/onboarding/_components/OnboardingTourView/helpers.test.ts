import { describe, it, expect } from "vitest";
import {
  formatCost,
  formatAge,
  isStale,
  githubBlobUrl,
  countDiagramNodes,
  diagramAllowed,
} from "./helpers";

describe("onboarding helpers", () => {
  it("githubBlobUrl encodes each segment", () => {
    expect(githubBlobUrl("honojs/hono", "abc123", "src/a b#c.ts")).toBe(
      "https://github.com/honojs/hono/blob/abc123/src/a%20b%23c.ts",
    );
  });

  it("isStale false when either sha is empty", () => {
    expect(isStale({ commit_sha: "" }, "bbb")).toBe(false);
    expect(isStale({ commit_sha: "aaa" }, null)).toBe(false);
    expect(isStale({ commit_sha: "aaa" }, "")).toBe(false);
    expect(isStale({ commit_sha: "aaa" }, "bbb")).toBe(true);
    expect(isStale({ commit_sha: "aaa" }, "aaa")).toBe(false);
    expect(isStale(null, "aaa")).toBe(false);
  });

  it('countDiagramNodes counts A["x"]-->B once each', () => {
    expect(countDiagramNodes('flowchart TD\n  A["x"]-->B["y"]-->A["x"]')).toBe(2);
    expect(countDiagramNodes("graph LR\n  A-->B\n  B-->C")).toBe(3);
  });

  it("diagramAllowed: header and 12-node cap", () => {
    expect(diagramAllowed('flowchart TD\n  A["a"]-->B["b"]')).toBe(true);
    expect(diagramAllowed("sequenceDiagram\n  A->>B: hi")).toBe(false);
    const thirteen = `flowchart TD\n  ${Array.from({ length: 13 }, (_, i) => `N${i}["n"]`).join("-->")}`;
    expect(diagramAllowed(thirteen)).toBe(false);
  });

  it("formatAge 2h ago", () => {
    const now = new Date("2026-10-03T12:00:00.000Z");
    expect(formatAge("2026-10-03T10:00:00.000Z", now)).toBe("2h ago");
    expect(formatAge("2026-10-03T11:55:00.000Z", now)).toBe("5m ago");
    expect(formatAge("2026-10-03T11:59:40.000Z", now)).toBe("just now");
    expect(formatAge("2026-09-30T12:00:00.000Z", now)).toBe("3d ago");
  });

  it("formatCost", () => {
    expect(formatCost(0.0021)).toBe("$0.0021");
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });
});
