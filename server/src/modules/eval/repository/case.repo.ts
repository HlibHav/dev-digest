import { and, asc, eq, sql } from 'drizzle-orm';
import type { EvalCaseMeta, EvalCaseSource, EvalExpectation } from '@devdigest/shared';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { EvalCaseEdit, EvalCaseRecord, NewEvalCase } from '../types.js';

type CaseRow = typeof t.evalCases.$inferSelect;

export function toCaseRecord(row: CaseRow): EvalCaseRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    // The queries below only select agent-owned rows, which always carry an agent id.
    agentId: row.agentId ?? row.ownerId,
    name: row.name,
    inputDiff: row.inputDiff ?? '',
    inputMeta: (row.inputMeta ?? { title: '', body: '' }) as EvalCaseMeta,
    expectedOutput: (row.expectedOutput ?? []) as EvalExpectation[],
    notes: row.notes,
    sourceFindingId: row.sourceFindingId,
    source: (row.source ?? null) as EvalCaseSource | null,
  };
}

/** Data access for agent-owned `eval_cases` rows. */
export class CaseRepo {
  constructor(private db: Db) {}

  private agentOwned(workspaceId: string) {
    return and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent'));
  }

  async list(workspaceId: string, agentId: string): Promise<EvalCaseRecord[]> {
    const rows = await this.db
      .select()
      .from(t.evalCases)
      .where(and(this.agentOwned(workspaceId), eq(t.evalCases.agentId, agentId)))
      .orderBy(asc(t.evalCases.createdAt), asc(t.evalCases.id));
    return rows.map(toCaseRecord);
  }

  async countByAgent(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ agentId: t.evalCases.agentId, n: sql<number>`count(*)::int` })
      .from(t.evalCases)
      .where(this.agentOwned(workspaceId))
      .groupBy(t.evalCases.agentId);
    const out = new Map<string, number>();
    for (const r of rows) if (r.agentId) out.set(r.agentId, r.n);
    return out;
  }

  async get(workspaceId: string, caseId: string): Promise<EvalCaseRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(this.agentOwned(workspaceId), eq(t.evalCases.id, caseId)));
    return row ? toCaseRecord(row) : undefined;
  }

  /** Insert, or return the agent's existing case for the same finding (`created: false`). */
  async insert(input: NewEvalCase): Promise<{ record: EvalCaseRecord; created: boolean }> {
    const [row] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: input.workspaceId,
        ownerKind: 'agent',
        ownerId: input.agentId,
        agentId: input.agentId,
        name: input.name,
        inputDiff: input.inputDiff,
        inputMeta: input.inputMeta,
        expectedOutput: input.expectedOutput,
        notes: input.notes,
        sourceFindingId: input.sourceFindingId,
        source: input.source,
      })
      .onConflictDoNothing({ target: [t.evalCases.agentId, t.evalCases.sourceFindingId] })
      .returning();
    if (row) return { record: toCaseRecord(row), created: true };
    if (!input.sourceFindingId) throw new Error('eval case insert returned no row');
    const [existing] = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, input.workspaceId),
          eq(t.evalCases.agentId, input.agentId),
          eq(t.evalCases.sourceFindingId, input.sourceFindingId),
        ),
      );
    if (!existing) throw new Error('eval case conflict without an existing row');
    return { record: toCaseRecord(existing), created: false };
  }

  async update(workspaceId: string, caseId: string, edit: EvalCaseEdit): Promise<EvalCaseRecord | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set({
        name: edit.name,
        inputDiff: edit.inputDiff,
        inputMeta: edit.inputMeta,
        expectedOutput: edit.expectedOutput,
        notes: edit.notes,
      })
      .where(and(this.agentOwned(workspaceId), eq(t.evalCases.id, caseId)))
      .returning();
    return row ? toCaseRecord(row) : undefined;
  }

  async delete(workspaceId: string, caseId: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(this.agentOwned(workspaceId), eq(t.evalCases.id, caseId)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }
}
