import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed, DEFAULT_WORKSPACE_NAME } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * Red-first for the eval pipeline, history half (docs/plans/2026-10-10-eval-pipeline.md, step 11):
 * AC-45, 47, 48, 58. Suite runs are inserted straight into the tables: these tests read, they do not run the model.
 * Needs Docker; skipped by the Docker guard where there is none.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

type SuiteInsert = typeof t.evalSuiteRuns.$inferInsert;
type Snapshot = { system_prompt: string; model: string; provider: string; strategy: string; skills: unknown[] };

const SNAPSHOT: Snapshot = {
  system_prompt: 'line one\nline two\nline three',
  model: 'gpt-4.1',
  provider: 'openai',
  strategy: 'single-pass',
  skills: [],
};

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

d('eval history, compare and dashboards (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let workspaceId: string;

  const config = () => loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
    workspaceId = ws!.id;
    const llm = new MockLLMProvider('openai');
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        github: new MockGitHubClient(),
        llm: { openai: llm, anthropic: llm, openrouter: llm },
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const db = () => pg.handle.db;

  async function makeAgent() {
    const [agent] = await db()
      .insert(t.agents)
      .values({
        workspaceId,
        name: `agent-${randomUUID().slice(0, 6)}`,
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'You are a strict reviewer.',
      })
      .returning();
    return agent!;
  }

  async function makeCase(agentId: string, name: string) {
    const [row] = await db()
      .insert(t.evalCases)
      .values({
        workspaceId,
        ownerKind: 'agent',
        ownerId: agentId,
        agentId,
        name,
        inputDiff: 'diff --git a/a b/a\n',
        expectedOutput: [],
      })
      .returning();
    return row!;
  }

  async function makeSuite(agentId: string, over: Partial<SuiteInsert> & { snapshot?: Snapshot } = {}) {
    const [row] = await db()
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId,
        agentId,
        runNumber: 1,
        agentVersion: 1,
        status: 'done',
        startedAt: minutesAgo(10),
        finishedAt: minutesAgo(9),
        casesTotal: 2,
        casesDone: 2,
        casesPassed: 2,
        casesErrored: 0,
        recall: 1,
        precision: 1,
        citationAccuracy: 1,
        costUsd: 0.01,
        durationMs: 1000,
        scoredCases: [],
        snapshot: SNAPSHOT,
        ...over,
      })
      .returning();
    return row!;
  }

  const get = (url: string) => app.inject({ method: 'GET', url });

  it('AC-45 lists the agent suite runs newest first with metrics, passed / executed, errored count and cost', async () => {
    const agent = await makeAgent();
    const oldest = await makeSuite(agent.id, { runNumber: 1, startedAt: minutesAgo(30), recall: 0.5 });
    const newest = await makeSuite(agent.id, {
      runNumber: 3,
      agentVersion: 2,
      status: 'partial',
      startedAt: minutesAgo(10),
      casesTotal: 5,
      casesDone: 5,
      casesPassed: 3,
      casesErrored: 1,
      recall: 0.75,
      precision: 0.6,
      citationAccuracy: 0.9,
      costUsd: 0.042,
    });
    const middle = await makeSuite(agent.id, { runNumber: 2, startedAt: minutesAgo(20), recall: 0.6 });

    const history = await get(`/agents/${agent.id}/eval-suite-runs`);

    expect(history.statusCode).toBe(200);
    const rows = history.json();
    expect(rows.map((r: { id: string }) => r.id)).toEqual([newest.id, middle.id, oldest.id]);
    expect(rows[0]).toMatchObject({
      run_number: 3,
      agent_version: 2,
      status: 'partial',
      started_at: expect.any(String),
      cases_total: 5,
      cases_done: 5,
      cases_passed: 3,
      cases_errored: 1,
      recall: 0.75,
      precision: 0.6,
      citation_accuracy: 0.9,
      cost_usd: 0.042,
    });
    // The list never carries the heavy snapshot.
    expect(rows[0]).not.toHaveProperty('snapshot');

    // The per-agent dashboard lists the same runs in the same order.
    await makeCase(agent.id, 'case a');
    const dash = await get(`/agents/${agent.id}/eval-dashboard`);
    expect(dash.statusCode).toBe(200);
    expect(dash.json().history.map((r: { id: string }) => r.id)).toEqual([newest.id, middle.id, oldest.id]);
  });

  it('AC-47 compares two runs: older first whatever the query order, signed deltas, prompt line diff, config changes', async () => {
    const agent = await makeAgent();
    const older = await makeSuite(agent.id, {
      runNumber: 1,
      startedAt: minutesAgo(30),
      recall: 0.5,
      precision: 0.8,
      citationAccuracy: 1,
      costUsd: 0.02,
      snapshot: {
        ...SNAPSHOT,
        skills: [{ id: 'skill-a', name: 'sql-injection', version: 1, body: 'x' }],
      },
    });
    const newer = await makeSuite(agent.id, {
      runNumber: 2,
      agentVersion: 2,
      status: 'partial',
      startedAt: minutesAgo(10),
      recall: 0.75,
      precision: 0.7,
      citationAccuracy: 1,
      costUsd: 0.05,
      snapshot: {
        ...SNAPSHOT,
        system_prompt: 'line one\nline TWO\nline three',
        model: 'gpt-4.1-mini',
        skills: [
          { id: 'skill-a', name: 'sql-injection', version: 2, body: 'y' },
          { id: 'skill-b', name: 'xss', version: 1, body: 'z' },
        ],
      },
    });

    // The query names the newer run as `base`: the server still orders by started_at.
    const res = await get(`/eval-suite-runs/compare?base=${newer.id}&head=${older.id}`);

    expect(res.statusCode).toBe(200);
    const cmp = res.json();
    expect(cmp.base.id).toBe(older.id);
    expect(cmp.head.id).toBe(newer.id);
    expect(cmp.base.recall).toBe(0.5);
    expect(cmp.head.recall).toBe(0.75);
    expect(cmp.deltas.recall).toBeCloseTo(0.25, 10);
    expect(cmp.deltas.precision).toBeCloseTo(-0.1, 10);
    expect(cmp.deltas.citation_accuracy).toBe(0);
    expect(cmp.deltas.cost_usd).toBeCloseTo(0.03, 10);
    expect(cmp.prompt_diff).toEqual([
      { op: 'equal', text: 'line one' },
      { op: 'remove', text: 'line two' },
      { op: 'add', text: 'line TWO' },
      { op: 'equal', text: 'line three' },
    ]);
    expect(cmp.config_changes).toEqual(
      expect.arrayContaining([
        { kind: 'model', name: null, from: 'gpt-4.1', to: 'gpt-4.1-mini' },
        { kind: 'skill_version', name: 'sql-injection', from: '1', to: '2' },
        { kind: 'skill_added', name: 'xss', from: null, to: '1' },
      ]),
    );
    expect(cmp.config_changes).toHaveLength(3);
  });

  it('AC-47 refuses to compare a run with itself, a failed run, a running run or runs of two agents (422)', async () => {
    const agent = await makeAgent();
    const other = await makeAgent();
    const done = await makeSuite(agent.id, { runNumber: 1, startedAt: minutesAgo(30) });
    const done2 = await makeSuite(agent.id, { runNumber: 2, startedAt: minutesAgo(20) });
    const failed = await makeSuite(agent.id, { runNumber: 3, status: 'failed', startedAt: minutesAgo(15) });
    const running = await makeSuite(agent.id, { runNumber: 4, status: 'running', startedAt: minutesAgo(5) });
    const foreign = await makeSuite(other.id, { runNumber: 1, startedAt: minutesAgo(25) });

    const status = async (a: string, b: string) => (await get(`/eval-suite-runs/compare?base=${a}&head=${b}`)).statusCode;

    expect(await status(done.id, done.id)).toBe(422);
    expect(await status(done.id, failed.id)).toBe(422);
    expect(await status(done.id, running.id)).toBe(422);
    expect(await status(done.id, foreign.id)).toBe(422);
    expect(await status(done.id, done2.id)).toBe(200);
  });

  it('AC-48 reports the case-set change from each run\'s own scored list, deleted cases included, deltas over the full sets', async () => {
    const agent = await makeAgent();
    const kept = await makeCase(agent.id, 'kept');
    const gone = await makeCase(agent.id, 'gone');
    const added = await makeCase(agent.id, 'added');
    const scored = (c: { id: string; name: string }, status: 'passed' | 'failed' | 'errored') => ({
      case_id: c.id,
      case_name: c.name,
      status,
    });
    const older = await makeSuite(agent.id, {
      runNumber: 1,
      startedAt: minutesAgo(30),
      casesTotal: 2,
      casesDone: 2,
      recall: 0.4,
      scoredCases: [scored(kept, 'passed'), scored(gone, 'failed')],
    });
    const newer = await makeSuite(agent.id, {
      runNumber: 2,
      startedAt: minutesAgo(10),
      casesTotal: 2,
      casesDone: 2,
      recall: 0.9,
      scoredCases: [scored(kept, 'passed'), scored(added, 'passed')],
    });
    // The deleted case still counts: the run's own list is the source, not the live case table.
    await db().delete(t.evalCases).where(eq(t.evalCases.id, gone.id));

    const res = await get(`/eval-suite-runs/compare?base=${older.id}&head=${newer.id}`);

    expect(res.statusCode).toBe(200);
    const cmp = res.json();
    expect(cmp.case_set).toEqual({ added: 1, removed: 1 });
    expect(cmp.deltas.recall).toBeCloseTo(0.5, 10);

    // The same case set on both sides reports no change.
    const same = await makeSuite(agent.id, {
      runNumber: 3,
      startedAt: minutesAgo(5),
      scoredCases: [scored(kept, 'passed'), scored(added, 'passed')],
    });
    const unchanged = await get(`/eval-suite-runs/compare?base=${newer.id}&head=${same.id}`);
    expect(unchanged.json().case_set).toEqual({ added: 0, removed: 0 });
  });

  it('AC-58 answers the agent dashboard, workspace dashboard and history routes with p95 under 500 ms at 50 runs', async () => {
    const agent = await makeAgent();
    const cases: Awaited<ReturnType<typeof makeCase>>[] = [];
    for (let i = 0; i < 50; i++) cases.push(await makeCase(agent.id, `perf ${i}`));
    const scoredCases = cases.map((c) => ({ case_id: c.id, case_name: c.name, status: 'passed' }));
    const suites = await db()
      .insert(t.evalSuiteRuns)
      .values(
        Array.from({ length: 50 }, (_, i) => ({
          workspaceId,
          agentId: agent.id,
          runNumber: i + 1,
          agentVersion: 1,
          status: 'done' as const,
          startedAt: minutesAgo(600 - i),
          finishedAt: minutesAgo(599 - i),
          casesTotal: 50,
          casesDone: 50,
          casesPassed: 50,
          recall: 0.5 + i / 100,
          precision: 0.8,
          citationAccuracy: 0.9,
          costUsd: 0.1,
          durationMs: 1000,
          scoredCases,
          snapshot: SNAPSHOT,
        })),
      )
      .returning({ id: t.evalSuiteRuns.id });
    const runRows = suites.flatMap((s) =>
      cases.map((c) => ({
        caseId: c.id,
        suiteRunId: s.id,
        status: 'passed' as const,
        pass: true,
        matchedMustFind: 1,
        mustFindTotal: 1,
        noiseCount: 0,
        recall: 1,
        precision: 1,
        citationAccuracy: 1,
        durationMs: 20,
        costUsd: 0.002,
        actualOutput: { grounded: [], dropped: [] },
      })),
    );
    for (let i = 0; i < runRows.length; i += 500) await db().insert(t.evalRuns).values(runRows.slice(i, i + 500));

    const p95 = async (url: string) => {
      const times: number[] = [];
      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        const res = await get(url);
        times.push(performance.now() - start);
        expect(res.statusCode).toBe(200);
      }
      times.sort((a, b) => a - b);
      return times[Math.ceil(times.length * 0.95) - 1]!;
    };

    expect((await get(`/agents/${agent.id}/eval-suite-runs`)).json()).toHaveLength(50);
    expect(await p95(`/agents/${agent.id}/eval-dashboard`)).toBeLessThan(500);
    expect(await p95('/eval/dashboard')).toBeLessThan(500);
    expect(await p95(`/agents/${agent.id}/eval-suite-runs`)).toBeLessThan(500);
  });
});
