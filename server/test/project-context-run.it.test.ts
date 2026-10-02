import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns, waitForRunTrace } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockRepoDocs,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { RunTrace } from '@devdigest/shared';
import type { RepoDocs } from '../src/vendor/shared/adapters.js';

/**
 * Red-first for Project Context at run time (docs/plans/2026-10-02-project-context.md,
 * step 10): AC-22..26 and AC-33..36. The LLM is a MockLLMProvider registered under
 * every provider id (server/INSIGHTS.md 2026-09-20); the clone is a MockRepoDocs
 * (or, for traversal, the real FsRepoDocs over a temp dir).
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,
diff --git a/specs/public-api.md b/specs/public-api.md
--- a/specs/public-api.md
+++ b/specs/public-api.md
@@ -1,1 +1,2 @@
 # API
+PR AUTHOR VERSION`;

const EMPTY_REVIEW = { verdict: 'approve', summary: 'ok', score: 90, findings: [] };

class ThrowingLLM extends MockLLMProvider {
  override async completeStructured<T>(): Promise<never> {
    throw new Error('llm exploded');
  }
}

d('Project Context run-time injection (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let tmp: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    tmp = await mkdtemp(join(tmpdir(), 'ctx-run-'));
  });
  afterAll(async () => {
    await pg?.stop();
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  function appWith(opts: { repoDocs?: RepoDocs; llm?: MockLLMProvider } = {}) {
    const mk = (id: 'openai' | 'anthropic' | 'openrouter') =>
      new MockLLMProvider(id as 'openai', { structured: EMPTY_REVIEW });
    const openai = opts.llm ?? mk('openai');
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        ...(opts.repoDocs ? { repoDocs: opts.repoDocs } : {}),
        llm: { openai, anthropic: openai, openrouter: openai },
      },
    }).then((app) => ({ app, llm: openai }));
  }

  async function setup(clonePath: string | null) {
    const name = `ctx-run-${seq++}-${randomUUID().slice(0, 6)}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 482,
        title: 'Change API',
        author: 'a',
        branch: 'feat/x',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 2,
        deletions: 0,
        filesCount: 2,
        status: 'needs_review',
        body: null,
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values([
      {
        prId: pr!.id,
        path: 'src/config.ts',
        additions: 1,
        deletions: 0,
        patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
      },
      {
        prId: pr!.id,
        path: 'specs/public-api.md',
        additions: 1,
        deletions: 0,
        patch: '@@ -1,1 +1,2 @@\n # API\n+PR AUTHOR VERSION',
      },
    ]);
    return pr!;
  }

  async function makeAgent(paths: string[]) {
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: `agent-${randomUUID()}`,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        systemPrompt: 'review',
      })
      .returning();
    if (paths.length > 0) {
      await pg.handle.db
        .insert(t.agentContextDocs)
        .values(paths.map((path, order) => ({ agentId: a!.id, path, order })));
    }
    return a!.id;
  }

  async function attachSkill(agentId: string, paths: string[], enabled: boolean) {
    const [s] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId,
        name: `skill-${randomUUID().slice(0, 6)}`,
        description: '',
        type: 'custom',
        source: 'manual',
        body: 'skill body',
        enabled,
      })
      .returning();
    await pg.handle.db.insert(t.agentSkills).values({ agentId, skillId: s!.id, order: 0 });
    await pg.handle.db
      .insert(t.skillContextDocs)
      .values(paths.map((path, order) => ({ skillId: s!.id, path, order })));
    return s!;
  }

  type App = Awaited<ReturnType<typeof appWith>>['app'];
  async function runReview(app: App, prId: string, agentId: string) {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    const runs = await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    const row = await waitForRunTrace(pg.handle.db, runId);
    return { runId, status: runs[0]!.status, trace: row.trace as RunTrace };
  }

  const promptOf = (llm: MockLLMProvider) => JSON.stringify(llm.calls.map((c) => c.req));

  it('AC-22: a disabled skill contributes no docs', async () => {
    const { app, llm } = await appWith({ repoDocs: new MockRepoDocs({ files: { 'specs/x.md': 'X-DOC-TEXT' } }) });
    const pr = await setup('/mock/clone');
    const agentId = await makeAgent([]);
    await attachSkill(agentId, ['specs/x.md'], false);
    const { status, trace } = await runReview(app, pr.id, agentId);
    expect(status).toBe('done');
    expect(trace.specs_read).toEqual([]);
    expect(promptOf(llm)).not.toContain('X-DOC-TEXT');
    await app.close();
  });

  it('AC-23: the doc text reaches the prompt verbatim', async () => {
    const { app, llm } = await appWith({ repoDocs: new MockRepoDocs({ files: { 'specs/a.md': 'KNOWN-CONTENT-123' } }) });
    const pr = await setup('/mock/clone');
    const agentId = await makeAgent(['specs/a.md']);
    const { status } = await runReview(app, pr.id, agentId);
    expect(status).toBe('done');
    expect(promptOf(llm)).toContain('KNOWN-CONTENT-123');
    await app.close();
  });

  it('AC-24: a missing doc is skipped, logged and recorded as not_found', async () => {
    const { app } = await appWith({ repoDocs: new MockRepoDocs({ files: {} }) });
    const pr = await setup('/mock/clone');
    const agentId = await makeAgent(['specs/gone.md']);
    const { status, trace } = await runReview(app, pr.id, agentId);
    expect(status).toBe('done');
    expect(trace.log.some((l) => l.msg.includes('project context: specs/gone.md not found'))).toBe(true);
    expect(trace.specs_docs).toEqual([
      expect.objectContaining({ path: 'specs/gone.md', status: 'not_found', origin: 'agent' }),
    ]);
    expect(trace.specs_docs![0]!.text ?? null).toBeNull();
    await app.close();
  });

  it('AC-25: a read failure is unreadable and the run continues', async () => {
    const { app } = await appWith({
      repoDocs: new MockRepoDocs({ files: {}, failures: { 'specs/bad.md': 'EIO boom' } }),
    });
    const pr = await setup('/mock/clone');
    const agentId = await makeAgent(['specs/bad.md']);
    const { status, trace } = await runReview(app, pr.id, agentId);
    expect(status).toBe('done');
    expect(trace.specs_docs).toEqual([expect.objectContaining({ path: 'specs/bad.md', status: 'unreadable' })]);
    expect(trace.log.some((l) => l.msg.includes('specs/bad.md') && l.msg.includes('EIO boom'))).toBe(true);
    await app.close();
  });

  it('AC-26: a PR-modified doc injects the base version and is flagged', async () => {
    const { app, llm } = await appWith({
      repoDocs: new MockRepoDocs({ files: { 'specs/public-api.md': 'BASE-VERSION-TEXT' } }),
    });
    const pr = await setup('/mock/clone');
    const agentId = await makeAgent(['specs/public-api.md']);
    const { trace } = await runReview(app, pr.id, agentId);
    const prompt = promptOf(llm);
    expect(prompt).toContain('BASE-VERSION-TEXT');
    expect(trace.specs_docs).toEqual([
      expect.objectContaining({ path: 'specs/public-api.md', status: 'modified_by_pr' }),
    ]);
    expect(trace.log.some((l) => l.msg.includes('modified by this PR'))).toBe(true);
    await app.close();
  });

  it('AC-33: specs_read lists injected paths in order, skipping the missing one', async () => {
    const { app } = await appWith({
      repoDocs: new MockRepoDocs({ files: { 'specs/a.md': 'A', 'specs/b.md': 'B' } }),
    });
    const pr = await setup('/mock/clone');
    const agentId = await makeAgent(['specs/a.md', 'specs/gone.md', 'specs/b.md']);
    const { trace } = await runReview(app, pr.id, agentId);
    expect(trace.specs_read).toEqual(['specs/a.md', 'specs/b.md']);
    await app.close();
  });

  it('AC-34/35: snapshots carry origin, tokens and the exact block text; specs_tokens counts the section', async () => {
    const { app } = await appWith({
      repoDocs: new MockRepoDocs({ files: { 'specs/own.md': 'OWN TEXT', 'specs/inh.md': 'INHERITED TEXT' } }),
    });
    const pr = await setup('/mock/clone');
    const agentId = await makeAgent(['specs/own.md']);
    const skill = await attachSkill(agentId, ['specs/inh.md'], true);
    const { trace } = await runReview(app, pr.id, agentId);
    const docs = trace.specs_docs!;
    expect(docs).toHaveLength(2);
    const own = docs.find((x) => x.path === 'specs/own.md')!;
    const inh = docs.find((x) => x.path === 'specs/inh.md')!;
    expect(own.origin).toBe('agent');
    expect(inh.origin).toBe('skill');
    expect(inh.skill_name).toBe(skill.name);
    expect(own.text).toBe('OWN TEXT');
    expect(inh.text).toBe('INHERITED TEXT');
    expect(own.tokens).toBeGreaterThan(0);
    const section = trace.prompt_assembly.specs!;
    expect(section).toContain('OWN TEXT');
    expect(section).toContain('INHERITED TEXT');
    expect(trace.prompt_assembly.specs_tokens).toBeGreaterThan(0);
    await app.close();
  });

  it('AC-36: a failed run keeps the section, specs_read, snapshots and specs_tokens', async () => {
    const { app } = await appWith({
      repoDocs: new MockRepoDocs({ files: { 'specs/a.md': 'A-DOC' } }),
      llm: new ThrowingLLM('openai', { structured: EMPTY_REVIEW }),
    });
    const pr = await setup('/mock/clone');
    const agentId = await makeAgent(['specs/a.md']);
    const { status, trace } = await runReview(app, pr.id, agentId);
    expect(status).toBe('failed');
    expect(trace.specs_read).toEqual(['specs/a.md']);
    expect(trace.specs_docs).toEqual([expect.objectContaining({ path: 'specs/a.md', status: 'injected', text: 'A-DOC' })]);
    expect(trace.prompt_assembly.specs).toContain('A-DOC');
    expect(trace.prompt_assembly.specs_tokens).toBeGreaterThan(0);
    await app.close();
  });

  it('uncloned repo: all unreadable, no section, run done', async () => {
    const { app, llm } = await appWith({ repoDocs: new MockRepoDocs({ files: { 'specs/a.md': 'A-DOC' } }) });
    const pr = await setup(null);
    const agentId = await makeAgent(['specs/a.md']);
    const { status, trace } = await runReview(app, pr.id, agentId);
    expect(status).toBe('done');
    expect(trace.specs_docs).toEqual([expect.objectContaining({ path: 'specs/a.md', status: 'unreadable' })]);
    expect(trace.specs_read).toEqual([]);
    expect(trace.prompt_assembly.specs ?? null).toBeNull();
    expect(trace.prompt_assembly.specs_tokens ?? null).toBeNull();
    expect(promptOf(llm)).not.toContain('Project context');
    await app.close();
  });

  it('traversal path is not_found (real FsRepoDocs, nothing outside the clone is read)', async () => {
    const clone = join(tmp, 'clone');
    await mkdir(clone, { recursive: true });
    await writeFile(join(tmp, 'secret.md'), 'OUTSIDE SECRET');
    const { app, llm } = await appWith();
    const pr = await setup(clone);
    const agentId = await makeAgent(['../secret.md']);
    const { status, trace } = await runReview(app, pr.id, agentId);
    expect(status).toBe('done');
    expect(trace.specs_docs).toEqual([expect.objectContaining({ path: '../secret.md', status: 'not_found' })]);
    expect(promptOf(llm)).not.toContain('OUTSIDE SECRET');
    await app.close();
  });
});
