import { z } from 'zod';
import { Severity } from './findings.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiAgentRun        the response of POST /pulls/:id/multi-agent-run
 *   - AgentColumn          one agent's column in the multi-agent view
 *   - Conflict / ConflictTake  where agents disagree on the same file:line
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - AgentPerformance     all-agent dashboard payload (GET /agent-performance)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review
// ---------------------------------------------------------------------------

/** A finding as surfaced in a multi-agent column (subset of FindingRecord). */
export const AgentColumnFinding = z.object({
  id: z.string(),
  severity: Severity,
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  kind: z.string().nullish(),
});
export type AgentColumnFinding = z.infer<typeof AgentColumnFinding>;

/** One agent's result column in the multi-agent review. */
export const AgentColumn = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['done', 'failed', 'running']),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings: z.array(AgentColumnFinding),
});
export type AgentColumn = z.infer<typeof AgentColumn>;

/** One agent's stance on a contended file:line. */
export const ConflictTake = z.object({
  agent_id: z.string(),
  persona: z.string(),
  /** Severity if the agent flagged it, or 'ignored' when it did not. */
  verdict: z.union([Severity, z.literal('ignored')]),
  note: z.string(),
});
export type ConflictTake = z.infer<typeof ConflictTake>;

/**
 * A conflict = a file:line that at least one agent flagged and at least one
 * other agent (that also reviewed) did NOT, OR where agents assigned divergent
 * severities. Computed from persisted findings; not stored.
 */
export const Conflict = z.object({
  file: z.string(),
  line: z.number().int(),
  title: z.string(),
  takes: z.array(ConflictTake),
});
export type Conflict = z.infer<typeof Conflict>;

/** Response of POST /pulls/:id/multi-agent-run and GET /pulls/:id/multi-agent. */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  total_duration_ms: z.number().int(),
  total_cost_usd: z.number().nullable(),
  columns: z.array(AgentColumn),
  conflicts: z.array(Conflict),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

/** Time window a stats payload covers. `start`/`end` are UTC instants (ISO 8601). */
export const StatsPeriod = z.enum(['1d', '30d', 'custom']);
export type StatsPeriod = z.infer<typeof StatsPeriod>;

/** Query of GET /agent-performance and GET /agents/:id/stats. `from`/`to` are UTC dates. */
export const StatsQuery = z.object({
  period: StatsPeriod.optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type StatsQuery = z.infer<typeof StatsQuery>;

export const StatsWindow = z.object({
  period: StatsPeriod,
  start: z.string(),
  end: z.string(),
});
export type StatsWindow = z.infer<typeof StatsWindow>;

export const RunsByStatus = z.object({
  running: z.number().int(),
  done: z.number().int(),
  failed: z.number().int(),
  cancelled: z.number().int(),
});
export type RunsByStatus = z.infer<typeof RunsByStatus>;

/** One model's slice of an agent's runs (the run's own model, not the agent's current one). */
export const AgentModelSplit = z.object({
  model: z.string().nullable(),
  runs: z.number().int(),
  total_cost_usd: z.number().nullable(),
  accepted: z.number().int(),
  dismissed: z.number().int(),
  decisions: z.number().int(),
  accept_rate: z.number().nullable(),
});
export type AgentModelSplit = z.infer<typeof AgentModelSplit>;

/** Every metric of one agent (or of the deleted-agents bucket); carries no identity. */
export const AgentStatsMetrics = z.object({
  runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_latency_ms: z.number().nullable(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
  window: StatsWindow,
  runs_by_status: RunsByStatus,
  unpriced_runs: z.number().int(),
  decisions: z.number().int(),
  small_sample: z.boolean(),
  last_run_at: z.string().nullable(),
  by_model: z.array(AgentModelSplit),
  cost_basis: z.literal('estimate'),
});
export type AgentStatsMetrics = z.infer<typeof AgentStatsMetrics>;

export const AgentStats = AgentStatsMetrics.extend({
  agent_id: z.string(),
  agent_name: z.string(),
});
export type AgentStats = z.infer<typeof AgentStats>;

// ---------------------------------------------------------------------------
// Agent Performance dashboard (GET /agent-performance)
// ---------------------------------------------------------------------------

export const PerformanceTotals = z.object({
  runs: z.number().int(),
  runs_by_status: RunsByStatus,
  total_cost_usd: z.number().nullable(),
  unpriced_runs: z.number().int(),
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  decisions: z.number().int(),
  accept_rate: z.number().nullable(),
  small_sample: z.boolean(),
});
export type PerformanceTotals = z.infer<typeof PerformanceTotals>;

export const MostActiveAgent = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  accept_rate: z.number().nullable(),
  decisions: z.number().int(),
});
export type MostActiveAgent = z.infer<typeof MostActiveAgent>;

export const CostByAgent = z.object({
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  runs: z.number().int(),
  total_cost_usd: z.number().nullable(),
});
export type CostByAgent = z.infer<typeof CostByAgent>;

export const CostByModel = z.object({
  model: z.string().nullable(),
  runs: z.number().int(),
  total_cost_usd: z.number().nullable(),
});
export type CostByModel = z.infer<typeof CostByModel>;

export const AgentPerformance = z.object({
  window: StatsWindow,
  small_sample_threshold: z.number().int(),
  cost_basis: z.literal('estimate'),
  billing_reconciliation: z.literal('not_connected'),
  totals: PerformanceTotals,
  most_active: MostActiveAgent.nullable(),
  agents: z.array(AgentStats),
  deleted_agents: AgentStatsMetrics.nullable(),
  cost_by_agent: z.array(CostByAgent),
  cost_by_model: z.array(CostByModel),
});
export type AgentPerformance = z.infer<typeof AgentPerformance>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;
