import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullRow } from '../../db/rows.js';

/**
 * F1 — pulls data-access. Extracted for [D6] (the intent module reuses the
 * SAME refresh-from-GitHub logic `GET /pulls/:id` uses, via `PullsService`).
 * `GET /repos/:id/pulls` keeps its own inline SQL (grandfathered, per
 * `server/CLAUDE.md` Boundaries) — only the single-PR detail refresh moved.
 */
export class PullsRepository {
  constructor(private db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async getRepo(repoId: string): Promise<typeof t.repos.$inferSelect | undefined> {
    const [row] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    return row;
  }

  async getFiles(prId: string): Promise<(typeof t.prFiles.$inferSelect)[]> {
    return this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  async getCommits(prId: string): Promise<(typeof t.prCommits.$inferSelect)[]> {
    return this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
  }

  /** Replace a PR's files with the ones just fetched from GitHub. */
  async replaceFiles(
    prId: string,
    files: { path: string; additions: number; deletions: number; patch?: string | null }[],
  ): Promise<void> {
    await this.db.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
    if (files.length === 0) return;
    await this.db.insert(t.prFiles).values(
      files.map((f) => ({
        prId,
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? null,
      })),
    );
  }

  /** Replace a PR's commits with the ones just fetched from GitHub. */
  async replaceCommits(
    prId: string,
    commits: { sha: string; message: string; author: string; committed_at?: string | null }[],
  ): Promise<void> {
    await this.db.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
    if (commits.length === 0) return;
    await this.db.insert(t.prCommits).values(
      commits.map((c) => ({
        prId,
        sha: c.sha,
        message: c.message,
        author: c.author,
        committedAt: c.committed_at ? new Date(c.committed_at) : null,
      })),
    );
  }

  /** Backfill body/diff-stats from the GitHub detail fetch (same fields `GET /pulls/:id` wrote before). */
  async updateDetail(
    prId: string,
    values: { body: string | null; additions: number; deletions: number; filesCount: number },
  ): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({
        body: values.body,
        additions: values.additions,
        deletions: values.deletions,
        filesCount: values.filesCount,
      })
      .where(eq(t.pullRequests.id, prId));
  }
}
