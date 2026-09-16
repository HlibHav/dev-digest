/**
 * PR-list COST rollup (pure — no DB, so it unit-tests cleanly).
 *
 * The list's COST column is the cost of the PR's latest review request: every
 * agent run created by one POST /pulls/:id/review shares a `batch_id`. The
 * batch is picked from the newest COMPLETED run, so a request still in flight
 * shows the partial sum of its finished runs (or, before any finishes, the
 * previous batch). Runs from before batching have no batch and count alone.
 */

export interface CompletedRunCost {
  prId: string;
  batchId: string | null;
  /** Null when the run had no price data. */
  costUsd: number | null;
}

/**
 * `rows` must be the PRs' completed runs, newest first. Returns one entry per
 * PR that has a completed run: the summed cost of its latest batch, or null
 * when no run in that batch is priced (the UI shows "—", not "$0.00").
 */
export function latestBatchCostByPr(rows: CompletedRunCost[]): Map<string, number | null> {
  const latest = new Map<string, { batchId: string | null; cost: number | null }>();
  for (const r of rows) {
    const seen = latest.get(r.prId);
    if (!seen) {
      latest.set(r.prId, { batchId: r.batchId, cost: r.costUsd });
      continue;
    }
    // A null batch is a legacy run: it never shares a batch with another row.
    if (seen.batchId === null || r.batchId !== seen.batchId || r.costUsd === null) continue;
    seen.cost = (seen.cost ?? 0) + r.costUsd;
  }
  return new Map([...latest].map(([prId, { cost }]) => [prId, cost]));
}
