/**
 * Onboarding Tour, step 4: the two facade reads the tour needs.
 *   - getRankedFiles: file_rank joined with in-degree (distinct importers) and junk flag.
 *   - getRoutes: "METHOD /path" strings from file_facts, deduped, sorted, limited.
 * Runs on the testcontainer DB through the real RepoIntelService (needs Docker).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('repo-intel reads for the onboarding tour (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repoId: string;
  let intel: RepoIntel;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'tour', fullName: 'acme/tour' })
      .returning();
    repoId = repo!.id;

    const app = await buildApp({
      config: loadConfig({
        ...process.env,
        NODE_ENV: 'test',
        REPO_INTEL_ENABLED: 'true',
      } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: '' }) },
    });
    intel = app.container.repoIntel;

    const rank = (filePath: string, r: number) => ({
      repoId,
      filePath,
      pagerank: r,
      hotness: 0,
      rank: r,
      percentile: 50,
    });
    await pg.handle.db
      .insert(t.fileRank)
      .values([rank('src/a.ts', 0.5), rank('src/a.test.ts', 0.2), rank('src/b.ts', 0.2)]);
    const edge = (fromFile: string, toFile: string) => ({ repoId, fromFile, toFile });
    await pg.handle.db
      .insert(t.fileEdges)
      .values([edge('src/b.ts', 'src/a.ts'), edge('src/a.test.ts', 'src/a.ts')]);
    await pg.handle.db.insert(t.fileFacts).values([
      { repoId, filePath: 'src/r1.ts', endpoints: ['POST /b', 'GET /a'], crons: [] },
      { repoId, filePath: 'src/r2.ts', endpoints: ['GET /a', 'GET /c'], crons: [] },
    ]);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('getRankedFiles returns pagerank, hotness, in-degree and junk', async () => {
    const rows = await intel.getRankedFiles(repoId);
    expect(rows.map((r) => r.path)).toEqual(['src/a.ts', 'src/a.test.ts', 'src/b.ts']);
    const a = rows.find((r) => r.path === 'src/a.ts')!;
    expect(a.importers).toBe(2);
    expect(a.pagerank).toBe(0.5);
    expect(a.hotness).toBe(0);
    expect(a.junk).toBe(false);
    const test = rows.find((r) => r.path === 'src/a.test.ts')!;
    expect(test.junk).toBe(true);
    expect(test.importers).toBe(0);
  });

  it('getRoutes dedups and sorts', async () => {
    expect(await intel.getRoutes(repoId, 10)).toEqual(['GET /a', 'GET /c', 'POST /b']);
    expect(await intel.getRoutes(repoId, 2)).toEqual(['GET /a', 'GET /c']);
  });
});
