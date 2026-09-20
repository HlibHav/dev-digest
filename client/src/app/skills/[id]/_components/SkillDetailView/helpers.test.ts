import { describe, it, expect } from "vitest";
import { countChanges, diffLines } from "./helpers";

describe("diffLines", () => {
  it("marks identical bodies as unchanged", () => {
    const out = diffLines("a\nb", "a\nb");
    expect(out.every((l) => l.kind === "same")).toBe(true);
  });

  it("reports an added line without moving the ones around it", () => {
    const out = diffLines("a\nc", "a\nb\nc");
    expect(out.map((l) => `${l.kind}:${l.text}`)).toEqual(["same:a", "added:b", "same:c"]);
  });

  it("reports a removed line", () => {
    const out = diffLines("a\nb\nc", "a\nc");
    expect(out.map((l) => `${l.kind}:${l.text}`)).toEqual(["same:a", "removed:b", "same:c"]);
  });

  it("reports a replacement as a removal and an addition", () => {
    expect(countChanges(diffLines("a\nold\nc", "a\nnew\nc"))).toEqual({ added: 1, removed: 1 });
  });

  it("handles an empty side", () => {
    expect(countChanges(diffLines("", "a\nb"))).toEqual({ added: 2, removed: 1 });
  });
});
