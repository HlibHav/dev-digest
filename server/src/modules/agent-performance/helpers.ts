import type {
  AgentModelSplit,
  AgentPerformance,
  AgentStats,
  AgentStatsMetrics,
  CostByAgent,
  CostByModel,
  MostActiveAgent,
  PerformanceTotals,
  RunsByStatus,
  StatPoint,
} from '@devdigest/shared';
import { DAY_MS, KNOWN_SEVERITIES, KNOWN_STATUSES, SMALL_SAMPLE_THRESHOLD } from './constants.js';
import type { FindingGroupRow, RawAggregate, RunGroupRow, TrendRow, WindowBounds, WorkspaceAgentRow } from './types.js';

/** A timestamp from the driver (a `Date`, or a Postgres text instant) as an ISO-8601 string. */
export function toIso(v: Date | string | null): string | null {
  if (v === null) return null;
  return (v instanceof Date ? v : new Date(v)).toISOString();
}

type Severity = (typeof KNOWN_SEVERITIES)[number];
type Status = (typeof KNOWN_STATUSES)[number];

type ModelAcc = { runs: number; costSum: number; priced: number; accepted: number; dismissed: number };

/** Running sums for one bucket: an agent, the deleted-agents row, or the whole workspace. */
type Acc = {
  runs: number;
  byStatus: RunsByStatus;
  costSum: number;
  priced: number;
  doneRuns: number;
  doneCostSum: number;
  donePriced: number;
  doneDurationSum: number;
  doneDurationN: number;
  lastRunMs: number | null;
  accepted: number;
  dismissed: number;
  pending: number;
  bySeverity: Record<Severity, number>;
  trend: Map<string, number>;
  models: Map<string | null, ModelAcc>;
};

function newAcc(): Acc {
  return {
    runs: 0,
    byStatus: { running: 0, done: 0, failed: 0, cancelled: 0 },
    costSum: 0,
    priced: 0,
    doneRuns: 0,
    doneCostSum: 0,
    donePriced: 0,
    doneDurationSum: 0,
    doneDurationN: 0,
    lastRunMs: null,
    accepted: 0,
    dismissed: 0,
    pending: 0,
    bySeverity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
    trend: new Map(),
    models: new Map(),
  };
}

function modelAcc(acc: Acc, model: string | null): ModelAcc {
  let m = acc.models.get(model);
  if (!m) {
    m = { runs: 0, costSum: 0, priced: 0, accepted: 0, dismissed: 0 };
    acc.models.set(model, m);
  }
  return m;
}

function isStatus(s: string | null): s is Status {
  return (KNOWN_STATUSES as readonly (string | null)[]).includes(s);
}

function isSeverity(s: string): s is Severity {
  return (KNOWN_SEVERITIES as readonly string[]).includes(s);
}

function addRun(acc: Acc, r: RunGroupRow): void {
  acc.runs += r.runs;
  if (isStatus(r.status)) acc.byStatus[r.status] += r.runs;
  acc.costSum += r.costSum ?? 0;
  acc.priced += r.priced;
  if (r.status === 'done') {
    acc.doneRuns += r.runs;
    acc.doneCostSum += r.costSum ?? 0;
    acc.donePriced += r.priced;
    acc.doneDurationSum += r.durationSum ?? 0;
    acc.doneDurationN += r.durationN;
  }
  const last = toIso(r.lastRunAt);
  if (last !== null) {
    const ms = Date.parse(last);
    if (acc.lastRunMs === null || ms > acc.lastRunMs) acc.lastRunMs = ms;
  }
  const m = modelAcc(acc, r.model);
  m.runs += r.runs;
  m.costSum += r.costSum ?? 0;
  m.priced += r.priced;
}

function addFindings(acc: Acc, f: FindingGroupRow): void {
  acc.accepted += f.accepted;
  acc.dismissed += f.dismissed;
  acc.pending += f.pending;
  if (isSeverity(f.severity)) acc.bySeverity[f.severity] += f.accepted + f.dismissed + f.pending;
  const m = modelAcc(acc, f.model);
  m.accepted += f.accepted;
  m.dismissed += f.dismissed;
}

function addTrend(acc: Acc, t: TrendRow): void {
  acc.trend.set(t.day, (acc.trend.get(t.day) ?? 0) + t.runs);
}

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

/** Every UTC day the window touches, oldest → newest, as `YYYY-MM-DD`. */
function windowDays(w: WindowBounds): string[] {
  const first = w.start.getTime() + (w.startInclusive ? 0 : 1);
  const last = w.end.getTime() - (w.endInclusive ? 0 : 1);
  const days: string[] = [];
  for (let ms = first - (first % DAY_MS); ms <= last; ms += DAY_MS) days.push(new Date(ms).toISOString().slice(0, 10));
  return days;
}

/** Non-null models by runs (most first) then name A→Z; the Unknown model bucket last. */
function sortedModels(acc: Acc): [string | null, ModelAcc][] {
  return [...acc.models.entries()]
    .filter(([, m]) => m.runs > 0)
    .sort(([a, ma], [b, mb]) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return mb.runs - ma.runs || a.localeCompare(b, 'en');
    });
}

function metrics(acc: Acc, w: WindowBounds, days: string[]): AgentStatsMetrics {
  const decisions = acc.accepted + acc.dismissed;
  const findingsTotal = decisions + acc.pending;
  const byModel: AgentModelSplit[] = sortedModels(acc).map(([model, m]) => ({
    model,
    runs: m.runs,
    total_cost_usd: m.priced > 0 ? m.costSum : null,
    accepted: m.accepted,
    dismissed: m.dismissed,
    decisions: m.accepted + m.dismissed,
    accept_rate: ratio(m.accepted, m.accepted + m.dismissed),
  }));
  const trend: StatPoint[] = days.map((label) => ({ label, value: acc.trend.get(label) ?? 0 }));
  return {
    runs: acc.runs,
    findings_total: findingsTotal,
    accepted: acc.accepted,
    dismissed: acc.dismissed,
    pending: acc.pending,
    accept_rate: ratio(acc.accepted, decisions),
    dismiss_rate: ratio(acc.dismissed, decisions),
    avg_findings_per_run: ratio(findingsTotal, acc.runs),
    total_cost_usd: acc.priced > 0 ? acc.costSum : null,
    avg_cost_usd: ratio(acc.doneCostSum, acc.donePriced),
    avg_latency_ms: ratio(acc.doneDurationSum, acc.doneDurationN),
    findings_by_severity: { ...acc.bySeverity },
    trend,
    window: windowOf(w),
    runs_by_status: { ...acc.byStatus },
    unpriced_runs: acc.doneRuns - acc.donePriced,
    decisions,
    small_sample: decisions < SMALL_SAMPLE_THRESHOLD,
    last_run_at: acc.lastRunMs === null ? null : new Date(acc.lastRunMs).toISOString(),
    by_model: byModel,
    cost_basis: 'estimate',
  };
}

function windowOf(w: WindowBounds): AgentPerformance['window'] {
  return { period: w.period, start: w.start.toISOString(), end: w.end.toISOString() };
}

function totalsOf(m: AgentStatsMetrics): PerformanceTotals {
  return {
    runs: m.runs,
    runs_by_status: m.runs_by_status,
    total_cost_usd: m.total_cost_usd,
    unpriced_runs: m.unpriced_runs,
    accepted: m.accepted,
    dismissed: m.dismissed,
    pending: m.pending,
    decisions: m.decisions,
    accept_rate: m.accept_rate,
    small_sample: m.small_sample,
  };
}

/** Existing agent with the most runs, then the latest last run, then name A→Z; null when none ran. */
function mostActive(rows: AgentStats[]): MostActiveAgent | null {
  const ran = rows.filter((r) => r.runs > 0);
  if (ran.length === 0) return null;
  const lastMs = (r: AgentStats) => (r.last_run_at === null ? 0 : Date.parse(r.last_run_at));
  const [top] = [...ran].sort(
    (a, b) => b.runs - a.runs || lastMs(b) - lastMs(a) || a.agent_name.localeCompare(b.agent_name, 'en'),
  );
  return {
    agent_id: top!.agent_id,
    agent_name: top!.agent_name,
    runs: top!.runs,
    accept_rate: top!.accept_rate,
    decisions: top!.decisions,
  };
}

/**
 * Turn the grouped rows of one workspace and window into the dashboard payload.
 * A run whose agent is null or not in `agents` lands in the deleted-agents row.
 * `GET /agents/:id/stats` returns one row of this result, so both endpoints agree.
 */
export function buildPerformance(agents: WorkspaceAgentRow[], raw: RawAggregate, w: WindowBounds): AgentPerformance {
  const live = new Map<string, Acc>(agents.map((a) => [a.id, newAcc()]));
  const deleted = newAcc();
  const total = newAcc();
  const bucket = (agentId: string | null): Acc => (agentId !== null ? live.get(agentId) : undefined) ?? deleted;

  for (const r of raw.runs) {
    addRun(bucket(r.agentId), r);
    addRun(total, r);
  }
  for (const f of raw.findings) {
    addFindings(bucket(f.agentId), f);
    addFindings(total, f);
  }
  for (const t of raw.trend) addTrend(bucket(t.agentId), t);

  const days = windowDays(w);
  const ordered = [...agents].sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id));
  const rows: AgentStats[] = ordered.map((a) => ({
    agent_id: a.id,
    agent_name: a.name,
    ...metrics(live.get(a.id)!, w, days),
  }));
  const hasDeleted = deleted.runs > 0;
  const deletedRow = hasDeleted ? metrics(deleted, w, days) : null;

  const costByAgent: CostByAgent[] = rows
    .filter((r) => r.runs > 0)
    .map((r) => ({ agent_id: r.agent_id, agent_name: r.agent_name, runs: r.runs, total_cost_usd: r.total_cost_usd }));
  if (deletedRow) {
    costByAgent.push({ agent_id: null, agent_name: null, runs: deletedRow.runs, total_cost_usd: deletedRow.total_cost_usd });
  }
  const costByModel: CostByModel[] = sortedModels(total).map(([model, m]) => ({
    model,
    runs: m.runs,
    total_cost_usd: m.priced > 0 ? m.costSum : null,
  }));

  return {
    window: windowOf(w),
    small_sample_threshold: SMALL_SAMPLE_THRESHOLD,
    cost_basis: 'estimate',
    billing_reconciliation: 'not_connected',
    totals: totalsOf(metrics(total, w, days)),
    most_active: mostActive(rows),
    agents: rows,
    deleted_agents: deletedRow,
    cost_by_agent: costByAgent,
    cost_by_model: costByModel,
  };
}
