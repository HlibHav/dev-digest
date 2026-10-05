import { and, asc, eq, sql } from 'drizzle-orm';
import type { ContextUsedBy } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Project-context data access: the doc paths attached to agents and skills.
 * Paths are plain strings (the doc lives in a clone, not in the database).
 * Workspace-scoped through the owning agent / skill / repo.
 */
export class ProjectContextRepository {
  constructor(private db: Db) {}

  async getRepo(
    workspaceId: string,
    repoId: string,
  ): Promise<{ id: string; clonePath: string | null } | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(and(eq(t.repos.id, repoId), eq(t.repos.workspaceId, workspaceId)))
      .limit(1);
    return row;
  }

  async agentInWorkspace(workspaceId: string, agentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.id, agentId), eq(t.agents.workspaceId, workspaceId)))
      .limit(1);
    return !!row;
  }

  async skillInWorkspace(workspaceId: string, skillId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.id, skillId), eq(t.skills.workspaceId, workspaceId)))
      .limit(1);
    return !!row;
  }

  async agentPaths(agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agentId))
      .orderBy(asc(t.agentContextDocs.order));
    return rows.map((r) => r.path);
  }

  async setAgentPaths(agentId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agentId));
      if (paths.length === 0) return;
      await tx
        .insert(t.agentContextDocs)
        .values(paths.map((path, order) => ({ agentId, path, order })));
    });
  }

  async skillPaths(skillId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skillId))
      .orderBy(asc(t.skillContextDocs.order));
    return rows.map((r) => r.path);
  }

  async setSkillPaths(skillId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skillId));
      if (paths.length === 0) return;
      await tx
        .insert(t.skillContextDocs)
        .values(paths.map((path, order) => ({ skillId, path, order })));
    });
  }

  /**
   * Docs of the skills an agent runs with: same predicates as
   * `AgentsRepository.enabledSkillsForAgent`. Skills with no docs are omitted.
   */
  async enabledSkillDocs(
    workspaceId: string,
    agentId: string,
  ): Promise<{ skillId: string; skillName: string; paths: string[] }[]> {
    const rows = await this.db
      .select({
        skillId: t.skills.id,
        skillName: t.skills.name,
        path: t.skillContextDocs.path,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .innerJoin(t.skillContextDocs, eq(t.skillContextDocs.skillId, t.skills.id))
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.skills.enabled, true),
          eq(t.agents.workspaceId, workspaceId),
          eq(t.skills.workspaceId, workspaceId),
        ),
      )
      .orderBy(asc(t.agentSkills.order), asc(t.skillContextDocs.order));
    const bySkill = new Map<string, { skillId: string; skillName: string; paths: string[] }>();
    for (const r of rows) {
      const entry = bySkill.get(r.skillId) ?? { skillId: r.skillId, skillName: r.skillName, paths: [] };
      entry.paths.push(r.path);
      bySkill.set(r.skillId, entry);
    }
    return [...bySkill.values()];
  }

  /** Per path: how many distinct agents and skills of the workspace attach it. */
  async usedByCounts(workspaceId: string): Promise<Map<string, ContextUsedBy>> {
    const agentRows = await this.db
      .select({
        path: t.agentContextDocs.path,
        n: sql<number>`count(distinct ${t.agentContextDocs.agentId})`,
      })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agentContextDocs.agentId, t.agents.id))
      .where(eq(t.agents.workspaceId, workspaceId))
      .groupBy(t.agentContextDocs.path);
    const skillRows = await this.db
      .select({
        path: t.skillContextDocs.path,
        n: sql<number>`count(distinct ${t.skillContextDocs.skillId})`,
      })
      .from(t.skillContextDocs)
      .innerJoin(t.skills, eq(t.skillContextDocs.skillId, t.skills.id))
      .where(eq(t.skills.workspaceId, workspaceId))
      .groupBy(t.skillContextDocs.path);
    const out = new Map<string, ContextUsedBy>();
    for (const r of agentRows) out.set(r.path, { agents: Number(r.n), skills: 0 });
    for (const r of skillRows) {
      const cur = out.get(r.path) ?? { agents: 0, skills: 0 };
      out.set(r.path, { ...cur, skills: Number(r.n) });
    }
    return out;
  }
}
