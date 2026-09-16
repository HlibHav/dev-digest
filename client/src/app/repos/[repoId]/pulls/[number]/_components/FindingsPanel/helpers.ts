import type { FindingRecord, Severity } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_FILTERS, SEVERITY_ORDER } from "./constants";

/** Optionally drop low-confidence findings, keep one severity, and sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: Severity | null = null,
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  if (severity) shown = shown.filter((f) => f.severity === severity);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/** Findings per severity, zero included. Plain counting, no LLM. */
export function countsBySeverity(findings: FindingRecord[]): Record<Severity, number> {
  const counts = Object.fromEntries(SEVERITY_FILTERS.map((sev) => [sev, 0])) as Record<Severity, number>;
  for (const f of findings) if (f.severity in counts) counts[f.severity] += 1;
  return counts;
}
