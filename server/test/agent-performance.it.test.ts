import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { Container } from '../src/platform/container.js';
import * as t from '../src/db/schema.js';
import {
  MockAuthProvider,
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockLLMProvider,
} from '../src/adapters/mocks.js';
import { buildAgentPerformanceService } from '../src/modules/agent-performance/wiring.js';
import type { AgentPerformance, AgentStats } from '@devdigest/shared';

/**
 * Red-first integration suite for SPEC-2026-10-15-agent-performance,
 * AC-1 … AC-23 (docs/plans/2026-10-15-agent-performance.md, "## Red-first").
 *
 * Wiring this file relies on (plan steps 3–4, binding):
 *  - `buildAgentPerformanceService(container, { now })` from
 *    `src/modules/agent-performance/wiring.ts`, with `.dashboard(ws, query)` and
 *    `.agentStats(ws, agentId, query)`;
 *  - routes `GET /agent-performance` and `GET /agents/:id/stats`, a bad period
 *    answering 400 with a body whose only key is `error`, an unknown agent 404.
 *
 * Time: the service tests pin the clock through the `now` port. No fake timers
 * (they break postgres-js, server/test/onboarding-service.it.test.ts:35-37) and
 * no `seed()` call, so the demo data can never move these numbers. Every test
 * builds its own workspace.
 *
 * Needs Docker; skipped by the Docker guard where there is none.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const NOW = new Date('2026-10-15T12:00:00.000Z');
const HOUR = 3_600_000;
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * HOUR);
const at = (iso: string) => new Date(iso);

type Db = PgFixture['handle']['db'];

d('Agent Performance — aggregation and routes', () => {
  let pg: PgFixture;
  let db: Db;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    db = pg.handle.db;
  }, 120_000);
  afterAll(async () => {
    await pg?.stop();
  });

  // ---------- fixture helpers (local to this file) ----------

  interface Ws {
    id: string;
    userId: string;
    prId: string;
  }

  async function makeWorkspace(): Promise<Ws> {
    const n = seq++;
    const [ws] = await db.insert(t.workspaces).values({ name: `ap-ws-${n}-${randomUUID().slice(0, 6)}` }).returning();
    const [user] = await db
      .insert(t.users)
      .values({ email: `ap-${n}-${randomUUID().slice(0, 6)}@local`, name: `User ${n}` })
      .returning();
    await db.insert(t.workspaceMembers).values({ workspaceId: ws!.id, userId: user!.id, role: 'owner' });
    const name = `ap-repo-${n}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name, fullName: `acme/${name}`, clonePath: `/mock/clone/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws!.id,
        repoId: repo!.id,
        number: 100 + n,
        title: `PR ${n}`,
        author: 'octo',
        branch: `feat/${n}`,
        base: 'main',
        headSha: `sha${n}`,
      })
      .returning();
    return { id: ws!.id, userId: user!.id, prId: pr!.id };
  }

  async function addAgent(ws: Ws, name: string, enabled = true): Promise<string> {
    const [a] = await db
      .insert(t.agents)
      .values({ workspaceId: ws.id, name, provider: 'openai', model: 'gpt-4.1', systemPrompt: 'x', enabled })
      .returning();
    return a!.id;
  }

  interface RunSpec {
    agentId: string | null;
    ranAt: Date;
    status?: string | null;
    model?: string | null;
    costUsd?: number | null;
    durationMs?: number | null;
  }

  async function addRun(ws: Ws, r: RunSpec): Promise<string> {
    const [run] = await db
      .insert(t.agentRuns)
      .values({
        workspaceId: ws.id,
        agentId: r.agentId,
        prId: ws.prId,
        ranAt: r.ranAt,
        status: r.status === undefined ? 'done' : r.status,
        model: r.model === undefined ? 'model-a' : r.model,
        costUsd: r.costUsd ?? null,
        durationMs: r.durationMs ?? null,
      })
      .returning();
    return run!.id;
  }

  /** A review linked to `runId` (or to no run when null) carrying the given decisions. */
  async function addDecisions(
    ws: Ws,
    runId: string | null,
    agentId: string | null,
    f: { accepted?: number; dismissed?: number; pending?: number; severity?: string; decidedAt?: Date },
  ): Promise<string> {
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId: ws.id, prId: ws.prId, agentId, runId, kind: 'review', model: 'model-a' })
      .returning();
    const decided = f.decidedAt ?? hoursAgo(1);
    const rows: (typeof t.findings.$inferInsert)[] = [];
    const base = {
      reviewId: review!.id,
      file: 'src/a.ts',
      startLine: 1,
      endLine: 2,
      severity: f.severity ?? 'WARNING',
      category: 'bug',
      title: 'finding',
      rationale: 'because',
      confidence: 0.9,
    };
    for (let i = 0; i < (f.accepted ?? 0); i++) rows.push({ ...base, acceptedAt: decided });
    for (let i = 0; i < (f.dismissed ?? 0); i++) rows.push({ ...base, dismissedAt: decided });
    for (let i = 0; i < (f.pending ?? 0); i++) rows.push({ ...base });
    if (rows.length > 0) await db.insert(t.findings).values(rows);
    return review!.id;
  }

  function service(now: Date = NOW) {
    return buildAgentPerformanceService(new Container(config(), db), { now: () => now });
  }

  function row(p: AgentPerformance, agentId: string): AgentStats {
    const r = p.agents.find((a) => a.agent_id === agentId);
    if (!r) throw new Error(`no row for agent ${agentId}`);
    return r;
  }

  async function makeApp(ws: Ws, llm = new MockLLMProvider()) {
    const app = await buildApp({
      config: config(),
      db,
      overrides: {
        auth: new MockAuthProvider({ id: ws.userId, email: 'ap@local', name: 'AP' }, { id: ws.id, name: 'ap' }),
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        embedder: new MockEmbedder(),
        llm: { openai: llm, anthropic: llm, openrouter: llm },
      },
    });
    return { app, llm };
  }

  function utcDate(dt: Date): string {
    return dt.toISOString().slice(0, 10);
  }

  // ---------- period windows ----------

  it('AC-1 1 day counts (now−24h, now]', async () => {
    const ws = await makeWorkspace();
    const a = await addAgent(ws, 'Window One');
    await addRun(ws, { agentId: a, ranAt: hoursAgo(25) }); // out
    await addRun(ws, { agentId: a, ranAt: hoursAgo(24) }); // out: start is exclusive
    await addRun(ws, { agentId: a, ranAt: new Date(hoursAgo(24).getTime() + 1) }); // in
    await addRun(ws, { agentId: a, ranAt: NOW }); // in: end is inclusive
    await addRun(ws, { agentId: a, ranAt: new Date(NOW.getTime() + 1) }); // out: after the request instant

    const p = await service().dashboard(ws.id, { period: '1d' });
    expect(p.totals.runs).toBe(2);
    expect(row(p, a).runs).toBe(2);
  });

  it('AC-2 30 days counts (now−720h, now]', async () => {
    const ws = await makeWorkspace();
    const a = await addAgent(ws, 'Window Thirty');
    await addRun(ws, { agentId: a, ranAt: hoursAgo(721) }); // out
    await addRun(ws, { agentId: a, ranAt: hoursAgo(720) }); // out: start is exclusive
    await addRun(ws, { agentId: a, ranAt: new Date(hoursAgo(720).getTime() + 1) }); // in
    await addRun(ws, { agentId: a, ranAt: hoursAgo(300) }); // in
    await addRun(ws, { agentId: a, ranAt: NOW }); // in
    await addRun(ws, { agentId: a, ranAt: new Date(NOW.getTime() + 1) }); // out

    const p = await service().dashboard(ws.id, { period: '30d' });
    expect(p.totals.runs).toBe(3);
    expect(row(p, a).runs).toBe(3);
  });

  it('AC-3 custom range counts [from 00:00Z, to+1 00:00Z)', async () => {
    const ws = await makeWorkspace();
    const a = await addAgent(ws, 'Window Custom');
    await addRun(ws, { agentId: a, ranAt: at('2026-09-30T23:59:59.999Z') }); // out
    await addRun(ws, { agentId: a, ranAt: at('2026-10-01T00:00:00.000Z') }); // in
    await addRun(ws, { agentId: a, ranAt: at('2026-10-04T10:00:00.000Z') }); // in
    await addRun(ws, { agentId: a, ranAt: at('2026-10-07T23:59:59.999Z') }); // in
    await addRun(ws, { agentId: a, ranAt: at('2026-10-08T00:00:00.000Z') }); // out

    const p = await service().dashboard(ws.id, { period: 'custom', from: '2026-10-01', to: '2026-10-07' });
    expect(p.totals.runs).toBe(3);
    expect(row(p, a).runs).toBe(3);
  });

  it('AC-4 malformed, incomplete, inverted, future or over-366-day ranges answer 400 with no aggregate', async () => {
    const ws = await makeWorkspace();
    const a = await addAgent(ws, 'Validation Agent');
    const { app } = await makeApp(ws);
    try {
      const bad = [
        'period=custom&from=2026-1-01&to=2026-10-07', // malformed
        'period=custom&from=2026-10-01', // missing to
        'period=custom&to=2026-10-07', // missing from
        'period=custom&from=2026-10-07&to=2026-10-01', // from after to
        'period=custom&from=2026-10-01&to=2999-01-01', // to after today (UTC)
        'period=custom&from=2025-01-01&to=2026-01-02', // 367 days inclusive
        'period=week', // unknown period
      ];
      for (const base of ['/agent-performance', `/agents/${a}/stats`]) {
        for (const q of bad) {
          const res = await app.inject({ method: 'GET', url: `${base}?${q}` });
          expect({ url: `${base}?${q}`, status: res.statusCode }).toEqual({ url: `${base}?${q}`, status: 400 });
          const body = res.json() as Record<string, unknown>;
          expect(Object.keys(body)).toEqual(['error']);
        }
      }
    } finally {
      await app.close();
    }
  });

  it('AC-5 every response echoes the period kind and the resolved window', async () => {
    const ws = await makeWorkspace();
    const a = await addAgent(ws, 'Echo Agent');
    await addRun(ws, { agentId: a, ranAt: hoursAgo(1) });
    const svc = service();

    const oneDay = { period: '1d', start: '2026-10-14T12:00:00.000Z', end: '2026-10-15T12:00:00.000Z' };
    const thirty = { period: '30d', start: '2026-09-15T12:00:00.000Z', end: '2026-10-15T12:00:00.000Z' };
    const custom = { period: 'custom', start: '2026-10-01T00:00:00.000Z', end: '2026-10-08T00:00:00.000Z' };

    expect((await svc.dashboard(ws.id, { period: '1d' })).window).toEqual(oneDay);
    expect((await svc.dashboard(ws.id, { period: '30d' })).window).toEqual(thirty);
    expect((await svc.dashboard(ws.id, { period: 'custom', from: '2026-10-01', to: '2026-10-07' })).window).toEqual(
      custom,
    );
    expect((await svc.agentStats(ws.id, a, { period: '1d' })).window).toEqual(oneDay);
    expect((await svc.agentStats(ws.id, a, { period: '30d' })).window).toEqual(thirty);
    expect((await svc.agentStats(ws.id, a, { period: 'custom', from: '2026-10-01', to: '2026-10-07' })).window).toEqual(
      custom,
    );
  });

  // ---------- decisions ----------

  it('AC-6 decisions follow the run time of the run behind the review; reviews with no run are left out', async () => {
    const ws = await makeWorkspace();
    const a = await addAgent(ws, 'Attribution Agent');
    const inside = await addRun(ws, { agentId: a, ranAt: hoursAgo(2) });
    // decided long before the window: still counts, because the run is inside it
    await addDecisions(ws, inside, a, { accepted: 2, dismissed: 1, decidedAt: at('2026-01-01T00:00:00.000Z') });
    const older = await addRun(ws, { agentId: a, ranAt: hoursAgo(30) });
    // decided inside the 1-day window: does not count for 1 day, because the run is outside it
    await addDecisions(ws, older, a, { accepted: 4, decidedAt: hoursAgo(1) });
    // a review linked to no run never counts
    await addDecisions(ws, null, a, { accepted: 5, dismissed: 5, decidedAt: hoursAgo(1) });

    const day = row(await service().dashboard(ws.id, { period: '1d' }), a);
    expect({ accepted: day.accepted, dismissed: day.dismissed, decisions: day.decisions }).toEqual({
      accepted: 2,
      dismissed: 1,
      decisions: 3,
    });
    const month = row(await service().dashboard(ws.id, { period: '30d' }), a);
    expect({ accepted: month.accepted, dismissed: month.dismissed, decisions: month.decisions }).toEqual({
      accepted: 6,
      dismissed: 1,
      decisions: 7,
    });
  });

  // ---------- run metrics ----------

  it('AC-7 Runs counts every status and returns the count per status', async () => {
    const ws = await makeWorkspace();
    const a = await addAgent(ws, 'Status Agent');
    for (const status of ['running', 'done', 'done', 'failed', 'cancelled']) {
      await addRun(ws, { agentId: a, ranAt: hoursAgo(3), status });
    }
    const p = await service().dashboard(ws.id, { period: '1d' });
    const byStatus = { running: 1, done: 2, failed: 1, cancelled: 1 };
    expect(p.totals.runs).toBe(5);
    expect(p.totals.runs_by_status).toEqual(byStatus);
    expect(row(p, a).runs).toBe(5);
    expect(row(p, a).runs_by_status).toEqual(byStatus);
  });

  it('AC-8 Avg duration covers done runs with a recorded duration only', async () => {
    const ws = await makeWorkspace();
    const a = await addAgent(ws, 'Duration Agent');
    await addRun(ws, { agentId: a, ranAt: hoursAgo(1), durationMs: 1000 });
    await addRun(ws, { agentId: a, ranAt: hoursAgo(2), durationMs: 3000 });
    await addRun(ws, { agentId: a, ranAt: hoursAgo(3), durationMs: null });
    await addRun(ws, { agentId: a, ranAt: hoursAgo(4), status: 'failed', durationMs: 0 });
    await addRun(ws, { agentId: a, ranAt: hoursAgo(5), status: 'cancelled', durationMs: 90000 });

    const r = row(await service().dashboard(ws.id, { period: '1d' }), a);
    expect(r.avg_latency_ms).toBe(2000);
  });

  it('AC-9 Avg cost is the summed cost of priced done runs over their number', async () => {
    const ws = await makeWorkspace();
    const a = await addAgent(ws, 'Avg Cost Agent');
    await addRun(ws, { agentId: a, ranAt: hoursAgo(1), costUsd: 0.02 });
    await addRun(ws, { agentId: a, ranAt: hoursAgo(2), costUsd: 0.04 });
    await addRun(ws, { agentId: a, ranAt: hoursAgo(3), costUsd: null });
    await addRun(ws, { agentId: a, ranAt: hoursAgo(4), status: 'failed', costUsd: 0.5 });

    const r = row(await service().dashboard(ws.id, { period: '1d' }), a);
    expect(r.avg_cost_usd).toBeCloseTo(0.03, 12);
  });

  it('AC-10 Total cost sums every recorded cost; unpriced counts done runs without one', async () => {
    const ws = await makeWorkspace();
    const a = await addAgent(ws, 'Total Cost Agent');
    await addRun(ws, { agentId: a, ranAt: hoursAgo(1), costUsd: 0.02 });
    await addRun(ws, { agentId: a, ranAt: hoursAgo(2), costUsd: 0.04 });
    await addRun(ws, { agentId: a, ranAt: hoursAgo(3), costUsd: null });
    await addRun(ws, { agentId: a, ranAt: hoursAgo(4), status: 'failed', costUsd: 0.5 });
    await addRun(ws, { agentId: a, ranAt: hoursAgo(5), status: 'failed', costUsd: null });

    const p = await service().dashboard(ws.id, { period: '1d' });
    expect(p.totals.total_cost_usd).toBeCloseTo(0.56, 12);
    expect(p.totals.unpriced_runs).toBe(1);
    expect(row(p, a).total_cost_usd).toBeCloseTo(0.56, 12);
    expect(row(p, a).unpriced_runs).toBe(1);
  });

  it('AC-11 Total cost and Avg cost are null, never 0, when no counted run is priced', async () => {
    const ws = await makeWorkspace();
    const a = await addAgent(ws, 'Unpriced Agent');
    await addRun(ws, { agentId: a, ranAt: hoursAgo(1), costUsd: null });
    await addRun(ws, { agentId: a, ranAt: hoursAgo(2), status: 'failed', costUsd: null });

    const p = await service().dashboard(ws.id, { period: '1d' });
    expect(p.totals.total_cost_usd).toBeNull();
    expect(row(p, a).total_cost_usd).toBeNull();
    expect(row(p, a).avg_cost_usd).toBeNull();
    expect(row(p, a).unpriced_runs).toBe(1);
  });

  it('AC-12 accept rate = accepted ÷ (accepted + dismissed), pending left out, null at 0 decisions', async () => {
    const ws = await makeWorkspace();
    const a = await addAgent(ws, 'Rate Agent');
    const b = await addAgent(ws, 'Pending Agent');
    const ra = await addRun(ws, { agentId: a, ranAt: hoursAgo(1) });
    await addDecisions(ws, ra, a, { accepted: 3, dismissed: 1, pending: 2 });
    const rb = await addRun(ws, { agentId: b, ranAt: hoursAgo(1) });
    await addDecisions(ws, rb, b, { pending: 4 });

    const p = await service().dashboard(ws.id, { period: '1d' });
    const ar = row(p, a);
    expect({ accepted: ar.accepted, dismissed: ar.dismissed, pending: ar.pending, decisions: ar.decisions }).toEqual({
      accepted: 3,
      dismissed: 1,
      pending: 2,
      decisions: 4,
    });
    expect(ar.accept_rate).toBeCloseTo(0.75, 12);
    const br = row(p, b);
    expect({ pending: br.pending, decisions: br.decisions, accept_rate: br.accept_rate }).toEqual({
      pending: 4,
      decisions: 0,
      accept_rate: null,
    });
  });

  it('AC-13 headline accept rate pools decisions across every row, Deleted agent included', async () => {
    const ws = await makeWorkspace();
    const a = await addAgent(ws, 'Pool A');
    const b = await addAgent(ws, 'Pool B');
    const gone = await addAgent(ws, 'Pool Gone');
    await addDecisions(ws, await addRun(ws, { agentId: a, ranAt: hoursAgo(1) }), a, { accepted: 9, dismissed: 1 });
    await addDecisions(ws, await addRun(ws, { agentId: b, ranAt: hoursAgo(1) }), b, { dismissed: 2 });
    await addDecisions(ws, await addRun(ws, { agentId: gone, ranAt: hoursAgo(1) }), gone, {
      accepted: 1,
      dismissed: 1,
    });
    await db.delete(t.agents).where(eq(t.agents.id, gone));

    const p = await service().dashboard(ws.id, { period: '1d' });
    expect(p.totals.accepted).toBe(10);
    expect(p.totals.dismissed).toBe(4);
    expect(p.totals.decisions).toBe(14);
    // pooled 10/14 ≈ 0.714, not the mean of the per-row rates (0.9 + 0 + 0.5) / 3 ≈ 0.467
    expect(p.totals.accept_rate).toBeCloseTo(10 / 14, 12);
  });

  it('AC-14 a row and the headline are small sample below 10 decisions, zero included', async () => {
    const ws = await makeWorkspace();
    const nine = await addAgent(ws, 'Nine');
    const ten = await addAgent(ws, 'Ten');
    const none = await addAgent(ws, 'None');
    await addDecisions(ws, await addRun(ws, { agentId: nine, ranAt: hoursAgo(1) }), nine, { accepted: 5, dismissed: 4 });
    await addDecisions(ws, await addRun(ws, { agentId: ten, ranAt: hoursAgo(1) }), ten, { accepted: 5, dismissed: 5 });
    await addRun(ws, { agentId: none, ranAt: hoursAgo(1) });

    const p = await service().dashboard(ws.id, { period: '1d' });
    expect(p.small_sample_threshold).toBe(10);
    expect(row(p, nine).small_sample).toBe(true);
    expect(row(p, ten).small_sample).toBe(false);
    expect(row(p, none).small_sample).toBe(true);
    expect(p.totals.decisions).toBe(19);
    expect(p.totals.small_sample).toBe(false);

    const small = await makeWorkspace();
    const s = await addAgent(small, 'Small');
    await addDecisions(small, await addRun(small, { agentId: s, ranAt: hoursAgo(1) }), s, { accepted: 9 });
    const ps = await service().dashboard(small.id, { period: '1d' });
    expect(ps.totals.small_sample).toBe(true);

    const empty = await makeWorkspace();
    await addAgent(empty, 'Idle');
    const pe = await service().dashboard(empty.id, { period: '1d' });
    expect(pe.totals.decisions).toBe(0);
    expect(pe.totals.small_sample).toBe(true);
  });

  // ---------- buckets ----------

  it('AC-15 deleted agents form one row that counts toward totals and is never Most-active', async () => {
    const ws = await makeWorkspace();
    const live = await addAgent(ws, 'Live One');
    const goneA = await addAgent(ws, 'Gone A');
    const goneB = await addAgent(ws, 'Gone B');
    await addDecisions(ws, await addRun(ws, { agentId: live, ranAt: hoursAgo(1), costUsd: 0.05 }), live, {
      accepted: 1,
    });
    for (let i = 0; i < 2; i++) await addRun(ws, { agentId: goneA, ranAt: hoursAgo(2), costUsd: 0.1 });
    const gr = await addRun(ws, { agentId: goneB, ranAt: hoursAgo(2), costUsd: 0.1 });
    await addDecisions(ws, gr, goneB, { accepted: 1, dismissed: 1 });
    await db.delete(t.agents).where(eq(t.agents.id, goneA));
    await db.delete(t.agents).where(eq(t.agents.id, goneB));

    const p = await service().dashboard(ws.id, { period: '1d' });
    expect(p.deleted_agents).not.toBeNull();
    expect(p.deleted_agents!.runs).toBe(3);
    expect(p.deleted_agents!.total_cost_usd).toBeCloseTo(0.3, 12);
    expect(p.agents.map((a) => a.agent_id)).toEqual([live]);
    expect(p.totals.runs).toBe(4);
    expect(p.totals.total_cost_usd).toBeCloseTo(0.35, 12);
    expect(p.totals.accepted).toBe(2);
    expect(p.totals.decisions).toBe(3);
    const deletedSlice = p.cost_by_agent.find((c) => c.agent_id === null);
    expect(deletedSlice).toMatchObject({ agent_id: null, runs: 3 });
    expect(deletedSlice!.total_cost_usd).toBeCloseTo(0.3, 12);
    expect(p.most_active).toMatchObject({ agent_id: live, runs: 1 });
  });

  it('AC-16 runs with no recorded model land in one Unknown model bucket', async () => {
    const ws = await makeWorkspace();
    const a = await addAgent(ws, 'Modelless');
    await addRun(ws, { agentId: a, ranAt: hoursAgo(1), model: null, costUsd: 0.01 });
    await addRun(ws, { agentId: a, ranAt: hoursAgo(2), model: null, costUsd: 0.02 });
    await addRun(ws, { agentId: a, ranAt: hoursAgo(3), model: 'model-b', costUsd: 0.04 });

    const p = await service().dashboard(ws.id, { period: '1d' });
    const unknown = p.cost_by_model.filter((m) => m.model === null);
    expect(unknown).toHaveLength(1);
    expect(unknown[0]!.runs).toBe(2);
    expect(unknown[0]!.total_cost_usd).toBeCloseTo(0.03, 12);
    const split = row(p, a).by_model.filter((m) => m.model === null);
    expect(split).toHaveLength(1);
    expect(split[0]!.runs).toBe(2);
  });

  it('AC-17 by-agent and by-model costs sum to Total cost within 1e-9 and runs to Total runs', async () => {
    const ws = await makeWorkspace();
    const a = await addAgent(ws, 'Sum A');
    const b = await addAgent(ws, 'Sum B');
    const gone = await addAgent(ws, 'Sum Gone');
    const costs = [0.1, 0.2, 0.3, 0.000123456789, null, 0.07];
    const models = ['m-1', 'm-2', null, 'm-1', 'm-2', null];
    const owners = [a, b, gone, a, b, gone];
    for (let i = 0; i < costs.length; i++) {
      await addRun(ws, { agentId: owners[i]!, ranAt: hoursAgo(i + 1), costUsd: costs[i], model: models[i] });
    }
    await addRun(ws, { agentId: a, ranAt: hoursAgo(9), status: 'failed', costUsd: 0.011, model: 'm-3' });
    await db.delete(t.agents).where(eq(t.agents.id, gone));

    const p = await service().dashboard(ws.id, { period: '1d' });
    const total = p.totals.total_cost_usd!;
    const sumCost = (xs: { total_cost_usd: number | null }[]) => xs.reduce((s, x) => s + (x.total_cost_usd ?? 0), 0);
    const sumRuns = (xs: { runs: number }[]) => xs.reduce((s, x) => s + x.runs, 0);
    expect(p.totals.runs).toBe(7);
    expect(Math.abs(sumCost(p.cost_by_agent) - total)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(sumCost(p.cost_by_model) - total)).toBeLessThanOrEqual(1e-9);
    expect(sumRuns(p.cost_by_agent)).toBe(7);
    expect(sumRuns(p.cost_by_model)).toBe(7);
  });

  it('AC-18 Most-active: most runs, then latest last run, then name A→Z; none when no existing agent ran', async () => {
    const ws = await makeWorkspace();
    const alpha = await addAgent(ws, 'Alpha');
    const charlie = await addAgent(ws, 'Charlie');
    const bravo = await addAgent(ws, 'Bravo');
    const quiet = await addAgent(ws, 'Quiet');
    // Alpha: 3 runs, last 2h ago. Bravo and Charlie: 3 runs, last 1h ago → tie on last run, Bravo by name.
    for (const h of [2, 5, 6]) await addRun(ws, { agentId: alpha, ranAt: hoursAgo(h) });
    for (const h of [1, 5, 6]) await addRun(ws, { agentId: charlie, ranAt: hoursAgo(h) });
    for (const h of [1, 7, 8]) await addRun(ws, { agentId: bravo, ranAt: hoursAgo(h) });
    await addRun(ws, { agentId: quiet, ranAt: hoursAgo(1) });

    const p = await service().dashboard(ws.id, { period: '1d' });
    expect(p.most_active).toMatchObject({ agent_id: bravo, agent_name: 'Bravo', runs: 3 });

    // Latest last run beats the name.
    const ws2 = await makeWorkspace();
    const aa = await addAgent(ws2, 'Aardvark');
    const zz = await addAgent(ws2, 'Zebra');
    for (const h of [3, 4]) await addRun(ws2, { agentId: aa, ranAt: hoursAgo(h) });
    for (const h of [1, 4]) await addRun(ws2, { agentId: zz, ranAt: hoursAgo(h) });
    expect((await service().dashboard(ws2.id, { period: '1d' })).most_active).toMatchObject({ agent_id: zz });

    // Only a deleted agent ran → none.
    const ws3 = await makeWorkspace();
    await addAgent(ws3, 'Idle Survivor');
    const gone = await addAgent(ws3, 'Busy Gone');
    for (const h of [1, 2, 3]) await addRun(ws3, { agentId: gone, ranAt: hoursAgo(h) });
    await db.delete(t.agents).where(eq(t.agents.id, gone));
    expect((await service().dashboard(ws3.id, { period: '1d' })).most_active).toBeNull();
  });

  it('AC-19 one row per workspace agent, disabled and idle agents included', async () => {
    const ws = await makeWorkspace();
    const busy = await addAgent(ws, 'Busy');
    const disabled = await addAgent(ws, 'Disabled', false);
    const idle = await addAgent(ws, 'Idle');
    await addRun(ws, { agentId: busy, ranAt: hoursAgo(1) });

    const p = await service().dashboard(ws.id, { period: '1d' });
    expect(p.agents.map((a) => a.agent_id).sort()).toEqual([busy, disabled, idle].sort());
    expect(row(p, disabled).runs).toBe(0);
    expect(row(p, idle).runs).toBe(0);
    expect(row(p, idle).last_run_at).toBeNull();
  });

  // ---------- parity ----------

  it('AC-20 dashboard row equals agentStats for every agent and period at one pinned instant', async () => {
    const ws = await makeWorkspace();
    const a = await addAgent(ws, 'Parity A');
    const b = await addAgent(ws, 'Parity B');
    const c = await addAgent(ws, 'Parity Idle', false);
    const r1 = await addRun(ws, { agentId: a, ranAt: hoursAgo(1), costUsd: 0.012, durationMs: 4000, model: 'm-1' });
    await addDecisions(ws, r1, a, { accepted: 9, dismissed: 2, pending: 1, severity: 'CRITICAL' });
    const r2 = await addRun(ws, { agentId: a, ranAt: hoursAgo(30), costUsd: null, durationMs: 2000, model: null });
    await addDecisions(ws, r2, a, { accepted: 1, pending: 1 });
    await addRun(ws, { agentId: a, ranAt: hoursAgo(50), status: 'failed', costUsd: 0.003, model: 'm-2' });
    const r3 = await addRun(ws, { agentId: b, ranAt: hoursAgo(5), costUsd: 0.02, durationMs: 9000, model: 'm-2' });
    await addDecisions(ws, r3, b, { dismissed: 1, severity: 'SUGGESTION' });
    await addRun(ws, { agentId: b, ranAt: at('2026-10-03T08:00:00.000Z'), status: 'cancelled', model: 'm-1' });

    const svc = service();
    const queries = [{ period: '1d' }, { period: '30d' }, { period: 'custom', from: '2026-10-01', to: '2026-10-14' }];
    for (const q of queries) {
      const dash = await svc.dashboard(ws.id, q);
      for (const id of [a, b, c]) {
        const stats = await svc.agentStats(ws.id, id, q);
        expect(stats).toEqual(row(dash, id));
      }
    }
  });

  it('AC-20 HTTP dashboard row equals GET /agents/:id/stats', async () => {
    const ws = await makeWorkspace();
    const a = await addAgent(ws, 'Http Parity');
    const { app } = await makeApp(ws);
    try {
      const now = new Date();
      const r = await addRun(ws, {
        agentId: a,
        ranAt: new Date(now.getTime() - HOUR),
        costUsd: 0.01,
        durationMs: 3000,
        model: 'm-1',
      });
      await addDecisions(ws, r, a, { accepted: 2, dismissed: 1, pending: 1 });
      // A custom range is resolved from dates, so both requests get the same window.
      const to = utcDate(now);
      const from = utcDate(new Date(now.getTime() - 6 * 24 * HOUR));
      const q = `period=custom&from=${from}&to=${to}`;

      const dash = await app.inject({ method: 'GET', url: `/agent-performance?${q}` });
      expect(dash.statusCode).toBe(200);
      const stats = await app.inject({ method: 'GET', url: `/agents/${a}/stats?${q}` });
      expect(stats.statusCode).toBe(200);
      const dashRow = (dash.json() as AgentPerformance).agents.find((x) => x.agent_id === a);
      expect(dashRow).toBeDefined();
      expect(stats.json()).toEqual(dashRow);
      expect((stats.json() as AgentStats).runs).toBe(1);
    } finally {
      await app.close();
    }
  });

  // ---------- scoping and side effects ----------

  it('AC-21 Stats for an agent outside the caller workspace answers 404 with no aggregate', async () => {
    const ws = await makeWorkspace();
    const mine = await addAgent(ws, 'Mine');
    const other = await makeWorkspace();
    const foreign = await addAgent(other, 'Theirs');
    await addRun(other, { agentId: foreign, ranAt: new Date() });
    const { app } = await makeApp(ws);
    try {
      // control: the route exists and answers for the caller's own agent
      const own = await app.inject({ method: 'GET', url: `/agents/${mine}/stats?period=30d` });
      expect(own.statusCode).toBe(200);
      for (const id of [foreign, randomUUID()]) {
        const res = await app.inject({ method: 'GET', url: `/agents/${id}/stats?period=30d` });
        expect(res.statusCode).toBe(404);
        const body = res.json() as { error?: { code?: string } } & Record<string, unknown>;
        // the app's NotFoundError, not Fastify's unknown-route 404
        expect(body.error?.code).toBe('not_found');
        expect(body).not.toHaveProperty('runs');
        expect(body).not.toHaveProperty('agent_id');
      }
    } finally {
      await app.close();
    }
  });

  it('AC-22 another workspace never affects any number or row', async () => {
    const ws = await makeWorkspace();
    const a = await addAgent(ws, 'Home Agent');
    const homeRun = await addRun(ws, { agentId: a, ranAt: hoursAgo(1), costUsd: 0.01, model: 'm-home' });
    await addDecisions(ws, homeRun, a, { accepted: 1, dismissed: 1 });
    const svc = service();
    const before = {
      d1: await svc.dashboard(ws.id, { period: '1d' }),
      d30: await svc.dashboard(ws.id, { period: '30d' }),
      stats: await svc.agentStats(ws.id, a, { period: '30d' }),
    };

    const other = await makeWorkspace();
    const b = await addAgent(other, 'Away Agent');
    const awayRun = await addRun(other, { agentId: b, ranAt: hoursAgo(1), costUsd: 0.5, model: 'm-away' });
    await addDecisions(other, awayRun, b, { accepted: 7, dismissed: 3 });
    const awayGone = await addAgent(other, 'Away Gone');
    await addRun(other, { agentId: awayGone, ranAt: hoursAgo(2), costUsd: 0.2, model: null });
    await db.delete(t.agents).where(eq(t.agents.id, awayGone));
    // a review of the other workspace pointing at this workspace's run id
    await addDecisions(other, homeRun, b, { accepted: 6, dismissed: 2 });

    expect(await svc.dashboard(ws.id, { period: '1d' })).toEqual(before.d1);
    expect(await svc.dashboard(ws.id, { period: '30d' })).toEqual(before.d30);
    expect(await svc.agentStats(ws.id, a, { period: '30d' })).toEqual(before.stats);
  });

  it('AC-23 both endpoints make no provider call and write no row', async () => {
    const ws = await makeWorkspace();
    const a = await addAgent(ws, 'Read Only Agent');
    const { app, llm } = await makeApp(ws);
    try {
      const r = await addRun(ws, { agentId: a, ranAt: new Date(Date.now() - HOUR), costUsd: 0.01 });
      await addDecisions(ws, r, a, { accepted: 1, pending: 1 });
      // inserted after boot, so the boot-time reaper cannot turn it into a write we would see
      await addRun(ws, { agentId: a, ranAt: new Date(Date.now() - 2 * HOUR), status: 'running' });

      const tables = (await db.execute(
        sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
      )) as unknown as { table_name: string }[];
      async function counts(): Promise<Record<string, number>> {
        const out: Record<string, number> = {};
        for (const { table_name } of tables) {
          const rows = (await db.execute(
            sql`select count(*)::int as n from ${sql.identifier(table_name)}`,
          )) as unknown as { n: number }[];
          out[table_name] = rows[0]!.n;
        }
        return out;
      }
      const baseline = await counts();
      expect(baseline['agent_runs']).toBeGreaterThanOrEqual(2);

      const today = utcDate(new Date());
      const qs = ['period=1d', 'period=30d', `period=custom&from=2026-10-01&to=${today}`];
      for (const q of qs) {
        const dash = await app.inject({ method: 'GET', url: `/agent-performance?${q}` });
        expect(dash.statusCode).toBe(200);
        const stats = await app.inject({ method: 'GET', url: `/agents/${a}/stats?${q}` });
        expect(stats.statusCode).toBe(200);
      }

      expect(llm.calls).toHaveLength(0);
      expect(await counts()).toEqual(baseline);
    } finally {
      await app.close();
    }
  });
});
