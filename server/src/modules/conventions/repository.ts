import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionStatus } from '@devdigest/shared';
import { CONVENTIONS_JOB_KIND } from './constants.js';
import type { ConventionRow, VerifiedCandidate } from './helpers.js';

/**
 * Conventions data-access. Owns the `conventions` table and reads the latest
 * extract job for a repo out of `jobs` (the scan has no table of its own —
 * JobRunner already records status, error and timing).
 *
 * Workspace-scoped throughout: `PATCH /conventions/:id` carries no repo in its
 * path, so the workspace predicate on every write is the only thing keeping one
 * tenant from editing another's candidate.
 */

export interface ScanRow {
  jobId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  error: string | null;
  finishedAt: Date | null;
}

const COLUMNS = {
  id: t.conventions.id,
  category: t.conventions.category,
  rule: t.conventions.rule,
  evidencePath: t.conventions.evidencePath,
  evidenceLine: t.conventions.evidenceLine,
  evidenceSnippet: t.conventions.evidenceSnippet,
  confidence: t.conventions.confidence,
  status: t.conventions.status,
};

export class ConventionsRepository {
  constructor(private db: Db) {}

  async listForRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select(COLUMNS)
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence), desc(t.conventions.createdAt));
  }

  async listByStatus(
    workspaceId: string,
    repoId: string,
    status: ConventionStatus,
  ): Promise<ConventionRow[]> {
    return this.db
      .select(COLUMNS)
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, status),
        ),
      )
      .orderBy(desc(t.conventions.confidence));
  }

  /**
   * Clear the candidates a re-scan is allowed to replace.
   *
   * Only `pending` rows. Accepted and rejected rows are the user's decisions:
   * wiping them would resurrect a rejected rule on the next scan, which is
   * exactly what the feature promises not to do.
   */
  async deletePending(workspaceId: string, repoId: string): Promise<number> {
    const rows = await this.db
      .delete(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'pending'),
        ),
      )
      .returning({ id: t.conventions.id });
    return rows.length;
  }

  /**
   * Write this scan's candidates.
   *
   * `onConflictDoNothing` on (repo_id, rule_hash): a rule the user already
   * accepted or rejected survives a re-scan that re-derives it, because the
   * decided row is still there and this insert simply yields to it.
   */
  async insertCandidates(
    workspaceId: string,
    repoId: string,
    scanId: string,
    candidates: readonly VerifiedCandidate[],
  ): Promise<number> {
    if (candidates.length === 0) return 0;
    const rows = await this.db
      .insert(t.conventions)
      .values(
        candidates.map((c) => ({
          workspaceId,
          repoId,
          scanId,
          category: c.category,
          rule: c.rule,
          evidencePath: c.evidencePath,
          evidenceLine: c.evidenceLine,
          evidenceSnippet: c.evidenceSnippet,
          confidence: c.confidence,
          ruleHash: c.ruleHash,
          status: 'pending' as const,
        })),
      )
      .onConflictDoNothing({
        target: [t.conventions.repoId, t.conventions.ruleHash],
      })
      .returning({ id: t.conventions.id });
    return rows.length;
  }

  async update(
    workspaceId: string,
    id: string,
    patch: { status?: ConventionStatus; rule?: string; category?: string; ruleHash?: string },
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.ruleHash !== undefined ? { ruleHash: patch.ruleHash } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning(COLUMNS);
    return row;
  }

  /** Mark a job as having finished cleanly, clearing any error text. */
  async clearJobError(jobId: string): Promise<void> {
    await this.db.update(t.jobs).set({ error: null }).where(eq(t.jobs.id, jobId));
  }

  /** Has this scan already written rows? Guards against a retried job paying twice. */
  async countForScan(scanId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.conventions)
      .where(eq(t.conventions.scanId, scanId));
    return row?.n ?? 0;
  }

  /**
   * Fail any scan left mid-flight by a previous process.
   *
   * JobRunner is in-memory and the app assumes one API instance per database
   * (`app.ts`), so a `queued`/`running` extract job at boot has no worker and
   * never will. Without this the page polls "Scanning…" forever. Mirrors
   * `reapStaleRunningRuns` for review runs.
   */
  async reapStaleScans(): Promise<number> {
    const rows = await this.db
      .update(t.jobs)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        error: 'Interrupted — the API restarted while this scan was running.',
      })
      .where(
        and(
          eq(t.jobs.kind, CONVENTIONS_JOB_KIND),
          inArray(t.jobs.status, ['queued', 'running']),
        ),
      )
      .returning({ id: t.jobs.id });
    return rows.length;
  }

  /** Latest extract job for this repo — the UI's "Scanning…" state. */
  async latestScan(workspaceId: string, repoId: string): Promise<ScanRow | undefined> {
    const [row] = await this.db
      .select({
        jobId: t.jobs.id,
        status: t.jobs.status,
        error: t.jobs.error,
        finishedAt: t.jobs.finishedAt,
      })
      .from(t.jobs)
      .where(
        and(
          eq(t.jobs.workspaceId, workspaceId),
          eq(t.jobs.kind, CONVENTIONS_JOB_KIND),
          sql`${t.jobs.payload}->>'repoId' = ${repoId}`,
        ),
      )
      .orderBy(desc(t.jobs.scheduledAt))
      .limit(1);
    if (!row) return undefined;
    // The handler catches its own failure so JobRunner won't retry a paid model
    // call — but that also means JobRunner sees the handler RESOLVE and stamps
    // `done` over it. The error text is the truthful signal, so a row that
    // carries one is reported as failed whatever the status column says.
    const status = row.error ? 'failed' : row.status;
    return { ...row, status } as ScanRow;
  }
}
