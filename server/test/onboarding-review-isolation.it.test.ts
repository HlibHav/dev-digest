import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockEmbedder, MockLLMProvider } from '../src/adapters/mocks.js';
import { buildOnboardingService } from '../src/modules/onboarding/wiring.js';
import type { StructuredRequest, StructuredResult, Review } from '@devdigest/shared';
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
 * Red-first for AC-16 of SPEC-2026-10-02-onboarding-tour: no part of a tour
 * reaches any review prompt.
 *
 * The tour is generated THROUGH `buildOnboardingService(...).generate` (a row
 * inserted straight into the table would pass today, which proves nothing),
 * then a PR in the same repo is reviewed with a capturing LLM. The marker must
 * be in the stored tour (control) and in none of the prompts the review sent.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () =>
  loadConfig({ ...process.env, NODE_ENV: 'test', REPO_INTEL_ENABLED: 'true' } as NodeJS.ProcessEnv);

const MARKER = 'ONBOARDING-TOUR-MARKER-7f3a91c2';

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

/** Answers the tour call with an overview that holds the marker. */
class PricedLLM extends MockLLMProvider {
  constructor() {
    super('openai');
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    return {
      data: {
        overview: `This repo is described by ${MARKER}.`,
        diagram: null,
        file_reasons: [],
        command_notes: [],
        first_tasks: [],
      } as unknown as T,
      model: req.model,
      tokensIn: 1200,
      tokensOut: 300,
      costUsd: 0.0021,
      raw: '',
      attempts: 1,
    };
  }
}

class FakeRepoIntel implements RepoIntel {
  async indexRepo(): Promise<IndexResult> {
    throw new Error('not used');
  }
  async refreshIndex(): Promise<IndexResult> {
    throw new Error('not used');
  }
  async getIndexState(repoId: string): Promise<IndexState> {
    return {
      repoId,
      status: 'full',
      filesIndexed: 1,
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
    return [];
  }
  async getRoutes(): Promise<string[]> {
    return [];
  }
}

const tmpDirs: string[] = [];

d('Onboarding tour stays out of review prompts (Testcontainers pg)', () => {
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

  function appWith(llm: MockLLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        repoIntel: new FakeRepoIntel(),
        // Registered under every provider id: the review and its intent call
        // may resolve any of them (server/INSIGHTS.md 2026-09-20).
        llm: Object.fromEntries((['openai', 'anthropic', 'openrouter'] as const).map((id) => [id, llm])),
      },
    });
  }

  it('tour marker never reaches a review prompt', async () => {
    // 1. A cloned repo whose tour is generated through the real service.
    const root = await mkdtemp(join(tmpdir(), 'onboarding-iso-'));
    tmpDirs.push(root);
    const cfg = join(root, 'src/config.ts');
    await mkdir(dirname(cfg), { recursive: true });
    await writeFile(cfg, 'export const port = 3000;\n');

    const name = `iso-${randomUUID().slice(0, 6)}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath: root })
      .returning();

    const tourApp = await appWith(new PricedLLM());
    const svc = buildOnboardingService(tourApp.container, { info: () => {}, error: () => {} });
    await svc.generate(workspaceId, repo!.id);
    const view = await svc.read(workspaceId, repo!.id);
    // control: the marker really is in the stored tour
    expect(view.state).toBe('ready');
    expect(JSON.stringify(view.tour)).toContain(MARKER);
    await tourApp.close();

    // 2. Review a PR in that repo with a capturing mock.
    const capture = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(capture);
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
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'Add rate limiting.',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr!.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1 });

    // control: the review really called the model, so "marker absent" is not vacuous
    const reviewCalls = capture.calls.filter((c) => c.method === 'completeStructured');
    expect(reviewCalls.length).toBeGreaterThanOrEqual(1);
    for (const call of capture.calls) {
      expect(JSON.stringify(call.req)).not.toContain(MARKER);
    }
    await app.close();
  });
});
