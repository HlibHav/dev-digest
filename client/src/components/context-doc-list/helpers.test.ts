import { describe, it, expect } from "vitest";
import type { AgentContext, SpecFile } from "@devdigest/shared";
import {
  buildAgentRows,
  contextTotals,
  filterDocs,
  isPerFileStrategy,
  moveDoc,
  toggleDoc,
} from "./helpers";

const file = (path: string, tokens = 10, category: SpecFile["category"] = "docs"): SpecFile => ({
  path,
  category,
  tokens,
  used_by: { agents: 0, skills: 0 },
});

describe("filterDocs", () => {
  const rows = [{ path: "specs/Public-API.md" }, { path: "docs/deploy.md" }];
  it("matches the path case-insensitively", () => {
    expect(filterDocs(rows, "api")).toEqual([rows[0]]);
  });
  it("an empty or blank query keeps every row", () => {
    expect(filterDocs(rows, "  ")).toEqual(rows);
  });
});

describe("moveDoc / toggleDoc", () => {
  it("moves a path and returns a new array", () => {
    expect(moveDoc(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });
  it("ignores out-of-range moves", () => {
    const p = ["a", "b"];
    expect(moveDoc(p, 0, 5)).toBe(p);
  });
  it("toggle attaches at the end and detaches", () => {
    expect(toggleDoc(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleDoc(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("isPerFileStrategy", () => {
  it("is true for map-reduce and auto only", () => {
    expect(isPerFileStrategy("map-reduce")).toBe(true);
    expect(isPerFileStrategy("auto")).toBe(true);
    expect(isPerFileStrategy("single-pass")).toBe(false);
    expect(isPerFileStrategy(null)).toBe(false);
    expect(isPerFileStrategy(undefined)).toBe(false);
  });
});

const CTX: AgentContext = {
  attached: [
    { path: "docs/b.md", order: 1, tokens: 20, present: true },
    { path: "specs/a.md", order: 0, tokens: 10, present: true },
    { path: "gone.md", order: 2, tokens: 0, present: false },
  ],
  inherited: [
    { path: "docs/c.md", skill_id: "s1", skill_name: "rubric", tokens: 5, present: true },
    { path: "specs/a.md", skill_id: "s1", skill_name: "rubric", tokens: 10, present: true },
  ],
};
const FILES = [
  file("specs/a.md", 10, "specs"),
  file("docs/b.md", 20),
  file("docs/c.md", 5),
  file("docs/d.md", 7),
];

describe("buildAgentRows", () => {
  const rows = buildAgentRows(FILES, CTX);
  it("lists own rows in attached order, then remaining docs, then missing ones", () => {
    expect(rows.map((r) => r.path)).toEqual([
      "specs/a.md",
      "docs/b.md",
      "docs/c.md",
      "docs/d.md",
      "gone.md",
    ]);
  });
  it("own rows are checked and never marked inherited, even when a skill also carries them", () => {
    expect(rows[0]).toMatchObject({ checked: true, inheritedFrom: null, category: "specs" });
  });
  it("an inherited-only doc is checked and names its skill", () => {
    expect(rows[2]).toMatchObject({ checked: true, inheritedFrom: "rubric" });
  });
  it("a remaining doc is unchecked", () => {
    expect(rows[3]).toMatchObject({ checked: false, inheritedFrom: null, tokens: 7 });
  });
  it("a missing attached path is flagged not present with 0 tokens", () => {
    expect(rows[4]).toMatchObject({ present: false, tokens: 0, checked: true, category: null });
  });
});

describe("contextTotals", () => {
  it("dedups by path (own wins) and skips missing docs", () => {
    expect(contextTotals(CTX)).toEqual({ total: 35, inherited: 5 });
  });
  it("is zero for an empty context", () => {
    expect(contextTotals({ attached: [], inherited: [] })).toEqual({ total: 0, inherited: 0 });
  });
});
