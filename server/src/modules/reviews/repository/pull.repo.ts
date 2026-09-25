import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { Intent, IntentConfidence, IntentSource } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

export async function getPrCommits(
  db: Db,
  prId: string,
): Promise<(typeof t.prCommits.$inferSelect)[]> {
  return db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent -----------------------------------------------------------------
// Extended for the intent layer: change_type/confidence/sources are CODE-
// derived (confidence, sources) or model-produced (change_type), plus the
// cache key (input_hash) and cost/token accounting.

export interface StoredIntentRow {
  intent: string;
  inScope: string[];
  outOfScope: string[];
  changeType: string | null;
  confidence: IntentConfidence;
  sources: IntentSource[];
  model: string | null;
  headSha: string | null;
  inputHash: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  updatedAt: string | null;
}

export async function upsertIntent(db: Db, prId: string, record: StoredIntentRow): Promise<void> {
  const values = {
    prId,
    intent: record.intent,
    inScope: record.inScope,
    outOfScope: record.outOfScope,
    changeType: record.changeType,
    confidence: record.confidence,
    sources: record.sources,
    model: record.model,
    headSha: record.headSha,
    inputHash: record.inputHash,
    tokensIn: record.tokensIn,
    tokensOut: record.tokensOut,
    costUsd: record.costUsd,
    updatedAt: new Date(),
  };
  await db
    .insert(t.prIntent)
    .values(values)
    .onConflictDoUpdate({ target: t.prIntent.prId, set: values });
}

export async function getIntent(db: Db, prId: string): Promise<StoredIntentRow | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return {
    intent: row.intent,
    inScope: row.inScope,
    outOfScope: row.outOfScope,
    changeType: row.changeType,
    confidence: row.confidence as IntentConfidence,
    sources: (row.sources ?? []) as IntentSource[],
    model: row.model,
    headSha: row.headSha,
    inputHash: row.inputHash,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    costUsd: row.costUsd,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

/** Legacy shape (`Intent`) still used where only intent/scope is needed. */
export function toIntent(row: StoredIntentRow): Intent {
  return { intent: row.intent, in_scope: row.inScope, out_of_scope: row.outOfScope };
}
