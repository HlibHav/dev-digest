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
 * Red-first for the eval pipeline, case half (docs/plans/2026-10-10-eval-pipeline.md, step 11):
 * AC-2, 3, 4, 5, 7, 8, 9 (route half), 10, 11, 12 (integration), 13, 42, 43 (integration), 57.
 * Needs Docker; skipped by the Docker guard where there is none.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const PATCH = '@@ -1,2 +1,3 @@\n const a = 1;\n+const unsafe = eval(input);\n export {};\n';
const UNSAFE_LINE = 2;
const NO_PATCH_MESSAGE = "This PR's diff is not stored yet. Open the PR once and try again.";
const OVER_64KB = 'x'.repeat(64 * 1024 + 1);

const caseBody = (over: Record<string, unknown> = {}) => ({
  name: 'Hand-written case',
  input_diff: `diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n${PATCH}`,
  input_meta: { title: 'Add eval hook', body: 'Body text' },
  expected_output: [{ type: 'must_find', file: 'src/a.ts', start_line: 2, end_line: 2 }],
  notes: null,
  ...over,
});

d('eval cases (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
    workspaceId = ws!.id;
    const llm = new MockLLMProvider('openai');
    app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv),
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

  async function makeAgent(ws = workspaceId, over: Partial<typeof t.agents.$inferInsert> = {}) {
    const [agent] = await db()
      .insert(t.agents)
      .values({
        workspaceId: ws,
        name: `agent-${randomUUID().slice(0, 6)}`,
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'You are a strict reviewer.',
        ...over,
      })
      .returning();
    return agent!;
  }

  /** A PR with one stored file patch, a review by `agentId`, and one finding on that file. */
  async function makeFinding(opts: {
    agentId: string | null;
    ws?: string;
    decision?: 'accepted' | 'dismissed' | 'none';
    patch?: string | null;
  }) {
    const ws = opts.ws ?? workspaceId;
    const name = `r-${randomUUID().slice(0, 8)}`;
    const [repo] = await db()
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db()
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 482,
        title: 'Add eval hook',
        author: 'marisa',
        branch: 'feat/x',
        base: 'main',
        headSha: 'a1b2c3d4',
        body: 'Body text',
      })
      .returning();
    if (opts.patch !== null) {
      await db()
        .insert(t.prFiles)
        .values({ prId: pr!.id, path: 'src/a.ts', additions: 1, deletions: 0, patch: opts.patch ?? PATCH });
    }
    const [review] = await db()
      .insert(t.reviews)
      .values({ workspaceId: ws, prId: pr!.id, agentId: opts.agentId, kind: 'review' })
      .returning();
    const decision = opts.decision ?? 'accepted';
    const [finding] = await db()
      .insert(t.findings)
      .values({
        reviewId: review!.id,
        file: 'src/a.ts',
        startLine: UNSAFE_LINE,
        endLine: UNSAFE_LINE,
        severity: 'CRITICAL',
        category: 'security',
        title: 'eval on user input',
        rationale: 'because',
        confidence: 0.9,
        acceptedAt: decision === 'accepted' ? new Date() : null,
        dismissedAt: decision === 'dismissed' ? new Date() : null,
      })
      .returning();
    return { repo: repo!, pr: pr!, finding: finding! };
  }

  const turnInto = (findingId: string) => app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });

  it('AC-3 an accepted finding becomes a must_find case in its review agent set', async () => {
    const agent = await makeAgent();
    const { finding } = await makeFinding({ agentId: agent.id, decision: 'accepted' });

    const res = await turnInto(finding.id);

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.agent).toEqual({ id: agent.id, name: agent.name });
    expect(body.case.agent_id).toBe(agent.id);
    expect(body.case.source_finding_id).toBe(finding.id);
    expect(body.case.expected_output).toEqual([
      {
        type: 'must_find',
        file: 'src/a.ts',
        start_line: UNSAFE_LINE,
        end_line: UNSAFE_LINE,
        severity: 'CRITICAL',
        category: 'security',
        title: 'eval on user input',
      },
    ]);
    const list = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` });
    expect(list.json().map((c: { id: string }) => c.id)).toEqual([body.case.id]);
  });

  it('AC-4 a dismissed finding becomes a must_not_flag case with its file and range', async () => {
    const agent = await makeAgent();
    const { finding } = await makeFinding({ agentId: agent.id, decision: 'dismissed' });

    const res = await turnInto(finding.id);

    expect(res.statusCode).toBe(201);
    const [expectation] = res.json().case.expected_output;
    expect(expectation).toMatchObject({
      type: 'must_not_flag',
      file: 'src/a.ts',
      start_line: UNSAFE_LINE,
      end_line: UNSAFE_LINE,
    });
  });

  it('AC-5 the case keeps the file patch, the PR title and body, and the PR source', async () => {
    const agent = await makeAgent();
    const { finding, repo, pr } = await makeFinding({ agentId: agent.id });

    const { case: created } = (await turnInto(finding.id)).json();

    expect(created.input_diff).toContain(PATCH);
    expect(created.input_diff).toContain('diff --git a/src/a.ts b/src/a.ts');
    expect(created.input_meta).toEqual({ title: 'Add eval hook', body: 'Body text' });
    expect(created.source).toEqual({ repo_id: repo.id, pr_id: pr.id, pr_number: 482 });
  });

  it('AC-43 (integration) the case returns source with repo_id, pr_id and pr_number', async () => {
    const agent = await makeAgent();
    const { finding, repo, pr } = await makeFinding({ agentId: agent.id });

    const { case: created } = (await turnInto(finding.id)).json();
    const list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();

    expect(created.source).toEqual({ repo_id: repo.id, pr_id: pr.id, pr_number: 482 });
    expect(list[0].source).toEqual({ repo_id: repo.id, pr_id: pr.id, pr_number: 482 });
  });

  it('AC-7 a finding file with no stored patch is refused with the reason and creates nothing', async () => {
    const agent = await makeAgent();
    const { finding } = await makeFinding({ agentId: agent.id, patch: null });

    const res = await turnInto(finding.id);

    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toBe(NO_PATCH_MESSAGE);
    const list = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` });
    expect(list.json()).toEqual([]);
  });

  it('AC-8 a stored patch over 64 KB is refused naming the limit, and nothing is created', async () => {
    const agent = await makeAgent();
    const { finding } = await makeFinding({ agentId: agent.id, patch: `@@ -1 +1 @@\n+${OVER_64KB}\n` });

    const res = await turnInto(finding.id);

    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toMatch(/64 KB/);
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json()).toEqual([]);
  });

  it('AC-8 a pasted diff over 64 KB is refused on create and on update', async () => {
    const agent = await makeAgent();
    const created = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/eval-cases`,
      payload: caseBody(),
    });
    expect(created.statusCode).toBe(201);

    const tooBigCreate = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/eval-cases`,
      payload: caseBody({ input_diff: OVER_64KB }),
    });
    const tooBigUpdate = await app.inject({
      method: 'PUT',
      url: `/eval-cases/${created.json().id}`,
      payload: caseBody({ input_diff: OVER_64KB }),
    });

    for (const res of [tooBigCreate, tooBigUpdate]) {
      expect(res.statusCode).toBe(422);
      expect(res.json().error.message).toMatch(/64 KB/);
    }
    const list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
    expect(list).toHaveLength(1);
    expect(list[0].input_diff).toBe(caseBody().input_diff);
  });

  it('AC-9 (route half) a finding with no decision is refused with 422', async () => {
    const agent = await makeAgent();
    const { finding } = await makeFinding({ agentId: agent.id, decision: 'none' });

    const res = await turnInto(finding.id);

    expect(res.statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json()).toEqual([]);
  });

  it('AC-10 a decided finding whose review has no agent is refused with 422', async () => {
    const { finding } = await makeFinding({ agentId: null, decision: 'accepted' });

    const res = await turnInto(finding.id);

    expect(res.statusCode).toBe(422);
    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, finding.id))).toEqual([]);
  });

  it('AC-11 turning the same finding in twice returns the same case and keeps one in the set', async () => {
    const agent = await makeAgent();
    const { finding } = await makeFinding({ agentId: agent.id });

    const first = await turnInto(finding.id);
    const second = await turnInto(finding.id);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().case.id).toBe(first.json().case.id);
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json()).toHaveLength(1);
  });

  it('AC-12 (integration) the create route returns the owning agent, or 422 with the no-patch reason', async () => {
    const agent = await makeAgent();
    const ok = await makeFinding({ agentId: agent.id });
    const bad = await makeFinding({ agentId: agent.id, patch: null });

    const created = await turnInto(ok.finding.id);
    const refused = await turnInto(bad.finding.id);

    expect(created.json().agent).toEqual({ id: agent.id, name: agent.name });
    expect(refused.statusCode).toBe(422);
    expect(refused.json().error.message).toBe(NO_PATCH_MESSAGE);
  });

  it('AC-13 a later decision change leaves the case expectation unchanged', async () => {
    const agent = await makeAgent();
    const { finding } = await makeFinding({ agentId: agent.id, decision: 'accepted' });
    const { case: created } = (await turnInto(finding.id)).json();

    await db()
      .update(t.findings)
      .set({ acceptedAt: null, dismissedAt: new Date() })
      .where(eq(t.findings.id, finding.id));

    const list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
    expect(list[0].id).toBe(created.id);
    expect(list[0].expected_output[0].type).toBe('must_find');
  });

  it('AC-42 an edit updates the case; a delete removes it and its detailed results', async () => {
    const agent = await makeAgent();
    const made = (
      await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: caseBody() })
    ).json();

    const edited = await app.inject({
      method: 'PUT',
      url: `/eval-cases/${made.id}`,
      payload: caseBody({ name: 'Renamed', expected_output: [] }),
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ id: made.id, name: 'Renamed', expected_output: [] });

    const [caseRun] = await db().insert(t.evalRuns).values({ caseId: made.id, status: 'passed', pass: true }).returning();
    const del = await app.inject({ method: 'DELETE', url: `/eval-cases/${made.id}` });

    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json()).toEqual([]);
    expect((await app.inject({ method: 'GET', url: `/eval-case-runs/${caseRun!.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${made.id}` })).statusCode).toBe(404);
  });

  it('AC-42 deleting a case leaves a past suite run with its metrics and scored-case list', async () => {
    const agent = await makeAgent();
    const made = (
      await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: caseBody() })
    ).json();
    const scored = [{ case_id: made.id, case_name: made.name, status: 'passed' }];
    const [suite] = await db()
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId,
        agentId: agent.id,
        runNumber: 1,
        agentVersion: agent.version,
        status: 'done',
        finishedAt: new Date(),
        casesTotal: 1,
        casesDone: 1,
        casesPassed: 1,
        recall: 1,
        precision: 1,
        citationAccuracy: 1,
        scoredCases: scored,
        snapshot: { system_prompt: 'p', model: 'gpt-4.1', provider: 'openai', strategy: 'single-pass', skills: [] },
      })
      .returning();
    await db().insert(t.evalRuns).values({ caseId: made.id, suiteRunId: suite!.id, status: 'passed', pass: true });

    await app.inject({ method: 'DELETE', url: `/eval-cases/${made.id}` });

    const read = (await app.inject({ method: 'GET', url: `/eval-suite-runs/${suite!.id}` })).json();
    expect(read).toMatchObject({ recall: 1, precision: 1, citation_accuracy: 1, cases_passed: 1 });
    expect(read.scored_cases).toEqual(scored);
    expect(read.case_results).toEqual([]);
  });

  it('AC-57 deleting an agent deletes its cases, suite runs and case results, and drops it from the dashboard', async () => {
    const agent = await makeAgent();
    const made = (
      await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: caseBody() })
    ).json();
    const [suite] = await db()
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId,
        agentId: agent.id,
        runNumber: 1,
        agentVersion: 1,
        status: 'done',
        casesTotal: 1,
        snapshot: { system_prompt: 'p', model: 'gpt-4.1', provider: 'openai', strategy: 'single-pass', skills: [] },
      })
      .returning();
    const [caseRun] = await db()
      .insert(t.evalRuns)
      .values({ caseId: made.id, suiteRunId: suite!.id, status: 'passed', pass: true })
      .returning();
    const before = (await app.inject({ method: 'GET', url: '/eval/dashboard' })).json();
    expect(before.agents.map((a: { agent_id: string }) => a.agent_id)).toContain(agent.id);

    const del = await app.inject({ method: 'DELETE', url: `/agents/${agent.id}` });

    expect(del.statusCode).toBeLessThan(300);
    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.agentId, agent.id))).toEqual([]);
    expect(await db().select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.agentId, agent.id))).toEqual([]);
    expect((await app.inject({ method: 'GET', url: `/eval-suite-runs/${suite!.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/eval-case-runs/${caseRun!.id}` })).statusCode).toBe(404);
    const after = (await app.inject({ method: 'GET', url: '/eval/dashboard' })).json();
    expect(after.agents.map((a: { agent_id: string }) => a.agent_id)).not.toContain(agent.id);
  });

  it('AC-2 another workspace agent, case, suite run and finding answer 404 for valid uuids', async () => {
    const [other] = await db().insert(t.workspaces).values({ name: `other-${randomUUID().slice(0, 6)}` }).returning();
    const foreignAgent = await makeAgent(other!.id);
    const foreignFinding = await makeFinding({ agentId: foreignAgent.id, ws: other!.id });
    const [foreignCase] = await db()
      .insert(t.evalCases)
      .values({
        workspaceId: other!.id,
        ownerKind: 'agent',
        ownerId: foreignAgent.id,
        agentId: foreignAgent.id,
        name: 'foreign',
        inputDiff: caseBody().input_diff,
        inputMeta: { title: 't', body: 'b' },
        expectedOutput: [],
      })
      .returning();
    const [foreignSuite] = await db()
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId: other!.id,
        agentId: foreignAgent.id,
        runNumber: 1,
        agentVersion: 1,
        status: 'done',
        casesTotal: 1,
        snapshot: { system_prompt: 'p', model: 'm', provider: 'openai', strategy: 'single-pass', skills: [] },
      })
      .returning();
    const [foreignSuite2] = await db()
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId: other!.id,
        agentId: foreignAgent.id,
        runNumber: 2,
        agentVersion: 1,
        status: 'done',
        casesTotal: 1,
        snapshot: { system_prompt: 'p', model: 'm', provider: 'openai', strategy: 'single-pass', skills: [] },
      })
      .returning();
    const [foreignCaseRun] = await db()
      .insert(t.evalRuns)
      .values({ caseId: foreignCase!.id, status: 'passed', pass: true })
      .returning();

    const requests: { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; url: string; payload?: unknown }[] = [
      { method: 'POST', url: `/findings/${foreignFinding.finding.id}/eval-case` },
      { method: 'GET', url: `/agents/${foreignAgent.id}/eval-cases` },
      { method: 'POST', url: `/agents/${foreignAgent.id}/eval-cases`, payload: caseBody() },
      { method: 'PUT', url: `/eval-cases/${foreignCase!.id}`, payload: caseBody() },
      { method: 'DELETE', url: `/eval-cases/${foreignCase!.id}` },
      { method: 'POST', url: `/eval-cases/${foreignCase!.id}/run` },
      { method: 'GET', url: `/eval-case-runs/${foreignCaseRun!.id}` },
      { method: 'POST', url: `/agents/${foreignAgent.id}/eval-runs` },
      { method: 'GET', url: `/eval-suite-runs/${foreignSuite!.id}` },
      { method: 'GET', url: `/agents/${foreignAgent.id}/eval-suite-runs` },
      { method: 'GET', url: `/agents/${foreignAgent.id}/eval-dashboard` },
      { method: 'GET', url: `/eval-suite-runs/compare?base=${foreignSuite!.id}&head=${foreignSuite2!.id}` },
    ];
    for (const r of requests) {
      const res = await app.inject({ method: r.method, url: r.url, payload: r.payload as object | undefined });
      expect(res.statusCode, `${r.method} ${r.url}`).toBe(404);
    }

    // The foreign rows are untouched and absent from this workspace's dashboard.
    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.id, foreignCase!.id))).toHaveLength(1);
    const dash = (await app.inject({ method: 'GET', url: '/eval/dashboard' })).json();
    const ids = dash.agents.map((a: { agent_id: string }) => a.agent_id);
    expect(ids).not.toContain(foreignAgent.id);
  });
});
