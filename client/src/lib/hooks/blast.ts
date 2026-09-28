/* hooks/blast.ts — React Query hook for the blast-radius map (homework-5).
   GET /pulls/:id/blast → BlastRadius, read from the repo-intel index that
   already exists (no model call, no re-parse). */
"use client";

import { useQuery } from "@tanstack/react-query";
import type { BlastRadius } from "@devdigest/shared";
import { api } from "../api";

/** GET /pulls/:id/blast → the PR's blast radius (changed symbols, callers, endpoints, crons). */
export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast-radius", prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
