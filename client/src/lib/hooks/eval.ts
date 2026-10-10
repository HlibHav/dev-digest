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
import { api } from "../api";

/** Poll cadence while a run is `running`. */
export const EVAL_POLL_MS = 1500;

// ---- Cases ----
export function useEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", agentId],
    queryFn: () => api.get<EvalCaseView[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

export function useCreateEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EvalCaseWrite) => api.post<EvalCaseView>(`/agents/${agentId}/eval-cases`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases", agentId] }),
  });
}

export function useUpdateEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: EvalCaseWrite }) =>
      api.put<EvalCaseView>(`/eval-cases/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases", agentId] }),
  });
}

export function useDeleteEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: true }>(`/eval-cases/${id}`),
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
      api.post<EvalCaseCreated>(`/findings/${findingId}/eval-case`),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ["eval-cases", created.agent.id] });
      void qc.invalidateQueries({ queryKey: ["eval-dashboard", created.agent.id] });
    },
  });
}

// ---- Case runs ----
export function useStartCaseRun() {
  return useMutation({
    mutationFn: (caseId: string) => api.post<EvalCaseRunAccepted>(`/eval-cases/${caseId}/run`),
  });
}

export function useCaseRun(caseRunId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-case-run", caseRunId],
    queryFn: () => api.get<EvalCaseResult>(`/eval-case-runs/${caseRunId}`),
    enabled: !!caseRunId,
    refetchInterval: (q) => (q.state.data?.status === "running" ? EVAL_POLL_MS : false),
  });
}

// ---- Suite runs ----
export function useStartSuiteRun() {
  return useMutation({
    mutationFn: (agentId: string) => api.post<EvalSuiteRunAccepted>(`/agents/${agentId}/eval-runs`),
  });
}

/** Polls while `running`; on the edge into a terminal status the agent's dashboard,
    cases and history are refetched once. */
export function useSuiteRun(suiteRunId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["eval-suite-run", suiteRunId],
    queryFn: () => api.get<EvalSuiteRunDetail>(`/eval-suite-runs/${suiteRunId}`),
    enabled: !!suiteRunId,
    refetchInterval: (q) => (q.state.data?.status === "running" ? EVAL_POLL_MS : false),
  });

  const status = query.data?.status;
  const agentId = query.data?.agent_id;
  const sawRunning = useRef<string | null>(null);
  useEffect(() => {
    if (!suiteRunId || !status || !agentId) return;
    if (status === "running") {
      sawRunning.current = suiteRunId;
      return;
    }
    if (sawRunning.current !== suiteRunId) return; // only the running → terminal edge
    sawRunning.current = null;
    void qc.invalidateQueries({ queryKey: ["eval-dashboard", agentId] });
    void qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
    void qc.invalidateQueries({ queryKey: ["eval-history", agentId] });
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
    queryFn: () => api.get<EvalSuiteRunSummary[]>(`/agents/${agentId}/eval-suite-runs`),
    enabled: !!agentId,
  });
}

export function useEvalCompare(baseId: string | null | undefined, headId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-compare", baseId, headId],
    queryFn: () =>
      api.get<EvalCompare>(
        `/eval-suite-runs/compare?base=${encodeURIComponent(baseId ?? "")}&head=${encodeURIComponent(headId ?? "")}`,
      ),
    enabled: !!baseId && !!headId,
  });
}

export function useAgentEvalDashboard(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-dashboard", agentId],
    queryFn: () => api.get<EvalAgentDashboard>(`/agents/${agentId}/eval-dashboard`),
    enabled: !!agentId,
  });
}

export function useEvalWorkspaceDashboard() {
  return useQuery({
    queryKey: ["eval-workspace-dashboard"],
    queryFn: () => api.get<EvalWorkspaceDashboard>("/eval/dashboard"),
  });
}
