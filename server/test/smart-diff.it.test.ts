import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { SmartDiff } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('Smart Diff route (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        llm: { openai: new MockLLMProvider('openai', { structured: {} }) },
      },
    });
  }

  async function setupPr() {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'smart-diff-fixture', fullName: 'acme/smart-diff-fixture' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 501,
        title: 'Add x module',
        author: 'marisa.koch',
        branch: 'feat/x',
        base: 'main',
        headSha: 'deadbeef',
        additions: 10,
        deletions: 5,
        filesCount: 5,
        status: 'needs_review',
      })
      .returning();

    const CORE_FILE = 'server/src/modules/x/service.ts';
    const LOCK_FILE = 'pnpm-lock.yaml';
    await pg.handle.db.insert(t.prFiles).values([
      { prId: pr!.id, path: LOCK_FILE, additions: 0, deletions: 100 },
      { prId: pr!.id, path: CORE_FILE, additions: 10, deletions: 2 },
      { prId: pr!.id, path: 'server/test/x.test.ts', additions: 5, deletions: 0 },
      { prId: pr!.id, path: 'server/src/modules/x/index.ts', additions: 1, deletions: 1 },
      { prId: pr!.id, path: 'docs/x.md', additions: 3, deletions: 0 },
    ]);

    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr!.id, agentId: null, runId: null, kind: 'review', verdict: 'request_changes', summary: 's', score: 80, model: 'gpt-4.1' })
      .returning();

    // Two findings on the core file (start_line 11 twice → one unique line
    // after dedup), plus one on the lock file.
    await pg.handle.db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: CORE_FILE,
        startLine: 11,
        endLine: 11,
        severity: 'CRITICAL',
        category: 'bug',
        title: 'Finding A',
        rationale: 'r',
        confidence: 0.9,
      },
      {
        reviewId: review!.id,
        file: CORE_FILE,
        startLine: 11,
        endLine: 11,
        severity: 'WARNING',
        category: 'style',
        title: 'Finding B',
        rationale: 'r',
        confidence: 0.5,
      },
      {
        reviewId: review!.id,
        file: LOCK_FILE,
        startLine: 1,
        endLine: 1,
        severity: 'SUGGESTION',
        category: 'style',
        title: 'Finding C',
        rationale: 'r',
        confidence: 0.4,
      },
    ]);

    return { repo: repo!, pr: pr!, CORE_FILE, LOCK_FILE };
  }

  it('GET /pulls/:id/smart-diff returns a SmartDiff-shaped body, grouped and ordered', async () => {
    const app = await appWith();
    const { pr, CORE_FILE } = await setupPr();

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(() => SmartDiff.parse(body)).not.toThrow();

    expect(body.groups.map((g: { role: string }) => g.role)).toEqual([
      'core',
      'tests',
      'wiring',
      'docs',
      'boilerplate',
    ]);

    const boilerplate = body.groups.find((g: { role: string }) => g.role === 'boilerplate');
    expect(boilerplate.files.map((f: { path: string }) => f.path)).toEqual(['pnpm-lock.yaml']);

    const core = body.groups.find((g: { role: string }) => g.role === 'core');
    const coreFile = core.files.find((f: { path: string }) => f.path === CORE_FILE);
    expect(coreFile.finding_lines).toEqual([11]);

    const totalLines = 100 + 12 + 5 + 2 + 3; // Σ(additions + deletions) across the 5 files
    expect(body.split_suggestion.total_lines).toBe(totalLines);

    await app.close();
  });

  it('an unknown PR id → 404', async () => {
    const app = await appWith();
    const res = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-0000-0000-000000000000/smart-diff',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
