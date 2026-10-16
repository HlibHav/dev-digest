import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { loadConfig } from '../src/platform/config.js';
import { Container } from '../src/platform/container.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { DEMO_PR_NUMBER } from '../src/db/seed-agent-performance.js';
import { buildAgentPerformanceService } from '../src/modules/agent-performance/wiring.js';
import type { AgentPerformance } from '@devdigest/shared';

/**
 * Red-first integration suite for SPEC-2026-10-15-agent-performance AC-43,
 * AC-49 and AC-50 (docs/plans/2026-10-15-agent-performance.md, step 8).
 *
 * Relies on (plan step 8, binding): `DEMO_PR_NUMBER` from
 * `src/db/seed-agent-performance.ts`, and `seed(db)` calling
 * `seedAgentPerformanceDemo` so that the demo runs sit on that PR, placed
 * relative to the seed time. The aggregation is read through
 * `buildAgentPerformanceService` (plan step 4), so AC-43 turns green only once
 * the aggregation exists too.
 *
 * Each test starts from an emptied database (workspaces and users truncated
 * with cascade): AC-43 and AC-50 need a fresh seed, AC-49 seeds twice.
 *
 * Needs Docker; skipped by the Docker guard where there is none.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

type Db = PgFixture['handle']['db'];

async function demoPr(db: Db, workspaceId: string) {
  const [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.number, DEMO_PR_NUMBER)));
  return pr;
}

async function counts(db: Db) {
  const n = async (table: string) => {
    const rows = (await db.execute(sql`select count(*)::int as n from ${sql.identifier(table)}`)) as unknown as {
      n: number;
    }[];
    return rows[0]!.n;
  };
  return { runs: await n('agent_runs'), reviews: await n('reviews'), findings: await n('findings') };
}

d('dev seed — Agent Performance demo data', () => {
  let pg: PgFixture;
  let db: Db;

  beforeAll(async () => {
    pg = await startPg();
    db = pg.handle.db;
  }, 120_000);
  afterAll(async () => {
    await pg?.stop();
  });

  async function freshSchema() {
    // Each test starts from an empty database: drop every row the previous test seeded.
    await db.execute(sql`truncate table workspaces, users restart identity cascade`);
  }

  it('AC-43 fresh seed covers every demo case for 1 day and 30 days on its own PR', async () => {
    await freshSchema();
    const before = Date.now();
    const { workspaceId } = await seed(db);

    // the demo runs sit on a seeded PR of their own, placed relative to the seed time
    const pr = await demoPr(db, workspaceId);
    expect(pr).toBeDefined();
    const runs = await db.select().from(t.agentRuns).where(eq(t.agentRuns.workspaceId, workspaceId));
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) expect(r.prId).toBe(pr!.id);
    const newest = Math.max(...runs.map((r) => new Date(r.ranAt).getTime()));
    expect(newest).toBeGreaterThan(before - 24 * 3_600_000);
    expect(newest).toBeLessThanOrEqual(Date.now());

    // every finding of the demo data belongs to a review linked to a seeded run
    const demoReviews = await db.select().from(t.reviews).where(eq(t.reviews.prId, pr!.id));
    expect(demoReviews.length).toBeGreaterThan(0);
    const runIds = new Set(runs.map((r) => r.id));
    for (const rv of demoReviews) {
      expect(rv.runId).not.toBeNull();
      expect(runIds.has(rv.runId!)).toBe(true);
      expect(rv.model).not.toBe('seed');
    }
    const demoFindings = await db
      .select()
      .from(t.findings)
      .where(
        inArray(
          t.findings.reviewId,
          demoReviews.map((r) => r.id),
        ),
      );
    expect(demoFindings.length).toBeGreaterThan(0);

    // the run-level cases
    expect(runs.some((r) => r.status === 'failed')).toBe(true);
    expect(runs.some((r) => r.status === 'done' && r.costUsd === null)).toBe(true);
    expect(runs.some((r) => r.agentId === null)).toBe(true);
    expect(runs.some((r) => r.model === null)).toBe(true);

    const svc = buildAgentPerformanceService(new Container(config(), db));
    const coverage = (p: AgentPerformance) => ({
      liveAgentsWithRuns: p.agents.filter((a) => a.runs > 0).length,
      namedModels: p.cost_by_model.filter((m) => m.model !== null && m.runs > 0).length,
    });

    const day = await svc.dashboard(workspaceId, { period: '1d' });
    expect(coverage(day).liveAgentsWithRuns).toBeGreaterThanOrEqual(2);
    expect(coverage(day).namedModels).toBeGreaterThanOrEqual(2);

    const month = await svc.dashboard(workspaceId, { period: '30d' });
    expect(coverage(month).liveAgentsWithRuns).toBeGreaterThanOrEqual(2);
    expect(coverage(month).namedModels).toBeGreaterThanOrEqual(2);
    expect(month.totals.runs).toBe(runs.length);

    // the aggregation-level cases, in the 30-day window
    expect(month.agents.some((a) => a.decisions >= 10)).toBe(true);
    expect(month.agents.some((a) => a.decisions >= 1 && a.decisions <= 9)).toBe(true);
    expect(month.agents.some((a) => a.runs === 0)).toBe(true);
    expect(month.totals.runs_by_status.failed).toBeGreaterThanOrEqual(1);
    expect(month.totals.unpriced_runs).toBeGreaterThanOrEqual(1);
    expect(month.deleted_agents).not.toBeNull();
    expect(month.deleted_agents!.runs).toBeGreaterThanOrEqual(1);
    expect(month.cost_by_model.some((m) => m.model === null && m.runs >= 1)).toBe(true);
  });

  it('AC-49 second seed keeps counts and moves demo runs to the new seed time', async () => {
    await freshSchema();
    const { workspaceId } = await seed(db);
    const pr = await demoPr(db, workspaceId);
    expect(pr).toBeDefined();
    const first = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr!.id));
    expect(first.length).toBeGreaterThan(0);
    const countsAfterFirst = await counts(db);

    // wait for the wall clock to move before the second seed, on a readiness check rather than a fixed sleep
    const mark = Date.now();
    await vi.waitFor(() => expect(Date.now()).toBeGreaterThan(mark + 50), { timeout: 2_000, interval: 10 });

    const secondSeedAt = Date.now();
    await seed(db);
    expect(await counts(db)).toEqual(countsAfterFirst);

    const second = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr!.id));
    expect(second.map((r) => r.id).sort()).toEqual(first.map((r) => r.id).sort());
    const firstAt = new Map(first.map((r) => [r.id, new Date(r.ranAt).getTime()]));
    for (const r of second) {
      // each demo run moved forward by at least the time between the two seeds
      expect(new Date(r.ranAt).getTime()).toBeGreaterThan(firstAt.get(r.id)!);
    }
    const newest = Math.max(...second.map((r) => new Date(r.ranAt).getTime()));
    expect(newest).toBeGreaterThan(secondSeedAt - 24 * 3_600_000);
    expect(newest).toBeLessThanOrEqual(Date.now());
  });

  it('AC-50 seed makes no provider call', async () => {
    await freshSchema();
    // seed(db) takes no provider; every LLM provider SDK reaches its API through fetch.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const { workspaceId } = await seed(db);
      expect(fetchSpy).not.toHaveBeenCalled();
      // the demo block did run in this seed
      const pr = await demoPr(db, workspaceId);
      expect(pr).toBeDefined();
      const runs = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr!.id));
      expect(runs.length).toBeGreaterThan(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
