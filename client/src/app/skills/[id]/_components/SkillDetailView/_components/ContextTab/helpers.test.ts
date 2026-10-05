import { describe, it, expect } from "vitest";
import type { ContextAttachment, SpecFile } from "@devdigest/shared";
import { groupSerializedPaths } from "./helpers";

const file = (path: string, category: SpecFile["category"]): SpecFile => ({
  path,
  category,
  tokens: 1,
  used_by: { agents: 0, skills: 0 },
});
const att = (path: string, order: number, present = true): ContextAttachment => ({ path, order, tokens: 1, present });

describe("groupSerializedPaths", () => {
  it("groups in specs, docs, insights order with other under docs", () => {
    const files = [
      file("docs/b.md", "docs"),
      file("server/INSIGHTS.md", "insights"),
      file("specs/public-api.md", "specs"),
      file("README.md", "other"),
    ];
    const attached = [att("docs/b.md", 0), att("server/INSIGHTS.md", 1), att("specs/public-api.md", 2), att("README.md", 3)];
    expect(groupSerializedPaths(attached, files)).toEqual([
      { group: "specs", paths: ["specs/public-api.md"] },
      { group: "docs", paths: ["docs/b.md", "README.md"] },
      { group: "insights", paths: ["server/INSIGHTS.md"] },
    ]);
  });

  it("sorts by order, not array position", () => {
    const files = [file("specs/a.md", "specs"), file("specs/b.md", "specs")];
    expect(groupSerializedPaths([att("specs/a.md", 1), att("specs/b.md", 0)], files)).toEqual([
      { group: "specs", paths: ["specs/b.md", "specs/a.md"] },
    ]);
  });

  it("omits empty groups", () => {
    expect(groupSerializedPaths([att("specs/a.md", 0)], [file("specs/a.md", "specs")])).toHaveLength(1);
  });

  it("skips absent attachments and attachments not in the doc list", () => {
    const files = [file("specs/a.md", "specs"), file("specs/gone.md", "specs")];
    const attached = [att("specs/a.md", 0), att("specs/gone.md", 1, false), att("specs/unlisted.md", 2)];
    expect(groupSerializedPaths(attached, files)).toEqual([{ group: "specs", paths: ["specs/a.md"] }]);
  });

  it("returns nothing when nothing is attached", () => {
    expect(groupSerializedPaths([], [file("specs/a.md", "specs")])).toEqual([]);
  });
});
