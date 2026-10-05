/* hooks/project-context.ts — React Query hooks for Project Context: one repo
   doc's content, and the docs attached to an agent or a skill. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentContext, ContextDocContent, SkillContext } from "@devdigest/shared";

export function useContextDoc(repoId: string | null | undefined, path: string | null) {
  return useQuery({
    queryKey: ["context", repoId, "file", path],
    queryFn: () =>
      api.get<ContextDocContent>(
        `/repos/${repoId}/context/file?path=${encodeURIComponent(path ?? "")}`,
      ),
    enabled: !!repoId && !!path,
  });
}

export function useAgentContext(agentId: string, repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-context", agentId, repoId],
    queryFn: () => api.get<AgentContext>(`/agents/${agentId}/context?repo_id=${repoId}`),
    enabled: !!agentId && !!repoId,
  });
}

/** Replace the whole attached set, in order (`paths` IS the order). */
export function useSetAgentContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, paths }: { agentId: string; paths: string[] }) =>
      api.put<unknown>(`/agents/${agentId}/context`, { paths }),
    onSuccess: (_d, { agentId }) => {
      qc.invalidateQueries({ queryKey: ["agent-context", agentId] });
      qc.invalidateQueries({ queryKey: ["context"] });
    },
  });
}

export function useSkillContext(skillId: string, repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-context", skillId, repoId],
    queryFn: () => api.get<SkillContext>(`/skills/${skillId}/context?repo_id=${repoId}`),
    enabled: !!skillId && !!repoId,
  });
}

export function useSetSkillContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, paths }: { skillId: string; paths: string[] }) =>
      api.put<unknown>(`/skills/${skillId}/context`, { paths }),
    onSuccess: (_d, { skillId }) => {
      qc.invalidateQueries({ queryKey: ["skill-context", skillId] });
      qc.invalidateQueries({ queryKey: ["agent-context"] });
      qc.invalidateQueries({ queryKey: ["context"] });
    },
  });
}
