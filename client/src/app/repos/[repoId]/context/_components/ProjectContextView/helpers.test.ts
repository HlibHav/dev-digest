import { describe, it, expect } from "vitest";
import type { SpecFile } from "@devdigest/shared";
import { buildDocTree } from "./helpers";

function doc(path: string, tokens = 100): SpecFile {
  return { path, category: "docs", tokens, used_by: { agents: 0, skills: 0 } };
}

describe("buildDocTree", () => {
  it("groups three docs into two folders", () => {
    const tree = buildDocTree([doc("docs/a.md"), doc("docs/b.md"), doc("specs/c.md")]);
    const folders = tree.filter((n) => n.kind === "folder");
    expect(folders).toHaveLength(2);
    const files = folders.flatMap((f) => (f.kind === "folder" ? f.children : []));
    expect(files.filter((n) => n.kind === "file")).toHaveLength(3);
  });
});
