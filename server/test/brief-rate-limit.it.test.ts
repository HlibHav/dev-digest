import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient, MockRepoDocs } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type {
  RepoIntel,
  BlastResult,
  IndexState,
  IndexResult,
  RepoMapResult,
  FileRankRow,
  SymbolRow,
  SignatureRow,
  RefRow,
} from '../src/modules/repo-intel/types.js';

/**
 * Red-first for PR Brief AC-12 (docs/plans/2026-10-03-pr-brief.md, step 10, I2):
 * generation is limited to 10 requests per minute per caller, reading is not.
 *
 * Kept in its own file with its own app: `app.ts` registers `@fastify/rate-limit`
 * only when `nodeEnv !== 'test'`, so this suite builds the app with
 * NODE_ENV=development (LOG_LEVEL=silent keeps pino-pretty out of it) and no other
 * suite sends more than ten POSTs through one app.
 *
 * Needs Docker; skipped by the Docker guard where there is none.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () =>
  loadConfig({ ...process.env, NODE_ENV: 'development', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

const ANSWER = {
  summary: 'Adds a stripe key to the config.',
  risks: [],
  review_focus: [{ file: 'src/config.ts', line: 11, reason: 'New secret in config' }],
};

class QuietRepoIntel implements RepoIntel {
  async indexRepo(): Promise<IndexResult> {
    throw new Error('not used in this fixture');
  }
  async refreshIndex(): Promise<IndexResult> {
    throw new Error('not used in this fixture');
  }
  async getIndexState(repoId: string): Promise<IndexState> {
    return {
      repoId,
      status: 'full',
      filesIndexed: 1,
      filesSkipped: 0,
      durationMs: 1,
      lastIndexedSha: 'a1b2c3d4',
      indexerVersion: 2,
      updatedAt: new Date(),
      degraded: false,
    };
  }
  async getBlastRadius(): Promise<BlastResult> {
    return { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: false };
  }
  async getRepoMap(): Promise<RepoMapResult> {
    return { text: '', tokens: 0, cached: false, degraded: true, reason: 'no_data' };
  }
  async getFileRank(): Promise<FileRankRow[]> {
    return [];
  }
  async getSymbolsInFiles(): Promise<SymbolRow[]> {
    return [];
  }
  async getCallerSignatures(): Promise<SignatureRow[]> {
    return [];
  }
  async getUnresolvedReferences(): Promise<RefRow[]> {
    return [];
  }
  async getConventionSamples(): Promise<string[]> {
    return [];
  }
  async getTopFilesByRank(): Promise<string[]> {
    return [];
  }
  async getCriticalPaths(): Promise<string[][]> {
    return [];
  }
}

d('PR Brief rate limit (Testcontainers pg)', () => {
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

  async function appAndPr() {
    // Mock under EVERY provider id: risk_brief resolves its model through the registry.
    const llm = new MockLLMProvider('openai', { structuredBySchema: { PrBriefModelAnswer: ANSWER } });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        // The mock's default detail reports head a1b2c3d4 and one file, src/config.ts.
        github: new MockGitHubClient(),
        repoIntel: new QuietRepoIntel(),
        repoDocs: new MockRepoDocs(),
        llm: { openai: llm, anthropic: llm, openrouter: llm },
      },
    });
    const name = `brief-rl-${randomUUID().slice(0, 8)}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath: `/mock/clone/${name}` })
      .returning();
    const [pr] = await pg.handle.db
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
        additions: 4,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'Adds a limiter.',
      })
      .returning();
    return { app, llm, pr: pr! };
  }

  it('AC-12: the 11th POST within a minute answers 429, the first ten do not', async () => {
    const { app, pr } = await appAndPr();

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
      statuses.push(res.statusCode);
    }

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
    await app.close();
  });

  it('AC-12: the limit is per caller, so another address can still generate after the first is limited', async () => {
    const { app, pr } = await appAndPr();
    for (let i = 0; i < 10; i++) {
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    }
    const limited = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(limited.statusCode).toBe(429);

    const other = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief`, remoteAddress: '10.9.8.7' });

    expect(other.statusCode).toBe(200);
    await app.close();
  });

  it('AC-12: reading is not limited, even for a caller whose POST is already limited', async () => {
    const { app, pr } = await appAndPr();
    for (let i = 0; i < 11; i++) {
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    }

    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
      statuses.push(res.statusCode);
    }

    expect(statuses).toEqual(Array(20).fill(200));
    await app.close();
  });
});
