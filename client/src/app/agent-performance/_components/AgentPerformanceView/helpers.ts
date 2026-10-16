/** Pure helpers for the Agent Performance view. */
import type { RunsByStatus } from "@devdigest/shared";
import type { PeriodSelection } from "@/components/period-selector";

export const INCLUDED_STATUSES = ["failed", "running", "cancelled"] as const;
export type IncludedStatus = (typeof INCLUDED_STATUSES)[number];

export type RunsPart = { kind: "done"; count: number } | { kind: "includes"; status: IncludedStatus; count: number };

/** The Total runs sub-line: the done count, then every non-zero failed / running / cancelled count. */
export function runsLine(byStatus: RunsByStatus): RunsPart[] {
  const parts: RunsPart[] = [{ kind: "done", count: byStatus.done }];
  for (const status of INCLUDED_STATUSES) {
    if (byStatus[status] > 0) parts.push({ kind: "includes", status, count: byStatus[status] });
  }
  return parts;
}

/** i18n key (under `agentPerformance`) and values naming the selected period in card titles. */
export function periodLabel(sel: PeriodSelection): { key: string; values?: { from: string; to: string } } {
  if (sel.period === "1d") return { key: "period.oneDay" };
  if (sel.period === "30d") return { key: "period.thirtyDays" };
  if (sel.from && sel.to) return { key: "period.range", values: { from: sel.from, to: sel.to } };
  return { key: "period.custom" };
}
