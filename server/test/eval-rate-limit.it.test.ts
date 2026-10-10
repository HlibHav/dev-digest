import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * Red-first for the eval pipeline AC-28 (docs/plans/2026-10-10-eval-pipeline.md, step 11):
 * the suite-run route is limited to 10 requests per minute.
 *
 * Own file, own app: `app.ts` registers `@fastify/rate-limit` only when `nodeEnv !== 'test'`, so this
 * suite builds the app with NODE_ENV=development (LOG_LEVEL=silent keeps pino-pretty out of it).
 * Needs Docker; skipped by the Docker guard where there is none.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () =>
  loadConfig({ ...process.env, NODE_ENV: 'development', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

d('eval rate limit (Testcontainers pg)', () => {
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

  async function appAndAgent() {
    const llm = new MockLLMProvider('openai');
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        github: new MockGitHubClient(),
        llm: { openai: llm, anthropic: llm, openrouter: llm },
      },
    });
    // No cases: every POST is refused with 422 before it runs anything, and the limiter still counts it.
    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: `rl-${randomUUID().slice(0, 6)}`,
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'You are a strict reviewer.',
      })
      .returning();
    return { app, agent: agent! };
  }

  it('AC-28 the 11th POST /agents/:id/eval-runs within a minute answers 429', async () => {
    const { app, agent } = await appAndAgent();

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
      statuses.push(res.statusCode);
    }

    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
    await app.close();
  });

  it('AC-28 the run-all route has its own limit of 10 per minute', async () => {
    const { app } = await appAndAgent();

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({ method: 'POST', url: '/eval-runs/all' });
      statuses.push(res.statusCode);
    }

    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
    await app.close();
  });

  it('AC-28 reading a suite run is not limited, even for a caller whose POST is already limited', async () => {
    const { app, agent } = await appAndAgent();
    for (let i = 0; i < 11; i++) await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });

    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      const res = await app.inject({ method: 'GET', url: `/eval-suite-runs/${randomUUID()}` });
      statuses.push(res.statusCode);
    }

    expect(statuses).not.toContain(429);
    await app.close();
  });
});
