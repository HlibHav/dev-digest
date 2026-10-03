import { describe, it, expect } from "vitest";
import type { Risk, ReviewFocusItem } from "@devdigest/shared/contracts/brief";
import {
  formatLineRef,
  formatCost,
  shortSha,
  resolveFocusTarget,
  resolveRiskTarget,
} from "./helpers";
import { SEVERITY_COLOR } from "./constants";

function risk(overrides: Partial<Risk> = {}): Risk {
  return {
    kind: "correctness",
    title: "A risk",
    explanation: "Because.",
    severity: "medium",
    file_refs: ["src/real.ts"],
    ...overrides,
  };
}

describe("formatLineRef (AC-40a)", () => {
  it("shows a range as path:start-end", () => {
    expect(
      formatLineRef("src/middleware/ratelimit.ts", [
        { file: "src/middleware/ratelimit.ts", start_line: 12, end_line: 18 },
      ]),
    ).toBe("src/middleware/ratelimit.ts:12-18");
  });

  it("shows path:start when start and end are equal", () => {
    expect(
      formatLineRef("package.json", [{ file: "package.json", start_line: 34, end_line: 34 }]),
    ).toBe("package.json:34");
  });

  it("shows the path alone when the risk has no line refs", () => {
    expect(formatLineRef("src/a.ts", undefined)).toBe("src/a.ts");
    expect(formatLineRef("src/a.ts", [])).toBe("src/a.ts");
  });

  it("shows the path alone when the only line ref belongs to another file", () => {
    expect(
      formatLineRef("src/a.ts", [{ file: "src/b.ts", start_line: 3, end_line: 9 }]),
    ).toBe("src/a.ts");
  });

  it("uses the line ref of the asked file when several files have one", () => {
    const refs = [
      { file: "src/a.ts", start_line: 1, end_line: 2 },
      { file: "src/b.ts", start_line: 30, end_line: 40 },
    ];
    expect(formatLineRef("src/b.ts", refs)).toBe("src/b.ts:30-40");
  });
});

describe("formatCost (AC-50)", () => {
  it("formats a cost in USD", () => {
    expect(formatCost(0.014)).toBe("$0.014");
  });

  it("returns null for a missing cost, so the caller shows the costNone message", () => {
    expect(formatCost(null)).toBeNull();
  });
});

describe("shortSha", () => {
  it("keeps the first 7 characters", () => {
    expect(shortSha("abc1234def")).toBe("abc1234");
  });
});

describe("SEVERITY_COLOR (AC-40)", () => {
  it("has a distinct colour per severity", () => {
    const colours = [SEVERITY_COLOR.high, SEVERITY_COLOR.medium, SEVERITY_COLOR.low];
    expect(colours.every((c) => typeof c === "string" && c.length > 0)).toBe(true);
    expect(new Set(colours).size).toBe(3);
  });
});

describe("resolveFocusTarget (AC-52)", () => {
  const prPaths: ReadonlySet<string> = new Set(["src/a.ts", "src/b.ts"]);
  const item = (file: string, line: number): ReviewFocusItem => ({ file, line, reason: "Look here." });

  it("finds a PR file and keeps its line", () => {
    expect(resolveFocusTarget(item("src/a.ts", 12), prPaths)).toEqual({ file: "src/a.ts", line: 12 });
  });

  it("returns null for a blast-only file, which is not in the diff", () => {
    expect(resolveFocusTarget(item("src/caller-only.ts", 4), prPaths)).toBeNull();
  });

  it("returns null when the PR has no files", () => {
    expect(resolveFocusTarget(item("src/a.ts", 12), new Set())).toBeNull();
  });
});

describe("resolveRiskTarget (AC-53)", () => {
  const prPaths: ReadonlySet<string> = new Set(["src/real.ts", "src/other.ts"]);

  it("picks the first in-diff file of [ghost, real] and that file's line ref start", () => {
    const r = risk({
      file_refs: ["src/ghost.ts", "src/real.ts"],
      line_refs: [{ file: "src/real.ts", start_line: 12, end_line: 18 }],
    });
    expect(resolveRiskTarget(r, prPaths)).toEqual({ file: "src/real.ts", line: 12 });
  });

  it("returns line null when the risk has no line ref", () => {
    const r = risk({ file_refs: ["src/ghost.ts", "src/real.ts"] });
    expect(resolveRiskTarget(r, prPaths)).toEqual({ file: "src/real.ts", line: null });
  });

  it("returns line null when the only line ref is for a different file than the chosen one", () => {
    const r = risk({
      file_refs: ["src/real.ts", "src/other.ts"],
      line_refs: [{ file: "src/other.ts", start_line: 40, end_line: 41 }],
    });
    expect(resolveRiskTarget(r, prPaths)).toEqual({ file: "src/real.ts", line: null });
  });

  it("keeps the order of file_refs when several files are in the diff", () => {
    const r = risk({ file_refs: ["src/other.ts", "src/real.ts"] });
    expect(resolveRiskTarget(r, prPaths)).toEqual({ file: "src/other.ts", line: null });
  });

  it("returns null when none of the risk's files is in the diff", () => {
    const r = risk({
      file_refs: ["src/ghost.ts", "src/phantom.ts"],
      line_refs: [{ file: "src/ghost.ts", start_line: 5, end_line: 6 }],
    });
    expect(resolveRiskTarget(r, prPaths)).toBeNull();
  });
});
