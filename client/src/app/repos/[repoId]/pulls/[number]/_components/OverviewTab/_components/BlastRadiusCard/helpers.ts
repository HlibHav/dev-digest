/* BlastRadiusCard/helpers.ts — pure functions over a BlastRadius payload:
   the stat-row counts (Count rules, plan "Contracts & data"), which sha a
   caller link points at, and the tree -> graph projection. No React import. */
import type { BlastRadius } from "@devdigest/shared";

export interface BlastStats {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/** Count rules (shared with the server `summary` and the MCP output):
    symbols = changed_symbols.length; callers = distinct file:line pairs;
    endpoints/crons = distinct strings, across all downstream groups. */
export function blastStats(blast: BlastRadius): BlastStats {
  const callerKeys = new Set<string>();
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  for (const group of blast.downstream) {
    for (const caller of group.callers) callerKeys.add(`${caller.file}:${caller.line}`);
    for (const endpoint of group.endpoints_affected) endpoints.add(endpoint);
    for (const cron of group.crons_affected) crons.add(cron);
  }
  return {
    symbols: blast.changed_symbols.length,
    callers: callerKeys.size,
    endpoints: endpoints.size,
    crons: crons.size,
  };
}

/** Which sha a caller `file:line` link should point at: the index's
    `lastIndexedSha` when it has indexed something, else the PR's `head_sha`,
    else null (render plain text — review-focus: an un-indexed repo has
    `lastIndexedSha === ''`). */
export function pickLinkSha(
  lastIndexedSha: string | null | undefined,
  headSha: string | null | undefined,
): string | null {
  if (lastIndexedSha) return lastIndexedSha;
  if (headSha) return headSha;
  return null;
}

export interface GraphNode {
  id: string;
  label: string;
  kind: "symbol" | "caller" | "endpoint" | "cron";
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface BlastGraphModel {
  symbols: GraphNode[];
  callers: GraphNode[];
  targets: GraphNode[];
  edges: GraphEdge[];
}

/** Projects a BlastRadius onto a three-column graph model: changed symbols,
    the callers that reach them, and the endpoints/crons those callers sit
    behind. Caller and target nodes are deduped by id across groups; edges
    are deduped by the exact {from, to} pair. */
export function toGraphModel(blast: BlastRadius): BlastGraphModel {
  const symbols: GraphNode[] = blast.changed_symbols.map((symbol) => ({
    id: `sym:${symbol.name}`,
    label: symbol.name,
    kind: "symbol",
  }));

  const callerNodes = new Map<string, GraphNode>();
  const targetNodes = new Map<string, GraphNode>();
  const edgeKeys = new Set<string>();
  const edges: GraphEdge[] = [];

  const addEdge = (from: string, to: string) => {
    const key = `${from}\u0000${to}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to });
  };

  for (const group of blast.downstream) {
    const symbolId = `sym:${group.symbol}`;
    for (const caller of group.callers) {
      const callerId = `caller:${caller.file}:${caller.line}`;
      if (!callerNodes.has(callerId)) {
        callerNodes.set(callerId, {
          id: callerId,
          label: `${caller.file}:${caller.line}`,
          kind: "caller",
        });
      }
      addEdge(symbolId, callerId);

      for (const endpoint of group.endpoints_affected) {
        const endpointId = `ep:${endpoint}`;
        if (!targetNodes.has(endpointId)) {
          targetNodes.set(endpointId, { id: endpointId, label: endpoint, kind: "endpoint" });
        }
        addEdge(callerId, endpointId);
      }
      for (const cron of group.crons_affected) {
        const cronId = `cron:${cron}`;
        if (!targetNodes.has(cronId)) {
          targetNodes.set(cronId, { id: cronId, label: cron, kind: "cron" });
        }
        addEdge(callerId, cronId);
      }
    }
  }

  return {
    symbols,
    callers: Array.from(callerNodes.values()),
    targets: Array.from(targetNodes.values()),
    edges,
  };
}
