import { and, asc, eq, gt, gte, lt, lte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { RawAggregate, WindowBounds, WorkspaceAgentRow } from './types.js';

/**
 * Read-only data access for Agent Performance. Every query is scoped to one
 * workspace, and the window comes in as bound parameters (no `now()` in SQL),
 * so the service's clock port is the only clock.
 */
export class AgentPerformanceRepository {
  constructor(private db: Db) {}

  async workspaceAgents(ws: string): Promise<WorkspaceAgentRow[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, ws))
      .orderBy(asc(t.agents.name));
  }

  async agentInWorkspace(ws: string, agentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.id, agentId), eq(t.agents.workspaceId, ws)))
      .limit(1);
    return row !== undefined;
  }

  /** Runs, decided findings and the daily trend of one workspace's window, grouped for `buildPerformance`. */
  async aggregate(ws: string, w: WindowBounds): Promise<RawAggregate> {
    const r = t.agentRuns;
    const inScope = and(
      eq(r.workspaceId, ws),
      w.startInclusive ? gte(r.ranAt, w.start) : gt(r.ranAt, w.start),
      w.endInclusive ? lte(r.ranAt, w.end) : lt(r.ranAt, w.end),
    );
    const day = sql<string>`to_char(${r.ranAt} at time zone 'UTC', 'YYYY-MM-DD')`;

    const [runs, findings, trend] = await Promise.all([
      this.db
        .select({
          agentId: r.agentId,
          model: r.model,
          status: r.status,
          runs: sql<number>`count(*)::int`,
          costSum: sql<number | null>`sum(${r.costUsd})::float8`,
          priced: sql<number>`count(${r.costUsd})::int`,
          durationSum: sql<number | null>`sum(${r.durationMs})::float8`,
          durationN: sql<number>`count(${r.durationMs})::int`,
          lastRunAt: sql<Date | string | null>`max(${r.ranAt})`.mapWith(r.ranAt),
        })
        .from(r)
        .where(inScope)
        .groupBy(r.agentId, r.model, r.status),
      this.db
        .select({
          agentId: r.agentId,
          model: r.model,
          severity: t.findings.severity,
          accepted: sql<number>`(count(*) filter (where ${t.findings.acceptedAt} is not null))::int`,
          dismissed: sql<number>`(count(*) filter (where ${t.findings.dismissedAt} is not null and ${t.findings.acceptedAt} is null))::int`,
          pending: sql<number>`(count(*) filter (where ${t.findings.dismissedAt} is null and ${t.findings.acceptedAt} is null))::int`,
        })
        .from(t.findings)
        .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
        .innerJoin(r, and(eq(t.reviews.runId, r.id), eq(t.reviews.workspaceId, ws)))
        .where(inScope)
        .groupBy(r.agentId, r.model, t.findings.severity),
      this.db
        .select({ agentId: r.agentId, day, runs: sql<number>`count(*)::int` })
        .from(r)
        .where(inScope)
        .groupBy(r.agentId, day),
    ]);

    return { runs, findings, trend };
  }
}
