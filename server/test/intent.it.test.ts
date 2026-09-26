import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';

/**
 * Integration coverage for the Intent Layer's wiring (F1 gating, GET
 * /pulls/:id/intent, trace.prompt_assembly.intent, and the [D3] cost
 * attribution) — everything the pure-unit tests in intent-helpers.test.ts /
 * intent-service.test.ts cannot exercise without the real route → service →
 * repository → Postgres path. Written like `reviews.it.test.ts`; needs
 * Docker and is not run in this sandbox (see the Docker guard below).
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
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 100,
  findings: [],
};

const INTENT_FIXTURE = {
  intent: 'Adds a token-bucket rate limiter to the public API.',
  in_scope: ['rate limiting middleware'],
  out_of_scope: ['authentication changes'],
  change_type: 'feature',
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string, body = 'Adds rate limiting. Closes #471.') {
  const name = `payments-api-intent-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body,
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('Intent Layer (Testcontainers pg)', () => {
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

  // Registered under EVERY provider id with fixtures for BOTH schemas
  // (`Review` and `PrIntentExtraction`) — `review_intent`'s registry default
  // is `openrouter`, distinct from a review agent's own provider, and an
  // unmocked id would reach a real, paid provider (server/INSIGHTS.md,
  // test-quality-house-rules skill).
  function appWith(intentFixture: unknown = INTENT_FIXTURE) {
    const structuredBySchema = { Review: REVIEW_FIXTURE, PrIntentExtraction: intentFixture };
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        // Hermetic against GitHub: every PR body here reads "Closes #471.",
        // which parseLinkedIssues resolves and IntentService.derive fetches
        // via container.github().getIssue — without this the linked-issue
        // source would reach the real GitHub API (server/INSIGHTS.md).
        github: new MockGitHubClient(),
        llm: {
          openai: new MockLLMProvider('openai', { structuredBySchema }),
          anthropic: new MockLLMProvider('anthropic', { structuredBySchema }),
          openrouter: new MockLLMProvider('openrouter', { structuredBySchema }),
        },
      },
    });
  }

  async function createAgent(app: Awaited<ReturnType<typeof appWith>>, name: string, usesIntent: boolean) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: `You are ${name}.`,
        uses_intent: usesIntent,
      },
    });
    return res.json();
  }

  /**
   * `{all:true}` targets every ENABLED agent in the workspace, and `seed()`
   * (run once in `beforeAll`) leaves its own enabled agents behind — some of
   * them `uses_intent: true` per the plan's seed table. Disable whatever is
   * enabled before a test that needs an exact, self-built batch, and restore
   * it afterwards so later tests in this file see the seeded state again.
   */
  async function isolateAgents(app: Awaited<ReturnType<typeof appWith>>) {
    const before = (await app.inject({ method: 'GET', url: '/agents' })).json() as {
      id: string;
      enabled: boolean;
    }[];
    const enabledIds = before.filter((a) => a.enabled).map((a) => a.id);
    for (const id of enabledIds) {
      await app.inject({ method: 'PUT', url: `/agents/${id}`, payload: { enabled: false } });
    }
    return async () => {
      for (const id of enabledIds) {
        await app.inject({ method: 'PUT', url: `/agents/${id}`, payload: { enabled: true } });
      }
    };
  }

  it('F1: derive is not called when no queued agent uses intent — GET /pulls/:id/intent stays 404', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await createAgent(app, 'NoIntentAgent', false);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    expect(res.statusCode).toBe(200);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const intentRes = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(intentRes.statusCode).toBe(404);

    const runId = res.json().runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.log.some((l: { msg: string }) => l.msg.includes('intent: skipped'))).toBe(true);
    expect(trace.prompt_assembly.intent ?? null).toBeNull();

    await app.close();
  });

  it('F1: derive runs once when at least one queued agent uses intent, and every other agent still completes', async () => {
    const app = await appWith();
    const restore = await isolateAgents(app);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const withIntent = await createAgent(app, 'UsesIntentAgent', true);
    const withoutIntent = await createAgent(app, 'PlainAgent', false);

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { all: true },
    });
    expect(res.statusCode).toBe(200);
    const runs = res.json().runs as { run_id: string; agent_id: string }[];
    expect(runs).toHaveLength(2);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const intentRes = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(intentRes.statusCode).toBe(200);
    const record = intentRes.json();
    expect(record.confidence).toEqual(expect.stringMatching(/^(high|medium|low)$/));
    expect(record.sources).toEqual(expect.any(Array));
    expect(record.intent).toContain('rate limiter');

    const runRows = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id));
    const runIdFor = (agentId: string) => runRows.find((r) => r.agentId === agentId)!.id;
    const traceFor = async (runId: string) =>
      (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();

    // The agent with uses_intent gets the "pr-intent" untrusted block; the
    // other agent's prompt is byte-identical to a review with no intent (null).
    const withIntentTrace = await traceFor(runIdFor(withIntent.id));
    const withoutIntentTrace = await traceFor(runIdFor(withoutIntent.id));
    expect(withIntentTrace.prompt_assembly.intent).toContain('rate limiter');
    expect(withIntentTrace.prompt_assembly.user).toContain('<untrusted source="pr-intent">');
    expect(withoutIntentTrace.prompt_assembly.intent ?? null).toBeNull();

    await restore();
    await app.close();
  });

  it('every queued run still completes when the intent LLM throws', async () => {
    // A fixture that fails PrIntentExtraction's zod parse (missing required
    // fields) makes MockLLMProvider throw inside completeStructured.
    const app = await appWith({ intent: 'not enough fields' });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await createAgent(app, 'UsesIntentAgent2', true);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    expect(res.statusCode).toBe(200);
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(runs[0]!.status).toBe('done');

    const intentRes = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(intentRes.statusCode).toBe(404);

    await app.close();
  });

  it('[D3] a freshly derived intent adds its cost to the FIRST run of the batch only', async () => {
    const app = await appWith();
    const restore = await isolateAgents(app);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    await createAgent(app, 'First', true);
    await createAgent(app, 'Second', true);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } });
    const runIds = (res.json().runs as { run_id: string }[]).map((r) => r.run_id);
    expect(runIds).toHaveLength(2);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const rows = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = runIds.map((id) => byId.get(id)!);
    expect(ordered).toHaveLength(2);

    // Both agents share the same model/fixture, so a review-only run costs
    // the same for either; the batch's ONE freshly-derived intent call adds
    // its cost to exactly one of the two rows (run-executor.ts: `index === 0
    // ? intentOutcome.costUsd : 0`) — proven here as "the two costs differ",
    // without assuming which array index the executor treats as first.
    const costs = ordered.map((r) => r.costUsd ?? 0);
    expect(costs.every((c) => c > 0)).toBe(true);
    expect(costs[0]).not.toBeCloseTo(costs[1]!, 10);

    // The shared intent-derivation log line is fanned out to EVERY run's
    // buffer (RunLogger), regardless of which row's cost_usd carries it.
    const firstTrace = (await app.inject({ method: 'GET', url: `/runs/${runIds[0]}/trace` })).json();
    const secondTrace = (await app.inject({ method: 'GET', url: `/runs/${runIds[1]}/trace` })).json();
    for (const tr of [firstTrace, secondTrace]) {
      expect(tr.log.some((l: { msg: string }) => l.msg.includes('intent: classified by'))).toBe(true);
    }

    await restore();
    await app.close();
  });
});
