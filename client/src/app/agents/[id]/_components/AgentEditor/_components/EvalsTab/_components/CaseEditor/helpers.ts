/* Pure helper for the Case Editor's last-run panel. */
import type { EvalCaseLastResult, EvalCaseResult } from "@devdigest/shared";
import { formatCost } from "@/components/eval/helpers";

export interface LastRunView {
  status: "running" | "passed" | "failed" | "errored";
  /** Absent while running and for an errored run (nothing was scored). */
  summary: { matched: number; expected: number; durationSec: string; cost: string } | null;
}

const NONE = "—";

/** The run just started in this editor wins; otherwise the case's stored last result. */
export function lastRunView(
  run: EvalCaseResult | null,
  runStarted: boolean,
  stored: EvalCaseLastResult | null,
): LastRunView | null {
  if (run) {
    if (run.status === "running" || run.status === "errored") return { status: run.status, summary: null };
    return {
      status: run.status,
      summary: {
        matched: run.matched_must_find,
        expected: run.must_find_total,
        durationSec: run.duration_ms === null ? NONE : (run.duration_ms / 1000).toFixed(1),
        cost: formatCost(run.cost_usd, false),
      },
    };
  }
  if (runStarted) return { status: "running", summary: null };
  if (!stored) return null;
  if (stored.status === "errored") return { status: "errored", summary: null };
  return {
    status: stored.status,
    summary: {
      matched: stored.matched,
      expected: stored.expected,
      durationSec: stored.duration_ms === null ? NONE : (stored.duration_ms / 1000).toFixed(1),
      cost: formatCost(stored.cost_usd, false),
    },
  };
}
