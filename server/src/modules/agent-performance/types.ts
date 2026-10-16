import type { StatsPeriod } from '@devdigest/shared';

/** A resolved period. `start`/`end` are instants; inclusivity drives the SQL predicate. */
export type WindowBounds = {
  period: StatsPeriod;
  start: Date;
  end: Date;
  startInclusive: boolean;
  endInclusive: boolean;
};

/** Runs grouped by (agent, run model, status). Sums cover rows whose value is recorded. */
export type RunGroupRow = {
  agentId: string | null;
  model: string | null;
  status: string | null;
  runs: number;
  costSum: number | null;
  /** runs with a recorded cost */
  priced: number;
  durationSum: number | null;
  /** runs with a recorded duration */
  durationN: number;
  lastRunAt: Date | string | null;
};

/** Findings grouped by (run agent, run model, severity), with their decision state. */
export type FindingGroupRow = {
  agentId: string | null;
  model: string | null;
  severity: string;
  accepted: number;
  dismissed: number;
  pending: number;
};

/** Runs per agent per UTC day (`YYYY-MM-DD`). */
export type TrendRow = { agentId: string | null; day: string; runs: number };

export type WorkspaceAgentRow = { id: string; name: string };

export type RawAggregate = { runs: RunGroupRow[]; findings: FindingGroupRow[]; trend: TrendRow[] };
