import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { EvalDroppedFinding, Finding } from '@devdigest/shared';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { CaseRunFinish, CaseRunRecord } from '../types.js';
import { FOREIGN_KEY_VIOLATION, pgCode } from './pg-error.js';

type RunRow = typeof t.evalRuns.$inferSelect;

const runColumns = {
  run: t.evalRuns,
  caseName: t.evalCases.name,
};

function toRecord(row: RunRow, caseName: string): CaseRunRecord {
  const out = (row.actualOutput ?? {}) as { grounded?: Finding[]; dropped?: EvalDroppedFinding[] };
  return {
    id: row.id,
    caseId: row.caseId,
    caseName,
    suiteRunId: row.suiteRunId,
    ranAt: row.ranAt,
    status: row.status,
    error: row.error,
    grounded: out.grounded ?? [],
    dropped: out.dropped ?? [],
    matchedMustFind: row.matchedMustFind,
    mustFindTotal: row.mustFindTotal,
    noiseCount: row.noiseCount,
    recall: row.recall,
    precision: row.precision,
    citationAccuracy: row.citationAccuracy,
    durationMs: row.durationMs,
    costUsd: row.costUsd,
  };
}

/** Data access for `eval_runs` (one scored case run, inside a suite or alone). */
export class CaseRunRepo {
  constructor(private db: Db) {}

  /** The newest finished result per case. */
  async lastResults(caseIds: string[]): Promise<Map<string, CaseRunRecord>> {
    const out = new Map<string, CaseRunRecord>();
    if (caseIds.length === 0) return out;
    const rows = await this.db
      .selectDistinctOn([t.evalRuns.caseId], runColumns)
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalCases.id, t.evalRuns.caseId))
      .where(and(inArray(t.evalRuns.caseId, caseIds), sql`${t.evalRuns.status} <> 'running'`))
      .orderBy(t.evalRuns.caseId, desc(t.evalRuns.ranAt));
    for (const r of rows) out.set(r.run.caseId, toRecord(r.run, r.caseName));
    return out;
  }

  /** Start a running row. `undefined` when the case was deleted meanwhile. */
  async insert(caseId: string, suiteRunId: string | null): Promise<CaseRunRecord | undefined> {
    try {
      const [row] = await this.db.insert(t.evalRuns).values({ caseId, suiteRunId }).returning();
      if (!row) return undefined;
      const [c] = await this.db.select({ name: t.evalCases.name }).from(t.evalCases).where(eq(t.evalCases.id, caseId));
      return toRecord(row, c?.name ?? '');
    } catch (err) {
      if (pgCode(err) === FOREIGN_KEY_VIOLATION) return undefined;
      throw err;
    }
  }

  async finish(id: string, f: CaseRunFinish): Promise<boolean> {
    const rows = await this.db
      .update(t.evalRuns)
      .set({
        status: f.status,
        error: f.error,
        actualOutput: { grounded: f.grounded, dropped: f.dropped },
        pass: f.status === 'passed',
        matchedMustFind: f.matchedMustFind,
        mustFindTotal: f.mustFindTotal,
        noiseCount: f.noiseCount,
        recall: f.recall,
        precision: f.precision,
        citationAccuracy: f.citationAccuracy,
        durationMs: f.durationMs,
        costUsd: f.costUsd,
      })
      .where(eq(t.evalRuns.id, id))
      .returning({ id: t.evalRuns.id });
    return rows.length > 0;
  }

  async get(workspaceId: string, id: string): Promise<CaseRunRecord | undefined> {
    const [row] = await this.db
      .select(runColumns)
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalCases.id, t.evalRuns.caseId))
      .where(and(eq(t.evalRuns.id, id), eq(t.evalCases.workspaceId, workspaceId)));
    return row ? toRecord(row.run, row.caseName) : undefined;
  }

  async forSuite(suiteRunId: string): Promise<CaseRunRecord[]> {
    const rows = await this.db
      .select(runColumns)
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalCases.id, t.evalRuns.caseId))
      .where(eq(t.evalRuns.suiteRunId, suiteRunId))
      .orderBy(t.evalRuns.ranAt, t.evalRuns.id);
    return rows.map((r) => toRecord(r.run, r.caseName));
  }

  async reapRunning(reason: string): Promise<number> {
    const rows = await this.db
      .update(t.evalRuns)
      .set({ status: 'errored', error: reason })
      .where(eq(t.evalRuns.status, 'running'))
      .returning({ id: t.evalRuns.id });
    return rows.length;
  }
}
