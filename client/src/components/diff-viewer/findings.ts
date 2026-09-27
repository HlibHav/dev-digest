/* Inline-finding support for the DiffViewer (Files changed tab, Smart Diff).
   Pure helpers + the API shape the viewer needs; mirrors comments.ts's shape
   exactly. React bits (the actual finding card) are supplied by the caller
   via `renderFinding`, since this shared component must not import
   FindingCard from app/**. */
import type { ReactNode } from "react";
import type { FindingRecord, Severity } from "@/lib/types";

/** What the viewer needs to read + render findings inline. */
export interface DiffFindingApi {
  findings: FindingRecord[];
  /** When false, findings are hidden inline (the dot/stripe still show). */
  showFindings: boolean;
  renderFinding(f: FindingRecord): ReactNode;
}

/** `RIGHT:${start_line}` — findings anchor to the new side, like `lineKey`
 *  keys a comment thread to a diff line. */
export function findingKey(f: FindingRecord): string {
  return `RIGHT:${f.start_line}`;
}

/**
 * Split a file's findings into ones anchored to a rendered line vs.
 * "unanchored" (the finding's `start_line` isn't in this patch). Same shape
 * as `partitionThreads` — nothing is silently dropped.
 */
export function partitionFindings(
  fileFindings: FindingRecord[],
  renderedKeys: Set<string>,
): { matched: Map<string, FindingRecord[]>; unanchored: FindingRecord[] } {
  const matched = new Map<string, FindingRecord[]>();
  const unanchored: FindingRecord[] = [];
  for (const f of fileFindings) {
    const key = findingKey(f);
    if (renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(f);
      matched.set(key, list);
    } else {
      unanchored.push(f);
    }
  }
  return { matched, unanchored };
}

/** Count of `paths` that appear as some finding's `file` (files-with-findings,
 *  not a findings count — a file with 5 findings still counts once). */
export function filesWithFindings(paths: string[], findings: FindingRecord[]): number {
  const withFindings = new Set(findings.map((f) => f.file));
  return paths.filter((p) => withFindings.has(p)).length;
}

/** CRITICAL → blocker, WARNING → warning, SUGGESTION → suggestion. INFO is
 *  unused by this feature; mapped defensively to `suggestion` rather than
 *  throwing. */
export function severityLabel(sev: Severity): "blocker" | "warning" | "suggestion" {
  if (sev === "CRITICAL") return "blocker";
  if (sev === "WARNING") return "warning";
  return "suggestion";
}

/** Ranks a line's stripe colour when it hosts more than one finding:
 *  CRITICAL > WARNING > SUGGESTION. */
const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
};

/** The highest-severity finding in a list (stripe colour picks its `SEV[].c`
 *  at the call site) — all findings for the line still render individually. */
export function highestSeverity(findings: FindingRecord[]): FindingRecord | undefined {
  return findings.reduce<FindingRecord | undefined>((top, f) => {
    if (!top || SEVERITY_RANK[f.severity] > SEVERITY_RANK[top.severity]) return f;
    return top;
  }, undefined);
}
