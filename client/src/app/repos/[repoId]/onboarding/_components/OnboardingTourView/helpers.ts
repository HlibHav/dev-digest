/* Pure helpers for the Onboarding Tour view. No React import. */

const MAX_DIAGRAM_NODES = 12;
const FLOWCHART_HEADER = /^\s*(flowchart|graph)\b/;
const NON_NODE_LINE = /^\s*(subgraph|end\b|style\b|classDef\b|class\b|linkStyle\b|direction\b|%%)/;

export function formatCost(c: number | null | undefined): string {
  return c == null ? "—" : `$${c.toFixed(4)}`;
}

export function formatAge(iso: string, now: Date): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (!(min >= 1)) return "just now";
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function isStale(
  tour: { commit_sha: string } | null | undefined,
  indexSha: string | null | undefined,
): boolean {
  if (!tour || !tour.commit_sha || !indexSha) return false;
  return tour.commit_sha !== indexSha;
}

export function githubBlobUrl(fullName: string, sha: string, path: string): string {
  const [owner = "", name = ""] = fullName.split("/");
  const segments = [owner, name, "blob", sha, ...path.split("/")].map((p, i) =>
    i === 2 ? p : encodeURIComponent(p),
  );
  return `https://github.com/${segments.join("/")}`;
}

/** Distinct node ids in a flowchart/graph source (labels, edge text and styling lines ignored). */
export function countDiagramNodes(src: string): number {
  const ids = new Set<string>();
  const lines = src.split("\n").slice(1);
  for (const raw of lines) {
    if (NON_NODE_LINE.test(raw)) continue;
    const line = raw
      .replace(/"[^"]*"/g, "")
      .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, "")
      .replace(/\|[^|]*\|/g, "")
      .replace(/\s(--|==)\s[^\n]*?\s(-->|==>)/g, ",")
      .replace(/[-=.]+>|[-=.]{2,}|--[^-=>]*-->/g, ",");
    for (const part of line.split(/[,&;]/)) {
      const id = part.trim().split(/\s+/)[0];
      if (id && /^[A-Za-z_][\w-]*$/.test(id)) ids.add(id);
    }
  }
  return ids.size;
}

export function diagramAllowed(src: string | null | undefined): boolean {
  if (!src || !FLOWCHART_HEADER.test(src)) return false;
  return countDiagramNodes(src) <= MAX_DIAGRAM_NODES;
}
