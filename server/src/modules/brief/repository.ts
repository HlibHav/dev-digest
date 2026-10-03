import { asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Data access for `pr_brief(pr_id pk, json jsonb)`. The document is handed back
 * raw: the route's response schema is the contract check (a malformed row
 * becomes a 500, never a repaired brief), so nothing here parses it.
 */
export class BriefRepository {
  constructor(private db: Db) {}

  async get(prId: string): Promise<unknown | undefined> {
    const [row] = await this.db.select({ json: t.prBrief.json }).from(t.prBrief).where(eq(t.prBrief.prId, prId));
    return row?.json;
  }

  async save(prId: string, json: unknown): Promise<void> {
    await this.db.insert(t.prBrief).values({ prId, json }).onConflictDoUpdate({ target: t.prBrief.prId, set: { json } });
  }

  /** The workspace's agents in a stable order: oldest first, id as the tie-break (AC-16). */
  async agentIdsInOrder(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(asc(t.agents.createdAt), asc(t.agents.id));
    return rows.map((r) => r.id);
  }
}
