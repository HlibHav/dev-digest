/* Pure helpers for ProjectContextView. */
import type { SpecFile } from "@devdigest/shared";

export type DocTreeNode =
  | { kind: "folder"; name: string; children: DocTreeNode[] }
  | { kind: "file"; name: string; file: SpecFile };

/** Group repo-relative doc paths into a folder tree; folders first, then A-Z. */
export function buildDocTree(files: SpecFile[]): DocTreeNode[] {
  const root: DocTreeNode[] = [];
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    const name = parts.pop();
    if (!name) continue;
    let level = root;
    for (const part of parts) {
      let folder = level.find((n) => n.kind === "folder" && n.name === part);
      if (!folder) {
        folder = { kind: "folder", name: part, children: [] };
        level.push(folder);
      }
      level = (folder as Extract<DocTreeNode, { kind: "folder" }>).children;
    }
    level.push({ kind: "file", name, file });
  }
  return sortTree(root);
}

function sortTree(nodes: DocTreeNode[]): DocTreeNode[] {
  const sorted = [...nodes].sort((a, b) =>
    a.kind !== b.kind ? (a.kind === "folder" ? -1 : 1) : a.name.localeCompare(b.name),
  );
  return sorted.map((n) => (n.kind === "folder" ? { ...n, children: sortTree(n.children) } : n));
}

export function totalTokens(files: SpecFile[]): number {
  return files.reduce((sum, f) => sum + f.tokens, 0);
}

/** Time-of-day label for a scan timestamp, in the viewer's locale. */
export function formatScanTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}
