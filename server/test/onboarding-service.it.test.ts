import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
import { TimeoutError } from '../src/platform/resilience.js';
import { MockGitClient, MockGitHubClient, MockEmbedder, MockLLMProvider } from '../src/adapters/mocks.js';
import { buildOnboardingService } from '../src/modules/onboarding/wiring.js';
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
 * Red-first for SPEC-2026-10-02-onboarding-tour, service level on the
 * testcontainer DB: AC-13, 17, 18, 23, 24, 25 and the two "test first" rows of
 * plan step 8 (repo deleted mid-generation, provider resolution failure).
 * `buildOnboardingService` does not exist yet.
 *
 * Time: a test-local ManualClock supplies `opts.deadline` and the RetryingLLM's
 * sleeps. `vi.useFakeTimers` is not used: it breaks postgres-js
 * (plan, notes on this file).
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () =>
  loadConfig({ ...process.env, NODE_ENV: 'test', REPO_INTEL_ENABLED: 'true' } as NodeJS.ProcessEnv);

// ---------- manual clock ----------

class ManualClock {
  private nowMs = 0;
  private timers: { at: number; fire: () => void }[] = [];
  sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      this.timers.push({ at: this.nowMs + ms, fire: resolve });
    });
  /** Same signature as the `deadline` port: reject with TimeoutError once `ms` have been advanced. */
  deadline = <T>(p: Promise<T>, ms: number): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      p.then(resolve, reject);
      this.timers.push({ at: this.nowMs + ms, fire: () => reject(new TimeoutError(ms)) });
    });
  /** Move time forward, firing due timers in order and letting promise chains settle between them. */
  async advance(ms: number) {
    const target = this.nowMs + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at);
      const next = this.timers[0];
      if (!next || next.at > target) break;
      this.timers.shift();
      this.nowMs = next.at;
      next.fire();
      await new Promise((r) => setImmediate(r));
    }
    this.nowMs = target;
  }
}

// ---------- LLM doubles ----------

type LlmOut = {
  overview: string;
  diagram: string | null;
  file_reasons: { path: string; reason: string }[];
  command_notes: { command: string; note: string }[];
  first_tasks: { title: string; path: string; reason: string }[];
};
const OUT: LlmOut = { overview: 'A payments API.', diagram: null, file_reasons: [], command_notes: [], first_tasks: [] };

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
/** Returns data that fails `OnboardingLlmOutput`. */
class MalformedLLM extends PricedLLM {
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    return {
      data: { overview: 42, nonsense: true } as unknown as T,
      model: req.model,
      tokensIn: 500,
      tokensOut: 20,
      costUsd: 0.0001,
      raw: '',
      attempts: 1,
    };
  }
}
class NeverLLM extends PricedLLM {
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    return new Promise<StructuredResult<T>>(() => {});
  }
}
/** Models the provider's own retry loop: two 60 s waits on the manual clock before answering. */
class RetryingLLM extends PricedLLM {
  constructor(private clock: ManualClock) {
    super();
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    await this.clock.sleep(60_000);
    await this.clock.sleep(60_000);
    return {
      data: OUT as unknown as T,
      model: req.model,
      tokensIn: 1,
      tokensOut: 1,
      costUsd: 0.5,
      raw: '',
      attempts: 2,
    };
  }
}
class GatedLLM extends PricedLLM {
  private gate: Promise<void>;
  release!: () => void;
  constructor() {
    super();
    this.gate = new Promise<void>((r) => (this.release = r));
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    await this.gate;
    return {
      data: OUT as unknown as T,
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
      ranked?: RankedFileRow[];
      throwOn?: 'state' | 'ranked';
    } = {},
  ) {}
  async indexRepo(): Promise<IndexResult> {
    throw new Error('not used');
  }
  async refreshIndex(): Promise<IndexResult> {
    throw new Error('not used');
  }
  async getIndexState(repoId: string): Promise<IndexState> {
    if (this.o.throwOn === 'state') throw new Error('index state unreadable');
    return {
      repoId,
      status: this.o.status ?? 'full',
      filesIndexed: this.o.filesIndexed ?? 0,
      filesSkipped: 0,
      durationMs: 10,
      lastIndexedSha: 'c6af1e45',
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
    return [];
  }
  async getRankedFiles(): Promise<RankedFileRow[]> {
    if (this.o.throwOn === 'ranked') throw new Error('ranking unreadable');
    return this.o.ranked ?? [];
  }
  async getRoutes(): Promise<string[]> {
    return [];
  }
}

// ---------- clones ----------

const tmpDirs: string[] = [];
async function makeClone(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'onboarding-svc-'));
  tmpDirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content);
  }
  return root;
}
const CLONE = {
  'src/a.ts': 'export const a = 1;\n',
  'src/b.ts': 'export const b = 2;\n',
  'package.json': JSON.stringify({ name: 'x', scripts: { dev: 'tsx src/a.ts', test: 'vitest run' } }),
  'pnpm-lock.yaml': 'lockfileVersion: 9\n',
};

async function until(cond: () => boolean | Promise<boolean>, what: string, ms = 10_000) {
  const start = Date.now();
  while (!(await cond())) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

d('OnboardingService (Testcontainers pg)', () => {
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

  function appWith(
    llm: MockLLMProvider | undefined,
    repoIntel: RepoIntel = new FakeRepoIntel({ filesIndexed: 2 }),
  ) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        repoIntel,
        // No key anywhere: an unregistered provider must fail, never reach the network.
        secrets: { get: async () => undefined },
        // Registered under EVERY provider id (server/INSIGHTS.md 2026-09-20).
        llm: llm
          ? Object.fromEntries((['openai', 'anthropic', 'openrouter'] as const).map((id) => [id, llm]))
          : {},
      },
    });
  }
  type App = Awaited<ReturnType<typeof appWith>>;

  function logs() {
    return { info: vi.fn(), error: vi.fn() };
  }

  let seq = 0;
  async function addRepo(files: Record<string, string> = CLONE) {
    const name = `svc-${seq++}-${randomUUID().slice(0, 6)}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        clonePath: await makeClone(files),
      })
      .returning();
    return repo!;
  }

  const tourOf = async (svc: { read: (ws: string, id: string) => Promise<any> }, id: string) =>
    (await svc.read(workspaceId, id)).tour;

  // ----- AC-13 -----
  it('one log line with llm_calls=1, tokens 1200/300, $0.0021, complete', async () => {
    const app = await appWith(new PricedLLM(1200, 300, 0.0021));
    const repo = await addRepo();
    const log = logs();
    const svc = buildOnboardingService(app.container, log);

    await svc.generate(workspaceId, repo.id);

    expect(log.info).toHaveBeenCalledTimes(1);
    const line = String(log.info.mock.calls[0]![0]);
    expect(line).toContain(repo.fullName);
    expect(line).toContain('llm_calls=1');
    expect(line).toContain('tokens 1200/300');
    expect(line).toContain('$0.0021');
    expect(line).toContain('outcome=complete');
    await app.close();
  });

  it('null price → —', async () => {
    const app = await appWith(new PricedLLM(1200, 300, null));
    const repo = await addRepo();
    const log = logs();
    const svc = buildOnboardingService(app.container, log);

    await svc.generate(workspaceId, repo.id);

    expect(log.info).toHaveBeenCalledTimes(1);
    const line = String(log.info.mock.calls[0]![0]);
    expect(line).toContain('llm_calls=1');
    expect(line).toContain('tokens 1200/300');
    expect(line).toContain('—');
    expect(line).not.toMatch(/\$\d/);
    await app.close();
  });

  // ----- AC-17 -----
  it('throw and malformed → skeleton llm_failed, calls 1', async () => {
    for (const llm of [new ThrowingLLM(), new MalformedLLM()]) {
      const app = await appWith(llm);
      const repo = await addRepo();
      const log = logs();
      const svc = buildOnboardingService(app.container, log);

      await svc.generate(workspaceId, repo.id);

      expect(llm.structuredCalls).toBe(1);
      const tour = await tourOf(svc, repo.id);
      expect(tour).toMatchObject({ source: 'skeleton', skeleton_reason: 'llm_failed', llm: { calls: 1 } });
      expect(String(log.info.mock.calls[0]![0])).toContain('outcome=llm_failed');
      await app.close();
    }
  });

  // ----- AC-18 -----
  it('never-resolving and retried-60 s mocks → timed_out, cost null, one log line, ready', async () => {
    const llms: [string, (c: ManualClock) => PricedLLM][] = [
      ['never resolves', () => new NeverLLM()],
      ['two 60 s waits inside the provider', (c) => new RetryingLLM(c)],
    ];
    for (const [label, make] of llms) {
      const clock = new ManualClock();
      const llm = make(clock);
      const app = await appWith(llm);
      const repo = await addRepo();
      const log = logs();
      const svc = buildOnboardingService(app.container, log, { deadline: clock.deadline });

      const running = svc.generate(workspaceId, repo.id);
      await until(() => llm.structuredCalls === 1, `${label}: the call to reach the LLM`);
      await clock.advance(90_000);
      await running;

      const view = await svc.read(workspaceId, repo.id);
      expect(view.state).toBe('ready');
      expect(view.tour).toMatchObject({
        source: 'skeleton',
        skeleton_reason: 'timed_out',
        llm: { calls: 1 },
      });
      expect(view.tour.llm.cost_usd ?? null).toBeNull();
      expect(log.info).toHaveBeenCalledTimes(1);
      expect(String(log.info.mock.calls[0]![0])).toContain('outcome=timed_out');
      await app.close();
    }
  });

  // ----- AC-23 -----
  it('index read throws → ready skeleton, reason error, 0 calls, error log, health 200', async () => {
    const llm = new PricedLLM();
    const app = await appWith(llm, new FakeRepoIntel({ filesIndexed: 2, throwOn: 'state' }));
    const repo = await addRepo();
    const log = logs();
    const svc = buildOnboardingService(app.container, log);

    await svc.generate(workspaceId, repo.id);

    const view = await svc.read(workspaceId, repo.id);
    expect(view.state).toBe('ready');
    expect(view.tour).toMatchObject({ source: 'skeleton', skeleton_reason: 'error', llm: { calls: 0 } });
    expect(llm.structuredCalls).toBe(0);
    expect(log.error).toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(String(log.info.mock.calls[0]![0])).toContain('outcome=error');

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    await app.close();
  });

  // ----- AC-24 -----
  it('recreated service never reads generating', async () => {
    const app = await appWith(new PricedLLM());
    const repo = await addRepo();

    // Held: `start` marks the repo in flight but the task never runs.
    const held = buildOnboardingService(app.container, logs(), { background: () => {} });
    expect(await held.start(workspaceId, repo.id)).toEqual({ state: 'generating' });
    expect((await held.read(workspaceId, repo.id)).state).toBe('generating');

    // "Restart": a new service instance, no in-flight set.
    const restarted = buildOnboardingService(app.container, logs());
    const empty = await restarted.read(workspaceId, repo.id);
    expect(empty.state).toBe('none');
    expect(empty.tour).toBeNull();

    // With a previous tour, the restarted service shows it.
    await restarted.generate(workspaceId, repo.id);
    const previous = await tourOf(restarted, repo.id);
    const held2 = buildOnboardingService(app.container, logs(), { background: () => {} });
    await held2.start(workspaceId, repo.id);
    const afterRestart = buildOnboardingService(app.container, logs());
    const view = await afterRestart.read(workspaceId, repo.id);
    expect(view.state).toBe('ready');
    expect(view.tour).toEqual(previous);
    await app.close();
  });

  // ----- AC-25 -----
  it('failed regenerate keeps LLM tour, records last_failure, logs llm_failed', async () => {
    const good = await appWith(new PricedLLM());
    const repo = await addRepo();
    const first = buildOnboardingService(good.container, logs());
    await first.generate(workspaceId, repo.id);
    const original = await tourOf(first, repo.id);
    expect(original.source).toBe('llm');
    await good.close();

    const failing = new ThrowingLLM();
    const bad = await appWith(failing);
    const log = logs();
    const second = buildOnboardingService(bad.container, log);
    await second.generate(workspaceId, repo.id);

    expect(failing.structuredCalls).toBe(1);
    const kept = await tourOf(second, repo.id);
    // unchanged apart from last_failure — including generated_at and source
    expect({ ...kept, last_failure: null }).toEqual({ ...original, last_failure: null });
    expect(kept.source).toBe('llm');
    expect(kept.generated_at).toBe(original.generated_at);
    expect(kept.last_failure).toMatchObject({ reason: 'llm_failed', llm: { calls: 1 } });
    expect(kept.last_failure.at).toEqual(expect.any(String));
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(String(log.info.mock.calls[0]![0])).toContain('outcome=llm_failed');
    await bad.close();
  });

  // ----- plan step 8, "test first" rows -----
  it('repo deleted mid-generation ends without persisting', async () => {
    const llm = new GatedLLM();
    const app = await appWith(llm);
    const repo = await addRepo();
    const log = logs();
    const svc = buildOnboardingService(app.container, log);

    const running = svc.generate(workspaceId, repo.id);
    await until(() => llm.structuredCalls === 1, 'the call to reach the LLM');
    await pg.handle.db.delete(t.repos).where(eq(t.repos.id, repo.id));
    llm.release();
    await expect(running).resolves.toBeUndefined();

    const rows = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repo.id));
    expect(rows).toEqual([]);
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(String(log.info.mock.calls[0]![0])).toContain('outcome=error');
    await app.close();
  });

  it('provider resolution failure → llm_failed with calls 0', async () => {
    // No provider registered and no key in the secrets store: resolving the
    // provider throws before any request is sent.
    const app = await appWith(undefined);
    const repo = await addRepo();
    const log = logs();
    const svc = buildOnboardingService(app.container, log);

    await svc.generate(workspaceId, repo.id);

    const tour = await tourOf(svc, repo.id);
    expect(tour).toMatchObject({ source: 'skeleton', skeleton_reason: 'llm_failed', llm: { calls: 0 } });
    expect(String(log.info.mock.calls[0]![0])).toContain('llm_calls=0');
    await app.close();
  });
});
