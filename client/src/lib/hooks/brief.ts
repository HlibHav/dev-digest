/* hooks/brief.ts — React Query hooks for the PR Brief card.
   GET /pulls/:id/brief reads the stored brief (null when none);
   POST /pulls/:id/brief generates one and replaces the cached copy. */
"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PrBriefResult } from "@devdigest/shared";
import { api } from "../api";

/** The PR detail request, as the brief sees it: `settled` once it has succeeded or failed,
    `refreshedAt` moves each time the detail is fetched again. */
export type BriefGate = { settled: boolean; refreshedAt: number };

/** Reads the stored brief once the PR detail has settled (the detail request moves
    `head_sha` on the server, which the `stale` flag is judged against), and re-reads it
    whenever the detail is refreshed again. */
export function usePrBrief(prId: string | null | undefined, gate: BriefGate) {
  const query = useQuery({
    queryKey: ["pr-brief", prId],
    queryFn: async () => (await api.get<{ brief: PrBriefResult | null }>(`/pulls/${prId}/brief`)).brief,
    enabled: !!prId && gate.settled,
    retry: false,
  });

  // Re-read through the client, not `query.refetch`: touching a result field here would make
  // react-query track it and stop re-rendering the caller for the fields only it reads.
  const qc = useQueryClient();
  const lastRefreshedAt = useRef<number | null>(null);
  useEffect(() => {
    if (!gate.settled) return;
    // The first settled read is the query's own; only a later change is a re-read.
    if (lastRefreshedAt.current === null) {
      lastRefreshedAt.current = gate.refreshedAt;
      return;
    }
    if (lastRefreshedAt.current === gate.refreshedAt) return;
    lastRefreshedAt.current = gate.refreshedAt;
    if (prId) void qc.refetchQueries({ queryKey: ["pr-brief", prId], exact: true });
  }, [gate.settled, gate.refreshedAt, prId, qc]);

  return query;
}

/** POST /pulls/:id/brief — one generation; the result replaces the cached brief.
    A failure surfaces as an `ApiError` (`code`: `config_error`, `external_service_error`)
    and leaves the cached brief alone. */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post<{ brief: PrBriefResult }>(`/pulls/${prId}/brief`)).brief,
    onSuccess: (brief) => {
      qc.setQueryData(["pr-brief", prId], brief);
    },
  });
}
