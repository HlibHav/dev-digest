/* hooks/agent-performance.ts — read-only React Query hooks for the Agent Performance
   dashboard (GET /agent-performance) and an agent's Stats tab (GET /agents/:id/stats). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentPerformance, AgentStats, StatsQuery } from "@devdigest/shared";

/** Query string for a stats request: `period=1d`, `period=30d` or `period=custom&from=…&to=…`. */
export function statsSearch(q: StatsQuery): string {
  const sp = new URLSearchParams();
  if (q.period) sp.set("period", q.period);
  if (q.period === "custom") {
    if (q.from) sp.set("from", q.from);
    if (q.to) sp.set("to", q.to);
  }
  return sp.toString();
}

/** The dashboard for a period. `null` (an incomplete or invalid custom range) requests nothing. */
export function useAgentPerformance(query: StatsQuery | null) {
  return useQuery({
    queryKey: ["agent-performance", query],
    queryFn: () => api.get<AgentPerformance>(`/agent-performance?${statsSearch(query!)}`),
    enabled: query !== null,
  });
}

/** One agent's stats for a period. `null` requests nothing. */
export function useAgentStats(agentId: string, query: StatsQuery | null) {
  return useQuery({
    queryKey: ["agent-stats", agentId, query],
    queryFn: () => api.get<AgentStats>(`/agents/${encodeURIComponent(agentId)}/stats?${statsSearch(query!)}`),
    enabled: query !== null,
  });
}
