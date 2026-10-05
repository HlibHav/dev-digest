import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { PrDetail, RepoRef } from '@devdigest/shared';

/**
 * AC-4a (PR Brief, I3): refreshing the PR detail from GitHub also persists
 * GitHub's current head commit as `pull_requests.head_sha`; a failed refresh
 * leaves the stored head alone. Needs Docker (Testcontainers Postgres) and is
 * skipped by the Docker guard in a sandbox without it.
 *
 * Assertions read the ROW, not only the response body: `refreshPullDetail`
 * already returns GitHub's `head_sha` in the body today (`{ ...detail }`), so a
 * body-only check would pass before the feature exists.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** GitHub double whose PR-detail fetch fails, as with no token or offline. */
class FailingGitHub extends MockGitHubClient {
  async getPullRequest(_repo: RepoRef, _n: number): Promise<PrDetail> {
    throw new Error('GitHub unavailable');
  }
}

let repoSeq = 0;
async function setupPr(db: PgFixture['handle']['db'], workspaceId: string, headSha: string) {
  const name = `refresh-head-${repoSeq++}`;
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
      headSha,
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Stored description.',
    })
    .returning();
  return pr!;
}

d('PR detail refresh persists the head commit (Testcontainers pg)', () => {
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

  function appWith(github: MockGitHubClient) {
    // Registered under EVERY provider id so no path can reach a real provider
    // (server/INSIGHTS.md 2026-09-20).
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient(),
        github,
        llm: {
          openai: new MockLLMProvider('openai'),
          anthropic: new MockLLMProvider('anthropic'),
          openrouter: new MockLLMProvider('openrouter'),
        },
      },
    });
  }

  async function storedHead(prId: string): Promise<string> {
    const [row] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, prId));
    return row!.headSha;
  }

  it("persists GitHub's head bbb and returns it (stored aaa -> bbb)", async () => {
    const pr = await setupPr(pg.handle.db, workspaceId, 'aaa');
    const app = await appWith(new MockGitHubClient({ detail: { head_sha: 'bbb' } }));

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });

    expect(res.statusCode).toBe(200);
    expect(res.json().head_sha).toBe('bbb');
    expect(await storedHead(pr.id)).toBe('bbb');
    await app.close();
  });

  it('keeps the stored head aaa when GitHub throws, and still answers 200 from the stored detail', async () => {
    const pr = await setupPr(pg.handle.db, workspaceId, 'aaa');
    const app = await appWith(new FailingGitHub());

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });

    expect(res.statusCode).toBe(200);
    expect(res.json().head_sha).toBe('aaa');
    expect(await storedHead(pr.id)).toBe('aaa');
    await app.close();
  });

  it('a later successful refresh moves the head again (aaa -> bbb -> ccc)', async () => {
    const pr = await setupPr(pg.handle.db, workspaceId, 'aaa');

    const first = await appWith(new MockGitHubClient({ detail: { head_sha: 'bbb' } }));
    await first.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    await first.close();
    expect(await storedHead(pr.id)).toBe('bbb');

    const second = await appWith(new MockGitHubClient({ detail: { head_sha: 'ccc' } }));
    await second.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    await second.close();
    expect(await storedHead(pr.id)).toBe('ccc');
  });
});
