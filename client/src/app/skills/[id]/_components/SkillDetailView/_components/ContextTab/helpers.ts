import type { ContextAttachment, ContextDocCategory, SpecFile } from "@devdigest/shared";

/** The groups of the "Serializes as" preview; `other` docs list under `docs`. */
export type SerializeGroup = "specs" | "docs" | "insights";

const GROUP_ORDER: SerializeGroup[] = ["specs", "docs", "insights"];

const groupOf = (category: ContextDocCategory): SerializeGroup => (category === "other" ? "docs" : category);

/**
 * The attached docs present in the repo, grouped by doc type in a fixed order, paths in
 * attachment order. Empty groups are left out. A display grouping only: the run prompt
 * keeps the order the skill sets.
 */
export function groupSerializedPaths(
  attached: ContextAttachment[],
  files: SpecFile[],
): { group: SerializeGroup; paths: string[] }[] {
  const categoryByPath = new Map(files.map((f) => [f.path, f.category]));
  const byGroup = new Map<SerializeGroup, string[]>();
  for (const a of [...attached].sort((x, y) => x.order - y.order)) {
    const category = categoryByPath.get(a.path);
    if (!a.present || !category) continue;
    const group = groupOf(category);
    byGroup.set(group, [...(byGroup.get(group) ?? []), a.path]);
  }
  return GROUP_ORDER.filter((g) => byGroup.has(g)).map((group) => ({ group, paths: byGroup.get(group)! }));
}
