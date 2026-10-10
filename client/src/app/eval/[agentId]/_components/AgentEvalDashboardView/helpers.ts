/* Pure helpers for the per-agent Eval Dashboard. No React import. */
import type { EvalSuiteRunSummary } from "@devdigest/shared";

export type RunProgress = { done: number; total: number };
type RunLike = Pick<EvalSuiteRunSummary, "id" | "status" | "cases_done" | "cases_total">;

const progress = (r: RunLike): RunProgress => ({ done: r.cases_done, total: r.cases_total });

/** Progress of the suite that is running now, or null when none is.
    `tracked` is the id we poll, `suite` its latest response, `resumed` a running suite
    listed in the dashboard history. A started id with no response yet counts as running. */
export function runningProgress(args: {
  trackedId: string | null;
  suite: RunLike | undefined;
  resumed: RunLike | null;
  casesTotal: number;
}): RunProgress | null {
  const { trackedId, suite, resumed, casesTotal } = args;
  const mine = suite && suite.id === trackedId ? suite : undefined;
  if (mine?.status === "running") return progress(mine);
  // History says a suite is running that we have not seen end.
  if (resumed && !(mine && mine.id === resumed.id)) return progress(resumed);
  if (trackedId && !mine) return { done: 0, total: casesTotal };
  return null;
}
