/* Pure helpers for the Eval Dashboard. No React import. */
import type { EvalRecentRun, EvalSkipReason, EvalWorkspaceAgentRow } from "@devdigest/shared";

/** Drop null metrics: a gap is not a zero. */
export function sparkPoints(trend: readonly (number | null)[]): number[] {
  return trend.filter((v): v is number => v !== null);
}

/** Newest first by start time, run number as the tie-break. */
export function newestFirst(runs: readonly EvalRecentRun[]): EvalRecentRun[] {
  return [...runs].sort((a, b) => b.started_at.localeCompare(a.started_at) || b.run_number - a.run_number);
}

/** AC-53: nothing to show when no agent owns a case. */
export function hasNoCases(agents: readonly EvalWorkspaceAgentRow[]): boolean {
  return agents.every((a) => a.cases_total === 0);
}

export const SKIP_LABEL_KEY: Record<EvalSkipReason, string> = {
  disabled: "dashboard.skip.disabled",
  "no cases": "dashboard.skip.noCases",
  "too many cases": "dashboard.skip.tooManyCases",
  "already running": "dashboard.skip.alreadyRunning",
};
