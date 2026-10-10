import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { StructuredRequest, StructuredResult } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed, DEFAULT_WORKSPACE_NAME } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { EvalRepository } from '../src/modules/eval/repository.js';
import { buildEvalService } from '../src/modules/eval/wiring.js';
import * as t from '../src/db/schema.js';

/**
 * Red-first for the eval pipeline, run half (docs/plans/2026-10-10-eval-pipeline.md, step 11):
 * AC-14, 15, 22, 25, 26, 27, 29, 30, 31, 32, 33, 34.
 * The model is a MockLLMProvider subclass the test gates and fails on demand.
 * Needs Docker; skipped by the Docker guard where there is none.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,3 @@',
  ' const a = 1;',
  '+const unsafe = eval(input);',
  ' export {};',
  '',
].join('\n');

const finding = (id: string, line: number) => ({
  id,
  severity: 'CRITICAL',
  category: 'security',
  title: `Issue ${id}`,
  file: 'src/a.ts',
  start_line: line,
  end_line: line,
  rationale: 'because',
  confidence: 0.9,
});
const review = (findings: unknown[]) => ({ verdict: 'comment', summary: 'ok', score: 70, findings });

/** Mock model whose calls past `holdAfter` wait for `release()`, and which fails on chosen call numbers. */
class GatedLLM extends MockLLMProvider {
  n = 0;
  holdAfter = Infinity;
  failOn = new Set<number>();
  answer: unknown = review([finding('f1', 2)]);
  private gate: Promise<void> = Promise.resolve();
  private open: () => void = () => {};

  reset() {
    this.n = 0;
    this.calls = [];
    this.holdAfter = Infinity;
    this.failOn = new Set();
    this.answer = review([finding('f1', 2)]);
    this.release();
  }
  hold(afterCalls: number) {
    this.holdAfter = afterCalls;
    this.gate = new Promise<void>((resolve) => (this.open = resolve));
  }
  release() {
    this.holdAfter = Infinity;
    this.open();
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const call = ++this.n;
    // The override does not call super, so record the call here for the tests that inspect it.
    this.calls.push({ method: 'completeStructured', req });
    if (call > this.holdAfter) await this.gate;
    if (this.failOn.has(call)) throw new Error('provider exploded with key sk-live-SECRET123');
    const parsed = req.schema.parse(this.answer);
    return { data: parsed, model: req.model, tokensIn: 100, tokensOut: 50, costUsd: 0.001, raw: '{}', attempts: 1 };
  }
}

const SNAPSHOT = { system_prompt: 'p', model: 'gpt-4.1', provider: 'openai', strategy: 'single-pass', skills: [] };
const caseBody = (name: string) => ({
  name,
  input_diff: DIFF,
  input_meta: { title: 'Add eval hook', body: 'Body text' },
  expected_output: [{ type: 'must_find', file: 'src/a.ts', start_line: 2, end_line: 2 }],
  notes: null,
});

d('eval runs (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let workspaceId: string;
  const llm = new GatedLLM('openai');

  const config = () => loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);
  const overrides = () => ({
    embedder: new MockEmbedder(),
    git: new MockGitClient({ diff: '' }),
    github: new MockGitHubClient(),
    // Under EVERY provider id: the agent's provider decides which one the run asks for.
    llm: { openai: llm, anthropic: llm, openrouter: llm },
  });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
    workspaceId = ws!.id;
    app = await buildApp({ config: config(), db: pg.handle.db, overrides: overrides() });
  });
  afterAll(async () => {
    llm.release();
    await app?.close();
    await pg?.stop();
  });
  beforeEach(() => llm.reset());

  const db = () => pg.handle.db;

  async function makeAgent(over: Partial<typeof t.agents.$inferInsert> = {}) {
    const [agent] = await db()
      .insert(t.agents)
      .values({
        workspaceId,
        name: `agent-${randomUUID().slice(0, 6)}`,
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'You are a strict reviewer.',
        ...over,
      })
      .returning();
    return agent!;
  }

  async function agentWithCases(count: number, over: Partial<typeof t.agents.$inferInsert> = {}) {
    const agent = await makeAgent(over);
    const caseIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const res = await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/eval-cases`,
        payload: caseBody(`case ${i + 1}`),
      });
      caseIds.push(res.json().id);
    }
    return { agent, caseIds };
  }

  const startSuite = (agentId: string) => app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
  const readSuite = async (id: string) => (await app.inject({ method: 'GET', url: `/eval-suite-runs/${id}` })).json();

  async function until<T>(read: () => Promise<T>, done: (v: T) => boolean): Promise<T> {
    const deadline = Date.now() + 15_000;
    for (;;) {
      const v = await read();
      if (done(v)) return v;
      if (Date.now() > deadline) throw new Error(`timed out waiting; last: ${JSON.stringify(v).slice(0, 400)}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  const finished = (id: string) => until(() => readSuite(id), (s) => s.status !== 'running');

  it('AC-25 accepts a suite run with 202 and returns its id, running status, run number and case count', async () => {
    const { agent } = await agentWithCases(2);
    llm.hold(0);

    const res = await startSuite(agent.id);

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({
      suite_run_id: expect.any(String),
      status: 'running',
      run_number: 1,
      cases_total: 2,
    });
    expect((await readSuite(res.json().suite_run_id)).status).toBe('running');
    llm.release();
    const done = await finished(res.json().suite_run_id);
    expect(done.status).toBe('done');
    expect(done.cases_done).toBe(2);
  });

  it('AC-26 refuses a suite run for an agent with no cases or more than 50, naming the limit', async () => {
    const empty = await makeAgent();
    const big = await makeAgent();
    await db()
      .insert(t.evalCases)
      .values(
        Array.from({ length: 51 }, (_, i) => ({
          workspaceId,
          ownerKind: 'agent' as const,
          ownerId: big.id,
          agentId: big.id,
          name: `bulk ${i}`,
          inputDiff: DIFF,
          inputMeta: { title: 't', body: 'b' },
          expectedOutput: [],
        })),
      );

    const none = await startSuite(empty.id);
    const many = await startSuite(big.id);

    expect(none.statusCode).toBe(422);
    expect(none.json().error.message).toMatch(/50/);
    expect(many.statusCode).toBe(422);
    expect(many.json().error.message).toMatch(/50/);
    expect(await db().select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.agentId, big.id))).toEqual([]);
  });

  it('AC-27 refuses a second suite run for the same agent while one is running', async () => {
    const { agent } = await agentWithCases(1);
    llm.hold(0);
    const first = await startSuite(agent.id);

    const second = await startSuite(agent.id);

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(409);
    llm.release();
    await finished(first.json().suite_run_id);
    expect((await startSuite(agent.id)).statusCode).toBe(202);
    await until(
      () => app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-suite-runs` }).then((r) => r.json()),
      (runs: { status: string }[]) => runs.every((r) => r.status !== 'running'),
    );
  });

  it('AC-29 reports cases done out of total on the read route while the run is in progress', async () => {
    const { agent } = await agentWithCases(3);
    llm.hold(1);
    const { suite_run_id } = (await startSuite(agent.id)).json();

    const mid = await until(
      () => readSuite(suite_run_id),
      (s) => s.cases_done === 1,
    );
    expect(mid).toMatchObject({ status: 'running', cases_done: 1, cases_total: 3 });

    llm.release();
    const end = await finished(suite_run_id);
    expect(end).toMatchObject({ status: 'done', cases_done: 3, cases_total: 3 });
  });

  it('AC-31 stores a snapshot of the agent config and skills that later edits do not change', async () => {
    const { agent } = await agentWithCases(1, { strategy: 'single-pass' });
    const [skill] = await db()
      .insert(t.skills)
      .values({
        workspaceId,
        name: 'sec-skill',
        description: 'd',
        type: 'security',
        source: 'manual',
        body: 'SKILL BODY v1',
        version: 4,
      })
      .returning();
    await db().insert(t.agentSkills).values({ agentId: agent.id, skillId: skill!.id, order: 0 });
    llm.hold(0);
    const { suite_run_id } = (await startSuite(agent.id)).json();

    await db().update(t.agents).set({ systemPrompt: 'EDITED PROMPT', model: 'gpt-5' }).where(eq(t.agents.id, agent.id));
    await db().update(t.skills).set({ body: 'SKILL BODY v2', version: 5 }).where(eq(t.skills.id, skill!.id));
    llm.release();
    const run = await finished(suite_run_id);

    expect(run.snapshot).toEqual({
      system_prompt: 'You are a strict reviewer.',
      model: 'gpt-4.1',
      provider: 'openai',
      strategy: 'single-pass',
      skills: [{ id: skill!.id, name: 'sec-skill', version: 4, body: 'SKILL BODY v1' }],
    });
  });

  it('AC-32 numbers suite runs per agent from 1 in start order and carries the agent version', async () => {
    const { agent } = await agentWithCases(1, { version: 3 });
    const other = await agentWithCases(1);

    const first = (await startSuite(agent.id)).json();
    await finished(first.suite_run_id);
    const second = (await startSuite(agent.id)).json();
    await finished(second.suite_run_id);
    const otherFirst = (await startSuite(other.agent.id)).json();
    await finished(otherFirst.suite_run_id);

    expect([first.run_number, second.run_number, otherFirst.run_number]).toEqual([1, 2, 1]);
    const history = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-suite-runs` })).json();
    expect(history.map((r: { run_number: number; agent_version: number }) => [r.run_number, r.agent_version])).toEqual([
      [2, 3],
      [1, 3],
    ]);
  });

  it('AC-33 run-all starts agents with cases and skips the rest, each with its reason', async () => {
    const ready = await agentWithCases(1);
    const disabled = await agentWithCases(1, { enabled: false });
    const noCases = await makeAgent();
    const tooMany = await makeAgent();
    await db()
      .insert(t.evalCases)
      .values(
        Array.from({ length: 51 }, (_, i) => ({
          workspaceId,
          ownerKind: 'agent' as const,
          ownerId: tooMany.id,
          agentId: tooMany.id,
          name: `bulk ${i}`,
          inputDiff: DIFF,
          inputMeta: { title: 't', body: 'b' },
          expectedOutput: [],
        })),
      );
    const busy = await agentWithCases(1);
    await db().insert(t.evalSuiteRuns).values({
      workspaceId,
      agentId: busy.agent.id,
      runNumber: 1,
      agentVersion: 1,
      status: 'running',
      casesTotal: 1,
      snapshot: SNAPSHOT,
    });

    const res = await app.inject({ method: 'POST', url: '/eval-runs/all' });

    expect(res.statusCode).toBe(202);
    const { started, skipped } = res.json() as {
      started: { agent_id: string; suite_run_id: string }[];
      skipped: { agent_id: string; reason: string }[];
    };
    expect(started.find((s) => s.agent_id === ready.agent.id)).toBeDefined();
    const reasons = new Map(skipped.map((s) => [s.agent_id, s.reason]));
    expect(reasons.get(disabled.agent.id)).toBe('disabled');
    expect(reasons.get(noCases.id)).toBe('no cases');
    expect(reasons.get(tooMany.id)).toBe('too many cases');
    expect(reasons.get(busy.agent.id)).toBe('already running');
    for (const id of [disabled.agent.id, noCases.id, tooMany.id, busy.agent.id]) {
      expect(started.find((s) => s.agent_id === id)).toBeUndefined();
    }
    for (const s of started) await finished(s.suite_run_id);
  });

  it('AC-34 a single case run answers 202, runs alone outside any suite, and becomes the last result', async () => {
    const { agent, caseIds } = await agentWithCases(2);
    llm.hold(0);

    const res = await app.inject({ method: 'POST', url: `/eval-cases/${caseIds[0]}/run` });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ case_run_id: expect.any(String), status: 'running' });
    const id = res.json().case_run_id;
    expect((await app.inject({ method: 'GET', url: `/eval-case-runs/${id}` })).json().status).toBe('running');
    llm.release();
    const result = await until(
      () => app.inject({ method: 'GET', url: `/eval-case-runs/${id}` }).then((r) => r.json()),
      (r) => r.status !== 'running',
    );
    expect(result).toMatchObject({ status: 'passed', suite_run_id: null, case_id: caseIds[0] });
    expect(llm.n).toBe(1);
    const cases = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
    const ran = cases.find((c: { id: string }) => c.id === caseIds[0]);
    const untouched = cases.find((c: { id: string }) => c.id === caseIds[1]);
    expect(ran.last_result).toMatchObject({ status: 'passed', matched: 1, expected: 1 });
    expect(untouched.last_result).toBeNull();
    expect(await db().select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.agentId, agent.id))).toEqual([]);
  });

  it('AC-14 gives the engine only the case diff, PR title and body, prompt and skills; no project context', async () => {
    const { agent, caseIds } = await agentWithCases(1);
    const [skill] = await db()
      .insert(t.skills)
      .values({ workspaceId, name: 'sec-skill', description: 'd', type: 'security', source: 'manual', body: 'SKILL BODY NOW' })
      .returning();
    await db().insert(t.agentSkills).values({ agentId: agent.id, skillId: skill!.id, order: 0 });

    const { case_run_id } = (await app.inject({ method: 'POST', url: `/eval-cases/${caseIds[0]}/run` })).json();
    await until(
      () => app.inject({ method: 'GET', url: `/eval-case-runs/${case_run_id}` }).then((r) => r.json()),
      (r) => r.status !== 'running',
    );

    const calls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(calls.length).toBeGreaterThan(0);
    const req = calls[0]!.req as { model: string; messages: { content: string }[] };
    const text = req.messages.map((m) => m.content).join('\n');
    expect(req.model).toBe('gpt-4.1');
    expect(text).toContain('const unsafe = eval(input);');
    expect(text).toContain('Add eval hook');
    expect(text).toContain('Body text');
    expect(text).toContain('You are a strict reviewer.');
    expect(text).toContain('SKILL BODY NOW');
    for (const banned of ['Project context', 'Intent', 'Callers', 'Repo skeleton']) {
      expect(text).not.toContain(banned);
    }
  });

  it('AC-15 keeps the grounded findings and the dropped findings, with the drop reason', async () => {
    const { caseIds } = await agentWithCases(1);
    llm.answer = review([finding('f-grounded', 2), finding('f-ungrounded', 99)]);

    const { case_run_id } = (await app.inject({ method: 'POST', url: `/eval-cases/${caseIds[0]}/run` })).json();
    const result = await until(
      () => app.inject({ method: 'GET', url: `/eval-case-runs/${case_run_id}` }).then((r) => r.json()),
      (r) => r.status !== 'running',
    );

    expect(result.grounded_findings.map((f: { id: string }) => f.id)).toEqual(['f-grounded']);
    expect(result.dropped_findings).toHaveLength(1);
    expect(result.dropped_findings[0].finding.id).toBe('f-ungrounded');
    expect(typeof result.dropped_findings[0].reason).toBe('string');
    expect(result.citation_accuracy).toBeCloseTo(0.5);
  });

  it('AC-22 a failing model call errors that case, excludes it from the metrics and ends the suite partial', async () => {
    const { agent } = await agentWithCases(2);
    llm.failOn = new Set([2]);

    const { suite_run_id } = (await startSuite(agent.id)).json();
    const run = await finished(suite_run_id);

    expect(run.status).toBe('partial');
    expect(run).toMatchObject({ cases_total: 2, cases_done: 2, cases_passed: 1, cases_errored: 1, recall: 1 });
    const errored = run.case_results.find((r: { status: string }) => r.status === 'errored');
    expect(errored.error).toBe('The model call failed or timed out.');
    expect(JSON.stringify(run)).not.toContain('sk-live');
    expect(errored.recall).toBeNull();
    expect(run.scored_cases.map((c: { status: string }) => c.status).sort()).toEqual(['errored', 'passed']);
  });

  it('AC-30 a failure of the whole run marks the suite failed with a reason; it never stays running', async () => {
    const { agent } = await agentWithCases(2);
    class FlakyStore extends EvalRepository {
      finishes = 0;
      override async finishCaseRun(...args: Parameters<EvalRepository['finishCaseRun']>) {
        this.finishes += 1;
        if (this.finishes === 2) throw new Error('connection lost');
        return super.finishCaseRun(...args);
      }
    }
    const service = buildEvalService(app.container, app.log, { store: new FlakyStore(db()) });

    const accepted = await service.startSuite(workspaceId, agent.id);
    const run = await finished(accepted.suite_run_id);

    expect(run.status).toBe('failed');
    expect(typeof run.error).toBe('string');
    expect(run.error).not.toContain('connection lost');
    expect(run.error.length).toBeGreaterThan(0);
    expect(run.finished_at).not.toBeNull();
  });

  it('AC-30 a suite and a case run still running at server start are marked interrupted', async () => {
    const { agent, caseIds } = await agentWithCases(1);
    const [suite] = await db()
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId,
        agentId: agent.id,
        runNumber: 1,
        agentVersion: 1,
        status: 'running',
        casesTotal: 1,
        snapshot: SNAPSHOT,
      })
      .returning();
    const [caseRun] = await db().insert(t.evalRuns).values({ caseId: caseIds[0]!, status: 'running' }).returning();

    const restarted = await buildApp({ config: config(), db: db(), overrides: overrides() });
    try {
      const s = (await restarted.inject({ method: 'GET', url: `/eval-suite-runs/${suite!.id}` })).json();
      const c = (await restarted.inject({ method: 'GET', url: `/eval-case-runs/${caseRun!.id}` })).json();
      expect(s).toMatchObject({ status: 'failed', error: 'interrupted' });
      expect(c).toMatchObject({ status: 'errored', error: 'interrupted' });
    } finally {
      await restarted.close();
    }
  });
});
