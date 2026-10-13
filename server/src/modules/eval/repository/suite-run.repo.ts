import { and, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import type { EvalAgentSnapshot, EvalScoredCase } from '@devdigest/shared';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { NewSuiteRun, SuiteFinish, SuiteRunRecord } from '../types.js';
import { UNIQUE_VIOLATION, pgCode } from './pg-error.js';

type SuiteRow = typeof t.evalSuiteRuns.$inferSelect;
type SuiteListRow = Omit<SuiteRow, 'snapshot'>;

/** Every column except the (large) `snapshot`; list queries select exactly these. */
const { snapshot: _snapshot, ...listColumns } = getTableColumns(t.evalSuiteRuns);

function toRecord(row: SuiteListRow & { snapshot?: unknown }): SuiteRunRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agentId: row.agentId,
    runNumber: row.runNumber,
    agentVersion: row.agentVersion,
    status: row.status,
    error: row.error,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    casesTotal: row.casesTotal,
    casesDone: row.casesDone,
    casesPassed: row.casesPassed,
    casesErrored: row.casesErrored,
    recall: row.recall,
    precision: row.precision,
    citationAccuracy: row.citationAccuracy,
    costUsd: row.costUsd,
    costPartial: row.costPartial,
    durationMs: row.durationMs,
    scoredCases: (row.scoredCases ?? []) as EvalScoredCase[],
    snapshot: (row.snapshot ?? null) as EvalAgentSnapshot | null,
  };
}

/** Data access for `eval_suite_runs`. */
export class SuiteRunRepo {
  constructor(private db: Db) {}

  /** Next per-agent number is computed in the insert statement; either unique index maps to `already_running`. */
  async insert(input: NewSuiteRun): Promise<SuiteRunRecord | 'already_running'> {
    const nextNumber = sql<number>`(select coalesce(max(${t.evalSuiteRuns.runNumber}), 0) + 1 from ${t.evalSuiteRuns} where ${t.evalSuiteRuns.agentId} = ${input.agentId})`;
    try {
      const [row] = await this.db
        .insert(t.evalSuiteRuns)
        .values({
          workspaceId: input.workspaceId,
          agentId: input.agentId,
          runNumber: nextNumber,
          agentVersion: input.agentVersion,
          casesTotal: input.casesTotal,
          snapshot: input.snapshot,
        })
        .returning();
      if (!row) throw new Error('eval suite insert returned no row');
      return toRecord(row);
    } catch (err) {
      if (pgCode(err) === UNIQUE_VIOLATION) return 'already_running';
      throw err;
    }
  }

  async agentsWithRunning(workspaceId: string): Promise<Set<string>> {
    const rows = await this.db
      .selectDistinct({ agentId: t.evalSuiteRuns.agentId })
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.status, 'running')));
    return new Set(rows.map((r) => r.agentId));
  }

  async get(workspaceId: string, id: string): Promise<SuiteRunRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.id, id)));
    return row ? toRecord(row) : undefined;
  }

  async list(workspaceId: string, agentId: string): Promise<SuiteRunRecord[]> {
    const rows = await this.db
      .select(listColumns)
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.agentId, agentId)))
      .orderBy(desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.runNumber));
    return rows.map(toRecord);
  }

  async recent(workspaceId: string, limit: number): Promise<(SuiteRunRecord & { agentName: string })[]> {
    const rows = await this.db
      .select({ run: listColumns, agentName: t.agents.name })
      .from(t.evalSuiteRuns)
      .innerJoin(t.agents, eq(t.agents.id, t.evalSuiteRuns.agentId))
      .where(eq(t.evalSuiteRuns.workspaceId, workspaceId))
      .orderBy(desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.runNumber))
      .limit(limit);
    return rows.map((r) => ({ ...toRecord(r.run), agentName: r.agentName }));
  }

  async updateProgress(id: string, casesDone: number): Promise<boolean> {
    const rows = await this.db
      .update(t.evalSuiteRuns)
      .set({ casesDone })
      .where(eq(t.evalSuiteRuns.id, id))
      .returning({ id: t.evalSuiteRuns.id });
    return rows.length > 0;
  }

  async finish(id: string, f: SuiteFinish): Promise<boolean> {
    const rows = await this.db
      .update(t.evalSuiteRuns)
      .set({
        status: f.status,
        error: f.error,
        finishedAt: new Date(),
        casesPassed: f.casesPassed,
        casesErrored: f.casesErrored,
        recall: f.recall,
        precision: f.precision,
        citationAccuracy: f.citationAccuracy,
        costUsd: f.costUsd,
        costPartial: f.costPartial,
        durationMs: f.durationMs,
        scoredCases: f.scoredCases,
      })
      .where(eq(t.evalSuiteRuns.id, id))
      .returning({ id: t.evalSuiteRuns.id });
    return rows.length > 0;
  }

  async reapRunning(reason: string): Promise<number> {
    const rows = await this.db
      .update(t.evalSuiteRuns)
      .set({ status: 'failed', error: reason, finishedAt: new Date() })
      .where(eq(t.evalSuiteRuns.status, 'running'))
      .returning({ id: t.evalSuiteRuns.id });
    return rows.length;
  }
}
