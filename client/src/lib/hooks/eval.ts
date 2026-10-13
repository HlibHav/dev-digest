/* hooks/eval.ts — React Query hooks for the eval pipeline: cases, case and suite
   runs (polled while running), history, compare and the two dashboards. */
"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type {
  EvalAgentDashboard,
  EvalCaseCreated,
  EvalCaseResult,
  EvalCaseRunAccepted,
  EvalCaseView,
  EvalCaseWrite,
  EvalCompare,
  EvalRunAllResult,
  EvalSuiteRunAccepted,
  EvalSuiteRunDetail,
  EvalSuiteRunSummary,
  EvalWorkspaceDashboard,
} from "@devdigest/shared";
import { ApiError, api } from "../api";

/** Poll cadence while a run is `running`. */
export const EVAL_POLL_MS = 1500;
/** The workspace dashboard runs an N+1 query, so it polls slower than a single run. */
export const EVAL_DASHBOARD_POLL_MS = 5000;

const seg = (id: string | null | undefined) => encodeURIComponent(id ?? "");

// ---- Cases ----
export function useEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", agentId],
    queryFn: () => api.get<EvalCaseView[]>(`/agents/${seg(agentId)}/eval-cases`),
    enabled: !!agentId,
  });
}

export function useCreateEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EvalCaseWrite) => api.post<EvalCaseView>(`/agents/${seg(agentId)}/eval-cases`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases", agentId] }),
  });
}

export function useUpdateEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: EvalCaseWrite }) =>
      api.put<EvalCaseView>(`/eval-cases/${seg(id)}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases", agentId] }),
  });
}

export function useDeleteEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: true }>(`/eval-cases/${seg(id)}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      void qc.invalidateQueries({ queryKey: ["eval-dashboard", agentId] });
    },
  });
}

/** POST /findings/:id/eval-case. A failure is an `ApiError` carrying the server message. */
export function useCreateCaseFromFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId }: { findingId: string }) =>
      api.post<EvalCaseCreated>(`/findings/${seg(findingId)}/eval-case`),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ["eval-cases", created.agent.id] });
      void qc.invalidateQueries({ queryKey: ["eval-dashboard", created.agent.id] });
    },
  });
}

// ---- Case runs ----
export function useStartCaseRun() {
  return useMutation({
    mutationFn: (caseId: string) => api.post<EvalCaseRunAccepted>(`/eval-cases/${seg(caseId)}/run`),
  });
}

/** True when a run read failed because the run no longer exists (404), as opposed to a
    transient error that polling rides through. */
export function isCaseRunGone(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/** Longest wait between polls while the API keeps failing. */
export const EVAL_POLL_MAX_MS = 10000;

/** Wait before the next poll after `failures` consecutive failed polls: the normal interval
    when there are none, then doubling (3 s, 6 s) up to `EVAL_POLL_MAX_MS`. */
export function pollIntervalMs(failures: number): number {
  return failures <= 0 ? EVAL_POLL_MS : Math.min(EVAL_POLL_MS * 2 ** failures, EVAL_POLL_MAX_MS);
}

/** What a polled run hook returns: the un-spread query plus two flags. `gone`: the run no longer
    exists (404), polling is over. `reconnecting`: the last poll failed (not a 404) and polling
    goes on with backoff; the last good `data` stays. */
export type PolledRun<T> = { query: UseQueryResult<T>; gone: boolean; reconnecting: boolean };

/** One poll loop for a run (case or suite): re-reads while `running` and stops only on a terminal
    status or a 404. A transient failure never stops it: `retry: false` makes one queryFn call one
    poll, consecutive failures stretch the interval (`pollIntervalMs`) and a success resets it. */
function usePolledRun<T extends { status: string }>(
  queryKey: readonly unknown[],
  id: string | null | undefined,
  read: () => Promise<T>,
): PolledRun<T> {
  const failures = useRef<{ id: string | null | undefined; n: number }>({ id, n: 0 });
  if (failures.current.id !== id) failures.current = { id, n: 0 };
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const counter = failures.current;
      try {
        const run = await read();
        counter.n = 0;
        return run;
      } catch (err) {
        counter.n += 1;
        throw err;
      }
    },
    enabled: !!id,
    retry: false,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (status && status !== "running") return false;
      if (isCaseRunGone(q.state.error)) return false;
      return pollIntervalMs(failures.current.n);
    },
  });
  const gone = isCaseRunGone(query.error);
  // Subscribe to every failed poll: an error equal to the last one changes no other tracked field,
  // and the render that flags `reconnecting` must still happen.
  void query.errorUpdateCount;
  const status = query.data?.status;
  const over = gone || (status !== undefined && status !== "running");
  return { query, gone, reconnecting: query.isError && !over };
}

/** Polls a case run until a terminal status, a 404 (`gone`); transient failures are
    ridden through with backoff (`reconnecting`). With `agentId`, the agent's cases and
    dashboard are refetched once per run id on any terminal status, even if the first fetch is
    terminal. */
export function useCaseRun(caseRunId: string | null | undefined, agentId?: string | null) {
  const qc = useQueryClient();
  const polled = usePolledRun(["eval-case-run", caseRunId], caseRunId, () =>
    api.get<EvalCaseResult>(`/eval-case-runs/${seg(caseRunId)}`),
  );

  const status = polled.query.data?.status;
  const refreshed = useRef<string | null>(null);
  useEffect(() => {
    if (!caseRunId || !agentId || !status || status === "running") return;
    if (refreshed.current === caseRunId) return; // once per case run
    refreshed.current = caseRunId;
    void qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
    void qc.invalidateQueries({ queryKey: ["eval-dashboard", agentId] });
  }, [caseRunId, agentId, status, qc]);

  return polled;
}

// ---- Suite runs ----
export function useStartSuiteRun() {
  return useMutation({
    mutationFn: (agentId: string) => api.post<EvalSuiteRunAccepted>(`/agents/${seg(agentId)}/eval-runs`),
  });
}

/** Polls while `running` with the same failure rules as `useCaseRun`; on reaching a terminal
    status (even on the first fetch) the agent's dashboard, cases and history and the workspace
    dashboard are refetched once. */
export function useSuiteRun(suiteRunId: string | null | undefined) {
  const qc = useQueryClient();
  const polled = usePolledRun(["eval-suite-run", suiteRunId], suiteRunId, () =>
    api.get<EvalSuiteRunDetail>(`/eval-suite-runs/${seg(suiteRunId)}`),
  );

  const status = polled.query.data?.status;
  const agentId = polled.query.data?.agent_id;
  const refreshed = useRef<string | null>(null);
  useEffect(() => {
    if (!suiteRunId || !status || !agentId || status === "running") return;
    if (refreshed.current === suiteRunId) return; // once per suite run
    refreshed.current = suiteRunId;
    void qc.invalidateQueries({ queryKey: ["eval-dashboard", agentId] });
    void qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
    void qc.invalidateQueries({ queryKey: ["eval-history", agentId] });
    void qc.invalidateQueries({ queryKey: ["eval-workspace-dashboard"] });
  }, [suiteRunId, status, agentId, qc]);

  return polled;
}

export function useRunAllAgents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalRunAllResult>("/eval-runs/all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-workspace-dashboard"] }),
  });
}

// ---- History, compare, dashboards ----
export function useEvalHistory(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-history", agentId],
    queryFn: () => api.get<EvalSuiteRunSummary[]>(`/agents/${seg(agentId)}/eval-suite-runs`),
    enabled: !!agentId,
  });
}

export function useEvalCompare(baseId: string | null | undefined, headId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-compare", baseId, headId],
    queryFn: () =>
      api.get<EvalCompare>(
        `/eval-suite-runs/compare?base=${seg(baseId)}&head=${seg(headId)}`,
      ),
    enabled: !!baseId && !!headId,
  });
}

export function useAgentEvalDashboard(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-dashboard", agentId],
    queryFn: () => api.get<EvalAgentDashboard>(`/agents/${seg(agentId)}/eval-dashboard`),
    enabled: !!agentId,
  });
}

export function useEvalWorkspaceDashboard() {
  return useQuery({
    queryKey: ["eval-workspace-dashboard"],
    queryFn: () => api.get<EvalWorkspaceDashboard>("/eval/dashboard"),
    refetchInterval: (q) =>
      q.state.data?.recent_runs.some((r) => r.status === "running") ? EVAL_DASHBOARD_POLL_MS : false,
  });
}
