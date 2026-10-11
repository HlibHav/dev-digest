/* hooks/eval-tracked-suite.ts — which eval suite an agent screen is following. One decision,
   shared by the Evals tab and the per-agent dashboard: a suite started here or a running one
   found in the dashboard history is tracked until its poll ends. */
"use client";

import { useState } from "react";
import type { EvalSuiteRunSummary } from "@devdigest/shared";
import { useSuiteRun } from "./eval";

type RunLike = Pick<EvalSuiteRunSummary, "id" | "status" | "cases_done" | "cases_total">;
export type SuiteProgress = { done: number; total: number };

const of = (r: RunLike): SuiteProgress => ({ done: r.cases_done, total: r.cases_total });

/** Pure decision. `suite` is the tracked id's latest poll response, `failed` says the suite is
    gone (a 404, even after earlier `running` responses; a transient failure is never `failed`),
    `history` is the agent's dashboard history. A tracked id is *settled* only once its poll turned
    terminal or gone.
    - unsettled tracked id: it is the running suite (a started id with no response counts, 0/N,
      or the same-id running history row's progress);
    - settled or none: a running history row of another id is adopted (`adoptId`); a row for the
      same id is stale and ignored. */
export function decideSuite(args: {
  trackedId: string | null;
  suite: RunLike | undefined;
  failed: boolean;
  history: readonly RunLike[] | undefined;
  casesTotal: number;
}): { adoptId: string | null; progress: SuiteProgress | null } {
  const { trackedId, suite, failed, history, casesTotal } = args;
  const resumed = history?.find((r) => r.status === "running") ?? null;
  const settled = !trackedId || failed || (suite !== undefined && suite.status !== "running");
  if (!settled) {
    if (suite) return { adoptId: null, progress: of(suite) };
    const row = resumed?.id === trackedId ? resumed : null;
    return { adoptId: null, progress: row ? of(row) : { done: 0, total: casesTotal } };
  }
  if (resumed && resumed.id !== trackedId) return { adoptId: resumed.id, progress: of(resumed) };
  return { adoptId: null, progress: null };
}

/** Follows the running suite of `agentId`. `track(id)` starts following a suite started here.
    The tracked id is sticky (a history refetch that drops it cannot untrack it) and scoped to the
    agent, so switching agents on a mounted screen never shows another agent's suite. */
export function useTrackedSuite(
  agentId: string,
  history: readonly RunLike[] | undefined,
  casesTotal: number,
) {
  const [tracked, setTracked] = useState<{ agentId: string; id: string } | null>(null);
  const trackedId = tracked && tracked.agentId === agentId ? tracked.id : null;
  const { query, gone, reconnecting } = useSuiteRun(trackedId);
  const { adoptId, progress } = decideSuite({
    trackedId,
    suite: query.data,
    failed: gone,
    history,
    casesTotal,
  });
  // Adopting during render re-renders at once, before anything is committed.
  if (adoptId) setTracked({ agentId, id: adoptId });
  return {
    trackedId,
    suite: query.data,
    progress,
    running: progress !== null,
    /** Set once the suite is gone (404); cleared by tracking another suite. */
    error: gone ? query.error : null,
    /** The last poll failed but polling goes on: the suite is still tracked and unsettled. */
    reconnecting,
    track: (id: string) => setTracked({ agentId, id }),
  };
}
