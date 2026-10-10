/* hooks/eval.ts — React Query hooks for the eval pipeline: cases, case and suite
   runs (polled while running), history, compare and the two dashboards. */
"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

/** True when a case-run read failed because the run no longer exists (404), as opposed to a
    transient error that polling rides through. */
export function isCaseRunGone(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/** Polls a case run until a terminal status or a 404; transient errors keep polling (the last
    good `data` stays, `error` is set). With `agentId`, the agent's cases and dashboard are
    refetched once per run id on any terminal status, even if the first fetch is terminal. */
export function useCaseRun(caseRunId: string | null | undefined, agentId?: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["eval-case-run", caseRunId],
    queryFn: () => api.get<EvalCaseResult>(`/eval-case-runs/${seg(caseRunId)}`),
    enabled: !!caseRunId,
    retry: (count, err) => !isCaseRunGone(err) && count < 2,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (status && status !== "running") return false;
      return isCaseRunGone(q.state.error) ? false : EVAL_POLL_MS;
    },
  });

  const status = query.data?.status;
  const refreshed = useRef<string | null>(null);
  useEffect(() => {
    if (!caseRunId || !agentId || !status || status === "running") return;
    if (refreshed.current === caseRunId) return; // once per case run
    refreshed.current = caseRunId;
    void qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
    void qc.invalidateQueries({ queryKey: ["eval-dashboard", agentId] });
  }, [caseRunId, agentId, status, qc]);

  return query;
}

// ---- Suite runs ----
export function useStartSuiteRun() {
  return useMutation({
    mutationFn: (agentId: string) => api.post<EvalSuiteRunAccepted>(`/agents/${seg(agentId)}/eval-runs`),
  });
}

/** Polls while `running`; on reaching a terminal status (even on the first fetch) the agent's
    dashboard, cases and history and the workspace dashboard are refetched once. */
export function useSuiteRun(suiteRunId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["eval-suite-run", suiteRunId],
    queryFn: () => api.get<EvalSuiteRunDetail>(`/eval-suite-runs/${seg(suiteRunId)}`),
    enabled: !!suiteRunId,
    refetchInterval: (q) => (q.state.data?.status === "running" ? EVAL_POLL_MS : false),
  });

  const status = query.data?.status;
  const agentId = query.data?.agent_id;
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

  return query;
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
