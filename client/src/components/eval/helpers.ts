/* Pure helpers shared by the eval screens. No React import. */
import type { EvalSuiteRunSummary } from "@devdigest/shared";
import { FLAT_PTS, FLAT_USD, NONE } from "./constants";

const MINUS = "−";

export type DeltaDirection = "up" | "down" | "flat" | "none";

/** `0.823` → `82%`; a null metric is `—`. */
export function formatPct(v: number | null): string {
  return v === null ? NONE : `${Math.round(v * 100)}%`;
}

function usd(v: number): string {
  return v > 0 && v < 0.01 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`;
}

/** `0.03` → `$0.03`; a partial total (some cases had no cost) gets a trailing `+`. */
export function formatCost(v: number | null, partial: boolean): string {
  if (v === null) return NONE;
  return partial ? `${usd(v)}+` : usd(v);
}

export function runLabel(runNumber: number, agentVersion: number): string {
  return `run #${runNumber} · agent v${agentVersion}`;
}

/** Signed text for a metric delta (`pts`: a 0..1 fraction; `usd`: dollars) and its direction. */
export function deltaView(delta: number | null, unit: "pts" | "usd"): { text: string; direction: DeltaDirection } {
  if (delta === null) return { text: NONE, direction: "none" };
  const abs = Math.abs(delta);
  if (abs < (unit === "pts" ? FLAT_PTS : FLAT_USD)) {
    return { text: unit === "pts" ? "0 pts" : "$0.00", direction: "flat" };
  }
  const sign = delta > 0 ? "+" : MINUS;
  const body = unit === "pts" ? `${Math.round(abs * 100)} pts` : usd(abs);
  return { text: `${sign}${body}`, direction: delta > 0 ? "up" : "down" };
}

/** Compare needs exactly two runs, neither of them failed (AC-49). */
export function compareEnabled(selected: readonly EvalSuiteRunSummary[]): boolean {
  return selected.length === 2 && selected.every((r) => r.status !== "failed");
}

/** ISO timestamp → `2026-10-09 10:00` (UTC), so the table reads the same on every machine. */
export function formatRanAt(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

/** Cases that produced a verdict: everything finished except the errored ones. */
export function executedCount(run: Pick<EvalSuiteRunSummary, "cases_done" | "cases_errored">): number {
  return run.cases_done - run.cases_errored;
}
