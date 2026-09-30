import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { BlastRadius } from '@devdigest/shared';
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
 * Red-first for homework-5 (docs/homework-5/plan.md), AC5, AC11, AC15, AC19,
 * AC20. Uses a test-local fake `RepoIntel` through `ContainerOverrides.repoIntel`
 * (mirrors `server/test/smart-diff.it.test.ts`'s harness) and the existing
 * `MockGitHubClient` from `src/adapters/mocks.ts`. `GET /pulls/:id/blast`
 * doesn't exist yet, so every request here 404s until the implementer wires
 * `server/src/modules/blast/routes.ts`.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

class FakeRepoIntel implements RepoIntel {
  public blastCalls: { repoId: string; changedFiles: string[] }[] = [];
  public indexStateCalls: string[] = [];

  constructor(
    private blastResult: BlastResult,
    private indexState: IndexState,
  ) {}

  async indexRepo(): Promise<IndexResult> {
    throw new Error('not used in this fixture');
  }
  async refreshIndex(): Promise<IndexResult> {
    throw new Error('not used in this fixture');
  }
  async getIndexState(repoId: string): Promise<IndexState> {
    this.indexStateCalls.push(repoId);
    return this.indexState;
  }
  async getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastResult> {
    this.blastCalls.push({ repoId, changedFiles });
    return this.blastResult;
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

function fullIndexState(repoId: string): IndexState {
  return {
    repoId,
    status: 'full',
    filesIndexed: 10,
    filesSkipped: 0,
    durationMs: 100,
    lastIndexedSha: 'c6af1e45',
    indexerVersion: 2,
    updatedAt: new Date(),
    degraded: false,
  };
}

d('Blast Radius route (Testcontainers pg)', () => {
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

  function appWith(repoIntel: RepoIntel, github: MockGitHubClient = new MockGitHubClient()) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        llm: { openai: new MockLLMProvider('openai', { structured: {} }) },
        repoIntel,
        github,
      },
    });
  }

  async function setupPr(withFiles: boolean) {
    // Each call needs its own repo row — `repos_ws_fullname_uq` rejects a
    // second 'HlibHav/dev-digest' in the same workspace, and every `it()`
    // here calls setupPr() once.
    const name = `dev-digest-${randomUUID()}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'HlibHav', name, fullName: `HlibHav/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 27,
        title: 'Blast fixture',
        author: 'marisa.koch',
        branch: 'feat/blast',
        base: 'main',
        headSha: 'c6af1e45',
        additions: 10,
        deletions: 2,
        filesCount: withFiles ? 1 : 0,
        status: 'needs_review',
      })
      .returning();
    if (withFiles) {
      await pg.handle.db.insert(t.prFiles).values([
        { prId: pr!.id, path: 'server/src/modules/settings/helpers.ts', additions: 3, deletions: 1 },
      ]);
    }
    return { repo: repo!, pr: pr! };
  }

  it('maps a PR #27-shaped index result: ≥2 callers in ≥2 files, ≥1 endpoint', async () => {
    const { pr, repo } = await setupPr(true);
    const blastResult: BlastResult = {
      changedSymbols: [
        { file: 'server/src/modules/settings/helpers.ts', name: 'rowsToSettings', kind: 'function' },
      ],
      callers: [
        {
          file: 'server/src/modules/settings/routes.ts',
          symbol: 'GET /settings',
          viaSymbol: 'rowsToSettings',
          line: 34,
          rank: 5,
        },
        {
          file: 'server/src/modules/settings/feature-models.ts',
          symbol: 'resolveFeatureModel',
          viaSymbol: 'rowsToSettings',
          line: 45,
          rank: 3,
        },
      ],
      impactedEndpoints: ['GET /settings', 'GET /settings/secrets-status', 'PUT /settings'],
      factsByFile: {
        'server/src/modules/settings/routes.ts': {
          endpoints: ['GET /settings', 'GET /settings/secrets-status', 'PUT /settings'],
          crons: [],
        },
        'server/src/modules/settings/feature-models.ts': { endpoints: [], crons: [] },
      },
      degraded: false,
    };
    const repoIntel = new FakeRepoIntel(blastResult, fullIndexState(repo.id));
    const app = await appWith(repoIntel);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const group = body.downstream.find((d: { symbol: string }) => d.symbol === 'rowsToSettings');
    expect(group).toBeDefined();
    expect(group.callers.length).toBeGreaterThanOrEqual(2);
    expect(new Set(group.callers.map((c: { file: string }) => c.file)).size).toBeGreaterThanOrEqual(2);
    expect(group.endpoints_affected.length).toBeGreaterThanOrEqual(1);

    await app.close();
  });

  it('200 body parses as BlastRadius', async () => {
    const { pr, repo } = await setupPr(true);
    const repoIntel = new FakeRepoIntel(
      {
        changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }],
        callers: [{ file: 'c1.ts', symbol: 'caller', viaSymbol: 'foo', line: 1, rank: 1 }],
        impactedEndpoints: [],
        degraded: false,
      },
      fullIndexState(repo.id),
    );
    const app = await appWith(repoIntel);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    expect(() => BlastRadius.parse(res.json())).not.toThrow();

    await app.close();
  });

  it('a non-contract body is refused with 500', async () => {
    const { pr, repo } = await setupPr(true);
    const repoIntel = new FakeRepoIntel(
      {
        changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }],
        // A non-integer line breaks BlastCaller's `line: z.number().int()`.
        callers: [{ file: 'c1.ts', symbol: 'caller', viaSymbol: 'foo', line: 1.5, rank: 1 }],
        impactedEndpoints: [],
        degraded: false,
      },
      fullIndexState(repo.id),
    );
    const app = await appWith(repoIntel);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('internal_error');

    await app.close();
  });

  it('degraded fields reach the response', async () => {
    const { pr, repo } = await setupPr(true);
    const repoIntel = new FakeRepoIntel(
      {
        changedSymbols: [],
        callers: [],
        impactedEndpoints: [],
        degraded: true,
        reason: 'repo_too_large',
      },
      fullIndexState(repo.id),
    );
    const app = await appWith(repoIntel);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.degraded).toBe(true);
    expect(body.reason).toBe('repo_too_large');

    await app.close();
  });

  it('unknown PR → 404', async () => {
    const repoIntel = new FakeRepoIntel(
      { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: false },
      fullIndexState('00000000-0000-0000-0000-000000000000'),
    );
    const app = await appWith(repoIntel);

    const res = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-0000-0000-000000000000/blast',
    });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('PR in another workspace → 404', async () => {
    // AC19 (docs/homework-5/plan.md:50): the route 404s "for an unknown PR id
    // and for a PR in another workspace". `store.getPull` is workspace-scoped
    // (server/src/modules/reviews/repository/pull.repo.ts:9-19), so a PR that
    // exists but belongs to a different workspace must look exactly like an
    // unknown one — and the facade must never be reached for it.
    const repoIntel = new FakeRepoIntel(
      { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: false },
      fullIndexState('00000000-0000-0000-0000-000000000000'),
    );
    const app = await appWith(repoIntel);

    const [otherWorkspace] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `blast-other-workspace-${randomUUID()}` })
      .returning();
    const otherName = `dev-digest-other-${randomUUID()}`;
    const [foreignRepo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId: otherWorkspace!.id,
        owner: 'HlibHav',
        name: otherName,
        fullName: `HlibHav/${otherName}`,
      })
      .returning();
    const [foreignPr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: otherWorkspace!.id,
        repoId: foreignRepo!.id,
        number: 27,
        title: 'Foreign workspace PR',
        author: 'marisa.koch',
        branch: 'feat/blast',
        base: 'main',
        headSha: 'c6af1e45',
        additions: 10,
        deletions: 2,
        filesCount: 0,
        status: 'needs_review',
      })
      .returning();

    const res = await app.inject({ method: 'GET', url: `/pulls/${foreignPr!.id}/blast` });
    expect(res.statusCode).toBe(404);
    expect(repoIntel.blastCalls).toEqual([]);

    await app.close();
  });

  it('a never-opened PR is refreshed from GitHub before the read', async () => {
    const { pr, repo } = await setupPr(false); // no pr_files rows
    const repoIntel = new FakeRepoIntel(
      { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: false },
      fullIndexState(repo.id),
    );
    // MockGitHubClient's default getPullRequest() returns one file,
    // 'src/config.ts' — that is what the refresh should persist and pass on.
    const app = await appWith(repoIntel, new MockGitHubClient());

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);

    const files = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr.id));
    expect(files.map((f) => f.path)).toEqual(['src/config.ts']);

    expect(repoIntel.blastCalls).toEqual([{ repoId: repo.id, changedFiles: ['src/config.ts'] }]);

    await app.close();
  });
});
