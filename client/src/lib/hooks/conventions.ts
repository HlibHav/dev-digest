/* hooks/conventions.ts — React Query hooks for the Conventions Extractor.

   The scan runs as a background job, so the list query polls while a scan is
   in flight (same shape as `useRepoIntelStatus`) and stops as soon as it isn't. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate, ConventionsPage, ConventionStatus, Skill } from "@devdigest/shared";

const SCAN_POLL_MS = 1500;

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionsPage>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
    // Poll only while the job is unfinished; an idle page makes no requests.
    refetchInterval: (query) => {
      const status = query.state.data?.scan?.status;
      return status === "queued" || status === "running" ? SCAN_POLL_MS : false;
    },
  });
}

/** Start a scan. Returns immediately with a job id; progress arrives via polling. */
export function useExtractConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<{ status: string; job_id: string; scan_id: string }>(
        `/repos/${repoId}/conventions/extract`,
        {},
      ),
    onSuccess: (_d, repoId) => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

export interface PatchConventionInput {
  repoId: string;
  id: string;
  patch: { status?: ConventionStatus; rule?: string; category?: string };
}

/** Accept, reject, or edit one candidate. */
export function usePatchConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: PatchConventionInput) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (_d, { repoId }) => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

/** The generated body the create-skill modal opens with, so the user edits real text. */
export function useConventionSkillPreview(repoId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["conventions-skill-preview", repoId],
    queryFn: () => api.get<{ body: string }>(`/repos/${repoId}/conventions/skill`),
    enabled: !!repoId && enabled,
    staleTime: 0,
  });
}

export interface CreateConventionSkillInput {
  repoId: string;
  name?: string;
  description?: string;
  body?: string;
  agent_id?: string;
}

export function useCreateConventionSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, ...body }: CreateConventionSkillInput) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, body),
    onSuccess: (_d, { repoId }) => {
      // The skill lands in the library, and may have been linked to an agent.
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}
