/* hooks/onboarding.ts — React Query hooks for the Onboarding Tour of a repo. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { OnboardingGenerateAccepted, OnboardingView } from "@devdigest/shared";

export function useOnboarding(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["onboarding", repoId],
    queryFn: () => api.get<OnboardingView>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    refetchInterval: (query) => (query.state.data?.state === "generating" ? 1500 : false),
  });
}

export function useGenerateOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<OnboardingGenerateAccepted>(`/repos/${repoId}/onboarding/generate`, {}),
    onSettled: (_d, _e, repoId) => {
      qc.invalidateQueries({ queryKey: ["onboarding", repoId] });
    },
  });
}
