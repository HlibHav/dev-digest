import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { OnboardingTour } from '@devdigest/shared';

/**
 * Onboarding data-access. Owns the `onboarding` table (one row per repo, the
 * whole tour as jsonb) and the workspace-scoped repo lookup the service needs.
 */

export interface OnboardingRepoRow {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  clonePath: string | null;
}

/** Postgres foreign_key_violation. drizzle may wrap the driver error in `cause`. */
function isForeignKeyViolation(err: unknown): boolean {
  const code = (e: unknown) => (e as { code?: unknown } | null)?.code;
  return code(err) === '23503' || code((err as { cause?: unknown } | null)?.cause) === '23503';
}

export class OnboardingRepository {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<OnboardingRepoRow | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        defaultBranch: t.repos.defaultBranch,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.id, repoId), eq(t.repos.workspaceId, workspaceId)));
    return row;
  }

  /** The stored jsonb as-is: the caller parses it, so an old-format row reads as "no tour". */
  async readTour(repoId: string): Promise<unknown | undefined> {
    const [row] = await this.db
      .select({ json: t.onboarding.json })
      .from(t.onboarding)
      .where(eq(t.onboarding.repoId, repoId));
    return row?.json;
  }

  /** Upsert on `repo_id`. A repo deleted while the model was thinking returns `'repo_gone'`. */
  async saveTour(repoId: string, tour: OnboardingTour, generatedAt: Date): Promise<'saved' | 'repo_gone'> {
    try {
      await this.db
        .insert(t.onboarding)
        .values({ repoId, json: tour, generatedAt })
        .onConflictDoUpdate({ target: t.onboarding.repoId, set: { json: tour, generatedAt } });
      return 'saved';
    } catch (err) {
      if (isForeignKeyViolation(err)) return 'repo_gone';
      throw err;
    }
  }
}
