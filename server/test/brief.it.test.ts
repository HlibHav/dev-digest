import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockRepoDocs,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { StructuredRequest, StructuredResult, PrDetail, IssueMeta, RepoRef } from '@devdigest/shared';
import type {
  RepoIntel,
  BlastResult,
  IndexState,
  IndexStatus,
  IndexResult,
  RepoMapResult,
  FileRankRow,
  SymbolRow,
  SignatureRow,
  RefRow,
} from '../src/modules/repo-intel/types.js';

/**
 * Red-first integration suite for PR Brief (docs/plans/2026-10-03-pr-brief.md,
 * step 9, I1): AC-1..AC-6, AC-8..AC-11, AC-13, AC-14, AC-16, AC-17, AC-19,
 * AC-23..AC-27, AC-29, AC-31..AC-33, AC-35 plus cross-review cases XR-3, XR-4,
 * the zero-files case and AC-31's "stored brief untouched".
 *
 * Wiring assumptions (the implementer must match them):
 *  - routes: GET and POST /pulls/:id/brief, both answering `{ brief }`.
 *  - the model schema's `schemaName` is 'PrBriefModelAnswer' (BRIEF_SCHEMA_NAME).
 *  - the mock LLM is registered under EVERY provider id (server/INSIGHTS.md
 *    2026-09-20); AC-32 is the one deliberate exception.
 *  - blast comes from `overrides.repoIntel`, docs from `overrides.repoDocs`,
 *    GitHub from `overrides.github`, the token counter from `overrides.tokenizer`.
 *  - the `brief:` log line goes through `app.log.info(fields, message)`; the
 *    doc-path log line may use any level (info/warn/error/debug/trace) and any
 *    argument position, the test only looks for the path inside the log args.
 *  - log fields: prId, model, attempts, tokensIn, tokensOut, costUsd,
 *    inputTokens, truncatedInputs, droppedRisks, droppedFocus, outcome
 *    ('ok' | 'failed'), as the plan's BriefLogFields.
 *
 * Needs Docker; skipped by the Docker guard where there is none.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const SCHEMA_NAME = 'PrBriefModelAnswer';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// ------------------------------------------------------------------ fixtures

/** Hunk 1 touches new-side lines 4821-4827, hunk 2 line 9100. Trailing text and added text are sentinels. */
const LIMITER_PATCH =
  '@@ -4800,3 +4821,7 @@ function HUNK_TRAILER_SENTINEL() {\n' +
  ' context line\n' +
  '+ADDED_LINE_SENTINEL one\n' +
  '+ADDED_LINE_SENTINEL two\n' +
  '+more\n+more2\n+more3\n+more4\n' +
  ' context end\n' +
  '@@ -9000,2 +9100,1 @@\n' +
  '-removed\n' +
  '+REPLACED_LINE_SENTINEL';

const CONFIG_PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "x",\n   redisUrl: x,';

const LIMITER = { path: 'src/limiter.ts', additions: 37, deletions: 11, patch: LIMITER_PATCH };
const CONFIG = { path: 'src/config.ts', additions: 2, deletions: 0, patch: CONFIG_PATCH };

const ANSWER = {
  summary: 'Adds a token-bucket limiter to the public API.',
  risks: [
    {
      kind: 'regression',
      title: 'Limiter drops bursts',
      explanation: 'The refill maths can reject a legitimate burst.',
      severity: 'high',
      file_refs: ['src/limiter.ts'],
      line_refs: [{ file: 'src/limiter.ts', start_line: 4822, end_line: 4824 }],
    },
  ],
  review_focus: [{ file: 'src/limiter.ts', line: 4823, reason: 'Check the refill maths' }],
};

const BLAST_RESULT: BlastResult = {
  changedSymbols: [{ file: 'src/limiter.ts', name: 'rateLimit', kind: 'function' }],
  callers: [
    { file: 'src/callers/routes.ts', symbol: 'GET /things', viaSymbol: 'rateLimit', line: 34, rank: 5 },
  ],
  impactedEndpoints: [],
  degraded: false,
};

const INTENT_TEXT = 'INTENT-TEXT-SENTINEL adds a token-bucket limiter';

// ------------------------------------------------------------------- doubles

class FakeRepoIntel implements RepoIntel {
  public blastCalls: { repoId: string; changedFiles: string[] }[] = [];

  /** `results[i]` answers the (i+1)-th blast call, the last one answers the rest; an Error is thrown. */
  constructor(
    private results: (BlastResult | Error)[] = [BLAST_RESULT],
    private status: IndexStatus = 'full',
  ) {}

  async indexRepo(): Promise<IndexResult> {
    throw new Error('not used in this fixture');
  }
  async refreshIndex(): Promise<IndexResult> {
    throw new Error('not used in this fixture');
  }
  async getIndexState(repoId: string): Promise<IndexState> {
    return {
      repoId,
      status: this.status,
      filesIndexed: 10,
      filesSkipped: 0,
      durationMs: 100,
      lastIndexedSha: 'c6af1e45',
      indexerVersion: 2,
      updatedAt: new Date(),
      degraded: false,
    };
  }
  async getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastResult> {
    this.blastCalls.push({ repoId, changedFiles });
    const r = this.results[Math.min(this.blastCalls.length - 1, this.results.length - 1)]!;
    if (r instanceof Error) throw r;
    return r;
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

interface GitHubCfg {
  detail?: Partial<PrDetail>;
  failDetail?: boolean;
  issue?: Pick<IssueMeta, 'title' | 'body'>;
  failIssue?: boolean;
}

class TestGitHub extends MockGitHubClient {
  public prCalls = 0;
  public issueCalls: number[] = [];

  constructor(private cfg: GitHubCfg = {}) {
    super({ detail: cfg.detail });
  }
  override async getPullRequest(repo: RepoRef, n: number): Promise<PrDetail> {
    this.prCalls++;
    if (this.cfg.failDetail) throw new Error('github is down');
    return super.getPullRequest(repo, n);
  }
  override async getIssue(repo: RepoRef, n: number): Promise<IssueMeta> {
    this.issueCalls.push(n);
    if (this.cfg.failIssue) throw new Error('issue fetch failed');
    if (this.cfg.issue) return { number: n, state: 'open', ...this.cfg.issue };
    return super.getIssue(repo, n);
  }
}

/** Records every call (the mock only records calls that reach its own body) and always throws. */
class ThrowingLLM extends MockLLMProvider {
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    throw new Error('model exploded');
  }
}

class NullCostLLM extends MockLLMProvider {
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const r = await super.completeStructured(req);
    return { ...r, costUsd: null };
  }
}

/** Holds the model call until `open()`; `entered` counts calls that reached the model. */
class GatedLLM extends MockLLMProvider {
  public entered = 0;
  open!: () => void;
  private gate = new Promise<void>((resolve) => {
    this.open = resolve;
  });
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.entered++;
    await this.gate;
    return super.completeStructured(req);
  }
}

class RecordingDocs extends MockRepoDocs {
  public roots: string[] = [];
  override async read(root: string, path: string): Promise<string | null> {
    this.roots.push(root);
    return super.read(root, path);
  }
}

// --------------------------------------------------------------------- tests

d('PR Brief routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  // Settings and agent attachments are workspace-wide: reset them so a test
  // never sees another test's model choice or attached docs.
  beforeEach(async () => {
    await pg.handle.db
      .delete(t.settings)
      .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, 'feature_models')));
    await pg.handle.db.delete(t.agentContextDocs);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  type Llm = MockLLMProvider;
  const mockLlm = (answer: unknown = ANSWER): Llm =>
    new MockLLMProvider('openai', { structuredBySchema: { [SCHEMA_NAME]: answer } });

  function appWith(
    o: {
      llm?: Llm;
      github?: MockGitHubClient;
      repoIntel?: RepoIntel;
      repoDocs?: MockRepoDocs;
      tokenizer?: { count(text: string): number };
    } = {},
  ) {
    const llm = o.llm ?? mockLlm();
    const github = o.github ?? new TestGitHub({ detail: { head_sha: 'aaa' } });
    const repoIntel = o.repoIntel ?? new FakeRepoIntel();
    const repoDocs = o.repoDocs ?? new MockRepoDocs();
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        github,
        repoIntel,
        repoDocs,
        ...(o.tokenizer ? { tokenizer: o.tokenizer } : {}),
        llm: { openai: llm, anthropic: llm, openrouter: llm },
      },
    }).then((app) => ({ app, llm, github, repoIntel, repoDocs }));
  }

  async function setupPr(
    o: {
      headSha?: string;
      body?: string | null;
      title?: string;
      files?: { path: string; additions: number; deletions: number; patch: string }[];
      withIntent?: boolean;
    } = {},
  ) {
    const name = `brief-${seq++}-${randomUUID().slice(0, 8)}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath: `/mock/clone/${name}` })
      .returning();
    const files = o.files ?? [LIMITER, CONFIG];
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 482,
        title: o.title ?? 'TITLE-SENTINEL Add rate limiting',
        author: 'AUTHOR-SENTINEL',
        branch: 'BRANCH-SENTINEL',
        base: 'main',
        headSha: o.headSha ?? 'aaa',
        additions: 39,
        deletions: 11,
        filesCount: files.length,
        status: 'needs_review',
        body: o.body === undefined ? 'STORED-DESC-SENTINEL adds a limiter.' : o.body,
      })
      .returning();
    if (files.length > 0) {
      await pg.handle.db.insert(t.prFiles).values(files.map((f) => ({ prId: pr!.id, ...f })));
    }
    if (o.withIntent) {
      await pg.handle.db.insert(t.prIntent).values({
        prId: pr!.id,
        intent: INTENT_TEXT,
        inScope: ['SCOPE-IN-SENTINEL'],
        outOfScope: ['SCOPE-OUT-SENTINEL'],
        changeType: 'feature',
        confidence: 'high',
        sources: [],
        model: 'INTENT-MODEL-SENTINEL',
        headSha: o.headSha ?? 'aaa',
        inputHash: 'INTENT-HASH-SENTINEL',
      });
    }
    return { repo: repo!, pr: pr! };
  }

  async function makeAgent(paths: string[], createdAt: Date) {
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: `agent-${randomUUID()}`,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        systemPrompt: 'review',
        createdAt,
      })
      .returning();
    if (paths.length > 0) {
      await pg.handle.db
        .insert(t.agentContextDocs)
        .values(paths.map((path, order) => ({ agentId: a!.id, path, order })));
    }
    return a!.id;
  }

  /** A valid stored `pr_brief.json` (what PrBrief parses). */
  function storedBrief(over: Record<string, unknown> = {}) {
    return {
      summary: 'Stored summary',
      intent: null,
      blast: null,
      risks: {
        risks: [
          {
            kind: 'regression',
            title: 'Stored risk',
            explanation: 'Because.',
            severity: 'medium',
            file_refs: ['src/limiter.ts'],
            line_refs: [{ file: 'src/limiter.ts', start_line: 4822, end_line: 4824 }],
          },
        ],
      },
      review_focus: [{ file: 'src/limiter.ts', line: 4823, reason: 'Look here' }],
      history: null,
      head_sha: 'aaa',
      generated_at: '2026-10-01T10:00:00.000Z',
      model: 'openrouter/openai/gpt-4.1-mini',
      tokens_in: 1200,
      tokens_out: 300,
      cost_usd: 0.014,
      missing_inputs: ['issue'],
      truncated_inputs: [],
      ...over,
    };
  }

  async function storeBrief(prId: string, json: unknown) {
    await pg.handle.db.insert(t.prBrief).values({ prId, json });
  }
  async function readStored(prId: string) {
    const rows = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    return rows.map((r) => r.json as Record<string, any>);
  }

  const get = (app: Awaited<ReturnType<typeof appWith>>['app'], prId: string) =>
    app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
  const post = (app: Awaited<ReturnType<typeof appWith>>['app'], prId: string) =>
    app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });

  const structuredCalls = (llm: Llm) => llm.calls.filter((c) => c.method === 'completeStructured');
  const messagesOf = (llm: Llm) =>
    (structuredCalls(llm)[0]!.req as StructuredRequest<unknown>).messages;
  const userText = (llm: Llm) => messagesOf(llm).find((m) => m.role === 'user')!.content;
  const allText = (llm: Llm) => messagesOf(llm).map((m) => m.content).join('\n');

  /** Capture every logger call at any level; returns the recorded argument lists. */
  function captureLogs(app: Awaited<ReturnType<typeof appWith>>['app']) {
    const lines: { level: string; args: unknown[] }[] = [];
    const log = app.log as unknown as Record<string, (...a: unknown[]) => void>;
    for (const level of ['info', 'warn', 'error', 'debug', 'trace'] as const) {
      vi.spyOn(log, level).mockImplementation((...args: unknown[]) => {
        lines.push({ level, args });
      });
    }
    const briefLines = () =>
      lines.filter((l) => l.args.some((a) => typeof a === 'string' && a.startsWith('brief:')));
    return { lines, briefLines };
  }

  // ---------------------------------------------------------------- AC-1..AC-4

  it('AC-1: GET with no stored brief answers 200 {brief:null} and makes no model call', async () => {
    const { app, llm } = await appWith();
    const { pr } = await setupPr();

    const res = await get(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ brief: null });
    expect(llm.calls).toHaveLength(0);
    await app.close();
  });

  it('AC-2: an unknown PR id answers 404 not_found on GET and POST with no model call and no refresh', async () => {
    const { app, llm, github } = await appWith();

    const g = await get(app, NIL_UUID);
    const p = await post(app, NIL_UUID);

    expect(g.statusCode).toBe(404);
    expect(g.json().error.code).toBe('not_found');
    expect(p.statusCode).toBe(404);
    expect(p.json().error.code).toBe('not_found');
    expect(llm.calls).toHaveLength(0);
    expect((github as TestGitHub).prCalls).toBe(0);
    await app.close();
  });

  it('AC-2: a PR of another workspace answers 404 not_found on GET and POST with no model call', async () => {
    const { app, llm } = await appWith();
    const [other] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `brief-other-${randomUUID()}` })
      .returning();
    const name = `brief-foreign-${randomUUID()}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: other!.id, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [foreign] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: other!.id,
        repoId: repo!.id,
        number: 9,
        title: 'Foreign',
        author: 'x',
        branch: 'b',
        base: 'main',
        headSha: 'aaa',
        additions: 1,
        deletions: 0,
        filesCount: 0,
        status: 'needs_review',
      })
      .returning();
    await storeBrief(foreign!.id, storedBrief());

    const g = await get(app, foreign!.id);
    const p = await post(app, foreign!.id);

    expect(g.statusCode).toBe(404);
    expect(g.json().error.code).toBe('not_found');
    expect(p.statusCode).toBe(404);
    expect(p.json().error.code).toBe('not_found');
    expect(llm.calls).toHaveLength(0);
    await app.close();
  });

  it('AC-3: a stored brief is read twice with the same body, stale false, and no model call', async () => {
    const { app, llm } = await appWith();
    const { pr } = await setupPr({ headSha: 'aaa' });
    const stored = storedBrief();
    await storeBrief(pr.id, stored);

    const first = await get(app, pr.id);
    const second = await get(app, pr.id);

    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ brief: { ...stored, stale: false } });
    expect(second.json()).toEqual(first.json());
    expect(llm.calls).toHaveLength(0);
    await app.close();
  });

  it('AC-4: stale is false while the PR head equals the brief head and true once the stored head moves', async () => {
    const { app } = await appWith();
    const { pr } = await setupPr({ headSha: 'aaa' });
    await storeBrief(pr.id, storedBrief({ head_sha: 'aaa' }));

    const before = await get(app, pr.id);
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'bbb' }).where(eq(t.pullRequests.id, pr.id));
    const after = await get(app, pr.id);

    expect(before.json().brief.stale).toBe(false);
    expect(after.json().brief.stale).toBe(true);
    expect(after.json().brief.head_sha).toBe('aaa');
    await app.close();
  });

  // ---------------------------------------------------------------- AC-5, AC-6

  it('AC-5: POST makes exactly one structured call with maxRetries 0, stores the result and answers it with stale false', async () => {
    const { app, llm } = await appWith();
    const { pr } = await setupPr();

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(llm.calls).toHaveLength(1);
    const call = structuredCalls(llm)[0]!.req as StructuredRequest<unknown>;
    expect(call.maxRetries).toBe(0);
    expect(call.schemaName).toBe(SCHEMA_NAME);
    expect(call.messages.map((m) => m.role)).toEqual(['system', 'user']);

    const { stale, ...body } = res.json().brief;
    expect(stale).toBe(false);
    expect(body.summary).toBe(ANSWER.summary);
    expect(body.risks.risks.map((r: { title: string }) => r.title)).toEqual(['Limiter drops bursts']);
    expect(body.review_focus).toEqual(ANSWER.review_focus);
    const rows = await readStored(pr.id);
    expect(rows).toEqual([body]);
    await app.close();
  });

  it('AC-6: the model comes from the risk_brief setting, and from the registry default once the setting is cleared', async () => {
    const { app, llm } = await appWith();
    const { pr } = await setupPr();

    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { risk_brief: { provider: 'anthropic', model: 'claude-brief-test' } } },
    });
    expect(put.statusCode).toBe(200);
    const chosen = await post(app, pr.id);
    expect((structuredCalls(llm)[0]!.req as StructuredRequest<unknown>).model).toBe('claude-brief-test');
    expect(chosen.json().brief.model).toBe('anthropic/claude-brief-test');

    await pg.handle.db
      .delete(t.settings)
      .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, 'feature_models')));
    const defaulted = await post(app, pr.id);
    expect((structuredCalls(llm)[1]!.req as StructuredRequest<unknown>).model).toBe('openai/gpt-4.1-mini');
    expect(defaulted.json().brief.model).toBe('openrouter/openai/gpt-4.1-mini');
    await app.close();
  });

  // ------------------------------------------------- AC-8, AC-9, AC-9a, XR-4

  it('AC-8: a PR with no stored files gets its files refreshed first, and they reach the model', async () => {
    const github = new TestGitHub({ detail: { head_sha: 'aaa', files: [CONFIG] } });
    const { app, llm } = await appWith({ github });
    const { pr } = await setupPr({ files: [] });

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(userText(llm)).toContain('src/config.ts');
    const stored = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr.id));
    expect(stored.map((f) => f.path)).toEqual(['src/config.ts']);
    await app.close();
  });

  it('AC-9: the description is refreshed from GitHub before the model sees it', async () => {
    const github = new TestGitHub({ detail: { head_sha: 'aaa', body: 'FRESH-DESC-SENTINEL', files: [LIMITER] } });
    const { app, llm } = await appWith({ github });
    const { pr } = await setupPr({ body: 'STORED-DESC-SENTINEL' });

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(userText(llm)).toContain('FRESH-DESC-SENTINEL');
    expect(allText(llm)).not.toContain('STORED-DESC-SENTINEL');
    await app.close();
  });

  it('AC-9: when the GitHub refresh throws, the stored description is used and the answer is still 200', async () => {
    const github = new TestGitHub({ failDetail: true });
    const { app, llm } = await appWith({ github });
    const { pr } = await setupPr({ body: 'STORED-DESC-SENTINEL' });

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(github.prCalls).toBe(1);
    expect(userText(llm)).toContain('STORED-DESC-SENTINEL');
    await app.close();
  });

  it('AC-9a: a successful refresh stamps the refreshed head, and the model sees the refreshed files', async () => {
    const github = new TestGitHub({ detail: { head_sha: 'bbb', files: [{ ...CONFIG, path: 'src/fresh.ts' }] } });
    const { app, llm } = await appWith({ github });
    const { pr } = await setupPr({ headSha: 'aaa', files: [{ ...LIMITER, path: 'src/stored-only.ts' }] });

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(res.json().brief.head_sha).toBe('bbb');
    expect(userText(llm)).toContain('src/fresh.ts');
    expect(userText(llm)).not.toContain('src/stored-only.ts');
    await app.close();
  });

  it('AC-9a / XR-4: when the refresh throws, the brief is stamped with the stored head and the model input lists the stored files', async () => {
    const github = new TestGitHub({ failDetail: true });
    const { app, llm } = await appWith({ github });
    const { pr } = await setupPr({ headSha: 'aaa', files: [{ ...LIMITER, path: 'src/stored-only.ts' }] });

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(res.json().brief.head_sha).toBe('aaa');
    expect(userText(llm)).toContain('src/stored-only.ts');
    await app.close();
  });

  // -------------------------------------------------------------------- AC-10

  it('AC-10: two concurrent POSTs for one PR make one model call and return equal bodies', async () => {
    const llm = new GatedLLM('openai', { structuredBySchema: { [SCHEMA_NAME]: ANSWER } });
    const { app, github } = await appWith({ llm });
    const { pr } = await setupPr();

    const first = post(app, pr.id);
    await vi.waitFor(() => expect(llm.entered).toBe(1), { timeout: 10_000 });
    const second = post(app, pr.id);
    // The second request has no observable "joined" signal: give it a bounded
    // number of database round trips (its own getPull/context reads) to reach
    // the in-flight check before the model answers.
    for (let i = 0; i < 25; i++) await pg.handle.db.execute(sql`select 1`);
    llm.open();
    const [r1, r2] = await Promise.all([first, second]);

    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect(r2.json()).toEqual(r1.json());
    expect(llm.entered).toBe(1);
    expect(llm.calls).toHaveLength(1);
    expect((github as TestGitHub).prCalls).toBe(1);
    await app.close();
  });

  // ------------------------------------------------------------ AC-11, AC-13

  it('AC-11: no diff text reaches the model; paths and new-side line ranges do, as numbers', async () => {
    const { app, llm } = await appWith();
    const { pr } = await setupPr();

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    const text = allText(llm);
    for (const forbidden of [
      'ADDED_LINE_SENTINEL',
      'REPLACED_LINE_SENTINEL',
      'HUNK_TRAILER_SENTINEL',
      'context line',
      'context end',
      'stripeKey',
    ]) {
      expect(text).not.toContain(forbidden);
    }
    expect(userText(llm)).toContain('src/limiter.ts');
    // Hunk +4821,7 covers 4821-4827; hunk +9100,1 covers 9100.
    expect(userText(llm)).toContain('4821');
    expect(userText(llm)).toContain('4827');
    expect(userText(llm)).toContain('9100');
    await app.close();
  });

  it('AC-13: all seven input kinds reach the model and nothing else about the PR does', async () => {
    const github = new TestGitHub({
      detail: {
        head_sha: 'aaa',
        author: 'AUTHOR-SENTINEL',
        branch: 'BRANCH-SENTINEL',
        body: 'DESC-SENTINEL Fixes #7',
        files: [LIMITER, CONFIG],
        commits: [{ sha: 'aaa', message: 'COMMIT-MSG-SENTINEL', author: 'AUTHOR-SENTINEL', committed_at: null }],
      },
      issue: { title: 'ISSUE-TITLE-SENTINEL', body: 'ISSUE-BODY-SENTINEL' },
    });
    const repoDocs = new MockRepoDocs({ files: { 'specs/plan.md': 'SPEC-TEXT-SENTINEL' } });
    const { app, llm } = await appWith({ github, repoDocs });
    const { pr } = await setupPr({ withIntent: true, body: 'DESC-SENTINEL Fixes #7' });
    await makeAgent(['specs/plan.md'], new Date('2020-01-01T00:00:00Z'));

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    const brief = res.json().brief;
    const text = userText(llm);
    // 1 intent record
    expect(text).toContain(INTENT_TEXT);
    expect(text).toContain('SCOPE-IN-SENTINEL');
    expect(text).toContain('SCOPE-OUT-SENTINEL');
    // 2 blast summary and caller files with lines
    expect(text).toContain(brief.blast.summary);
    expect(text).toContain('src/callers/routes.ts');
    expect(text).toContain('34');
    // 3 files, 4 title and description, 5 linked issue, 6 attached docs
    expect(text).toContain('src/limiter.ts');
    expect(text).toContain('src/config.ts');
    expect(text).toContain('TITLE-SENTINEL');
    expect(text).toContain('DESC-SENTINEL');
    expect(text).toContain('ISSUE-TITLE-SENTINEL');
    expect(text).toContain('ISSUE-BODY-SENTINEL');
    expect(text).toContain('SPEC-TEXT-SENTINEL');
    // nothing else
    for (const other of [
      'AUTHOR-SENTINEL',
      'BRANCH-SENTINEL',
      'COMMIT-MSG-SENTINEL',
      'INTENT-MODEL-SENTINEL',
      'INTENT-HASH-SENTINEL',
    ]) {
      expect(allText(llm)).not.toContain(other);
    }
    expect(brief.missing_inputs).toEqual([]);
    await app.close();
  });

  // -------------------------------------------------------------------- AC-14

  it('AC-14: 30 000 tokens of attached docs are shortened to fit 8 000, specs are recorded, fixed parts stay intact', async () => {
    const count = (s: string) => Math.ceil(s.length / 4);
    const repoDocs = new MockRepoDocs({ files: { 'specs/big.md': 'spec '.repeat(30_000) } });
    const { app, llm } = await appWith({ repoDocs, tokenizer: { count } });
    const { pr } = await setupPr({ withIntent: true });
    await makeAgent(['specs/big.md'], new Date('2020-01-01T00:00:00Z'));

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    const messages = messagesOf(llm);
    expect(messages[0]!.role).toBe('system');
    expect(messages.map((m) => count(m.content)).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(8000);
    expect(res.json().brief.truncated_inputs).toEqual(['specs']);
    const user = userText(llm);
    expect(user).toContain('TITLE-SENTINEL');
    expect(user).toContain(INTENT_TEXT);
    expect(user).toContain(res.json().brief.blast.summary);
    await app.close();
  });

  it('AC-14: small attached docs leave truncated_inputs empty and reach the model whole', async () => {
    const repoDocs = new MockRepoDocs({ files: { 'specs/small.md': 'SMALL-SPEC-SENTINEL' } });
    const { app, llm } = await appWith({ repoDocs });
    const { pr } = await setupPr();
    await makeAgent(['specs/small.md'], new Date('2020-01-01T00:00:00Z'));

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(res.json().brief.truncated_inputs).toEqual([]);
    expect(userText(llm)).toContain('SMALL-SPEC-SENTINEL');
    await app.close();
  });

  // ------------------------------------------------------- AC-16, AC-17, XR-3

  it('AC-16: docs of agents [a,b] and [b,c] arrive as a, b, c once each, in agent-list order', async () => {
    const repoDocs = new MockRepoDocs({
      files: { 'specs/a.md': 'A-DOC-TEXT', 'specs/b.md': 'B-DOC-TEXT', 'specs/c.md': 'C-DOC-TEXT' },
    });
    const { app, llm } = await appWith({ repoDocs });
    const { pr } = await setupPr();
    // Inserted newest-first so insertion order is the opposite of the agent list order.
    await makeAgent(['specs/b.md', 'specs/c.md'], new Date('2020-01-02T00:00:00Z'));
    await makeAgent(['specs/a.md', 'specs/b.md'], new Date('2020-01-01T00:00:00Z'));

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    const text = userText(llm);
    const [a, b, c] = ['A-DOC-TEXT', 'B-DOC-TEXT', 'C-DOC-TEXT'].map((s) => text.indexOf(s));
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a!);
    expect(c).toBeGreaterThan(b!);
    expect(text.split('B-DOC-TEXT')).toHaveLength(2);
    await app.close();
  });

  it("AC-16: every doc is read from THIS PR's clone, and a path absent there is skipped", async () => {
    const repoDocs = new RecordingDocs({ files: { 'specs/here.md': 'HERE-DOC-TEXT' } });
    const { app, llm } = await appWith({ repoDocs });
    const { pr, repo } = await setupPr();
    await makeAgent(['specs/here.md', 'elsewhere/only-in-another-repo.md'], new Date('2020-01-01T00:00:00Z'));

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(new Set(repoDocs.roots)).toEqual(new Set([repo.clonePath]));
    expect(userText(llm)).toContain('HERE-DOC-TEXT');
    expect(allText(llm)).not.toContain('only-in-another-repo');
    expect(res.json().brief.missing_inputs).not.toContain('specs');
    await app.close();
  });

  it('AC-16 / XR-3: a doc the PR modifies reaches the model as its default-branch text, not the PR head text', async () => {
    const modified = { path: 'specs/plan.md', additions: 1, deletions: 0, patch: '@@ -1,1 +1,2 @@\n # Plan\n+PR-HEAD-VERSION-TEXT' };
    const github = new TestGitHub({ detail: { head_sha: 'aaa', files: [LIMITER, modified] } });
    const repoDocs = new MockRepoDocs({ files: { 'specs/plan.md': 'DEFAULT-BRANCH-VERSION-TEXT' } });
    const { app, llm } = await appWith({ github, repoDocs });
    const { pr } = await setupPr({ files: [LIMITER, modified] });
    await makeAgent(['specs/plan.md'], new Date('2020-01-01T00:00:00Z'));

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(userText(llm)).toContain('DEFAULT-BRANCH-VERSION-TEXT');
    expect(allText(llm)).not.toContain('PR-HEAD-VERSION-TEXT');
    await app.close();
  });

  it('AC-17: a missing doc is skipped, its path is logged, the answer is 200 and specs is listed as missing', async () => {
    const { app, llm } = await appWith({ repoDocs: new MockRepoDocs({ files: {} }) });
    const { pr } = await setupPr();
    await makeAgent(['specs/gone.md'], new Date('2020-01-01T00:00:00Z'));
    const { lines } = captureLogs(app);

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(res.json().brief.missing_inputs).toContain('specs');
    expect(llm.calls).toHaveLength(1);
    expect(lines.some((l) => JSON.stringify(l.args).includes('specs/gone.md'))).toBe(true);
    await app.close();
  });

  it('AC-17: an unreadable doc is skipped like a missing one while the readable doc still reaches the model', async () => {
    const repoDocs = new MockRepoDocs({
      files: { 'specs/ok.md': 'OK-DOC-TEXT' },
      failures: { 'specs/bad.md': 'EIO boom' },
    });
    const { app, llm } = await appWith({ repoDocs });
    const { pr } = await setupPr();
    await makeAgent(['specs/bad.md', 'specs/ok.md'], new Date('2020-01-01T00:00:00Z'));
    const { lines } = captureLogs(app);

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(userText(llm)).toContain('OK-DOC-TEXT');
    expect(res.json().brief.missing_inputs).not.toContain('specs');
    expect(lines.some((l) => JSON.stringify(l.args).includes('specs/bad.md'))).toBe(true);
    await app.close();
  });

  // -------------------------------------------------------------------- AC-19

  it('AC-19: risks and focus items on files outside the PR and the blast map are dropped; blast-only files stay', async () => {
    const answer = {
      summary: 'S',
      risks: [
        { ...ANSWER.risks[0]!, title: 'Real risk' },
        { kind: 'x', title: 'Ghost risk', explanation: 'e', severity: 'low', file_refs: ['ghost/nowhere.ts'] },
      ],
      review_focus: [
        { file: 'src/limiter.ts', line: 4823, reason: 'in the PR' },
        { file: 'ghost/nowhere.ts', line: 3, reason: 'ghost' },
        { file: 'src/callers/routes.ts', line: 34, reason: 'blast caller' },
      ],
    };
    const { app } = await appWith({ llm: mockLlm(answer) });
    const { pr } = await setupPr();
    const logs = captureLogs(app);

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    const brief = res.json().brief;
    expect(brief.risks.risks.map((r: { title: string }) => r.title)).toEqual(['Real risk']);
    expect(brief.review_focus).toEqual([
      { file: 'src/limiter.ts', line: 4823, reason: 'in the PR' },
      { file: 'src/callers/routes.ts', line: 34, reason: 'blast caller' },
    ]);
    const fields = logs.briefLines()[0]!.args.find((a) => typeof a === 'object') as Record<string, unknown>;
    expect(fields).toMatchObject({ droppedRisks: 1, droppedFocus: 1 });
    await app.close();
  });

  it("AC-19: validation uses the blast map the model was shown (the first call's), and the blast lookup runs once", async () => {
    const late: BlastResult = {
      ...BLAST_RESULT,
      callers: [{ file: 'src/other/late.ts', symbol: 'late', viaSymbol: 'rateLimit', line: 8, rank: 1 }],
    };
    const repoIntel = new FakeRepoIntel([BLAST_RESULT, late]);
    const answer = {
      summary: 'S',
      risks: [],
      review_focus: [
        { file: 'src/callers/routes.ts', line: 34, reason: 'shown caller' },
        { file: 'src/other/late.ts', line: 8, reason: 'only in a re-fetch' },
      ],
    };
    const { app } = await appWith({ llm: mockLlm(answer), repoIntel });
    const { pr } = await setupPr();

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(res.json().brief.review_focus).toEqual([
      { file: 'src/callers/routes.ts', line: 34, reason: 'shown caller' },
    ]);
    expect(repoIntel.blastCalls).toHaveLength(1);
    await app.close();
  });

  // --------------------------------------------------------- AC-23, AC-24

  it('AC-23: the stored brief holds every listed field; tokens and cost equal the model usage', async () => {
    const github = new TestGitHub({
      detail: { head_sha: 'aaa', body: 'Fixes #7', files: [LIMITER, CONFIG] },
      issue: { title: 'Issue seven', body: 'Seven body' },
    });
    const repoDocs = new MockRepoDocs({ files: { 'specs/plan.md': 'PLAN' } });
    const { app, repoIntel } = await appWith({ github, repoDocs });
    const { pr } = await setupPr({ withIntent: true, body: 'Fixes #7' });
    await makeAgent(['specs/plan.md'], new Date('2020-01-01T00:00:00Z'));
    const before = Date.now();

    const res = await post(app, pr.id);

    const after = Date.now();
    expect(res.statusCode).toBe(200);
    const [stored] = await readStored(pr.id);
    expect(stored).toMatchObject({
      head_sha: 'aaa',
      model: 'openrouter/openai/gpt-4.1-mini',
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.001,
      missing_inputs: [],
      truncated_inputs: [],
      history: null,
      intent: { intent: INTENT_TEXT, in_scope: ['SCOPE-IN-SENTINEL'], out_of_scope: ['SCOPE-OUT-SENTINEL'] },
    });
    expect(stored!.blast.changed_symbols).toEqual([{ file: 'src/limiter.ts', name: 'rateLimit', kind: 'function' }]);
    expect(stored!.blast.downstream[0].callers[0]).toMatchObject({ file: 'src/callers/routes.ts', line: 34 });
    const generated = Date.parse(stored!.generated_at);
    expect(generated).toBeGreaterThanOrEqual(before - 1000);
    expect(generated).toBeLessThanOrEqual(after + 1000);
    expect((repoIntel as FakeRepoIntel).blastCalls).toHaveLength(1);
    await app.close();
  });

  it('AC-23: cost_usd is null when the provider reports no cost', async () => {
    const llm = new NullCostLLM('openai', { structuredBySchema: { [SCHEMA_NAME]: ANSWER } });
    const { app } = await appWith({ llm });
    const { pr } = await setupPr();

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(res.json().brief.cost_usd).toBeNull();
    const [stored] = await readStored(pr.id);
    expect(stored!.cost_usd).toBeNull();
    expect(stored!.tokens_in).toBe(100);
    await app.close();
  });

  it('AC-24: a POST at a new head replaces the older brief and GET then answers stale false', async () => {
    const github = new TestGitHub({ detail: { head_sha: 'bbb', files: [LIMITER, CONFIG] } });
    const { app } = await appWith({ github });
    const { pr } = await setupPr({ headSha: 'aaa' });
    await storeBrief(pr.id, storedBrief({ head_sha: 'aaa', summary: 'OLD-SUMMARY' }));

    const res = await post(app, pr.id);
    const read = await get(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(res.json().brief.stale).toBe(false);
    const rows = await readStored(pr.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ head_sha: 'bbb', summary: ANSWER.summary });
    expect(read.json().brief.summary).toBe(ANSWER.summary);
    expect(read.json().brief.stale).toBe(false);
    await app.close();
  });

  // --------------------------------------------- AC-25, AC-26, AC-27, AC-29

  it('AC-25: with no stored intent the brief is still made, intent is null and missing, and only one model call is made', async () => {
    const { app, llm } = await appWith();
    const { pr } = await setupPr({ withIntent: false });

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(res.json().brief.intent).toBeNull();
    expect(res.json().brief.missing_inputs).toContain('intent');
    expect(llm.calls).toHaveLength(1);
    const intentRows = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(intentRows).toEqual([]);
    await app.close();
  });

  it('AC-26: a blast lookup that throws still gives a brief, with blast null and listed as missing', async () => {
    const repoIntel = new FakeRepoIntel([new Error('index exploded')]);
    const { app } = await appWith({ repoIntel });
    const { pr } = await setupPr();

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(res.json().brief.blast).toBeNull();
    expect(res.json().brief.missing_inputs).toContain('blast');
    await app.close();
  });

  it('AC-26: a partial index gives a brief that keeps the degraded blast snapshot and lists blast as missing', async () => {
    const repoIntel = new FakeRepoIntel([BLAST_RESULT], 'partial');
    const { app } = await appWith({ repoIntel });
    const { pr } = await setupPr();

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(res.json().brief.blast).toMatchObject({ degraded: true, reason: 'index_partial' });
    expect(res.json().brief.blast.changed_symbols).toEqual([
      { file: 'src/limiter.ts', name: 'rateLimit', kind: 'function' },
    ]);
    expect(res.json().brief.missing_inputs).toContain('blast');
    await app.close();
  });

  it('AC-26: a result the facade reports as degraded keeps its snapshot and lists blast as missing', async () => {
    const repoIntel = new FakeRepoIntel([
      { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'repo_too_large' },
    ]);
    const { app } = await appWith({ repoIntel });
    const { pr } = await setupPr();

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(res.json().brief.blast).toMatchObject({ degraded: true, reason: 'repo_too_large' });
    expect(res.json().brief.missing_inputs).toContain('blast');
    await app.close();
  });

  it('AC-27: "Fixes #7" fetches issue 7 and its text reaches the model', async () => {
    const github = new TestGitHub({
      detail: { head_sha: 'aaa', body: 'Fixes #7', files: [LIMITER] },
      issue: { title: 'ISSUE-TITLE-SENTINEL', body: 'ISSUE-BODY-SENTINEL' },
    });
    const { app, llm } = await appWith({ github });
    const { pr } = await setupPr({ body: 'Fixes #7' });

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(github.issueCalls).toEqual([7]);
    expect(userText(llm)).toContain('ISSUE-TITLE-SENTINEL');
    expect(userText(llm)).toContain('ISSUE-BODY-SENTINEL');
    expect(res.json().brief.missing_inputs).not.toContain('issue');
    await app.close();
  });

  it('AC-27: an issue that cannot be fetched is listed as missing and the brief is still made', async () => {
    const github = new TestGitHub({ detail: { head_sha: 'aaa', body: 'Fixes #7', files: [LIMITER] }, failIssue: true });
    const { app, llm } = await appWith({ github });
    const { pr } = await setupPr({ body: 'Fixes #7' });

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(github.issueCalls).toEqual([7]);
    expect(res.json().brief.missing_inputs).toContain('issue');
    expect(llm.calls).toHaveLength(1);
    await app.close();
  });

  it('AC-27: a description with no issue link lists issue as missing without fetching one', async () => {
    const github = new TestGitHub({ detail: { head_sha: 'aaa', body: 'No links here', files: [LIMITER] } });
    const { app } = await appWith({ github });
    const { pr } = await setupPr({ body: 'No links here' });

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(github.issueCalls).toEqual([]);
    expect(res.json().brief.missing_inputs).toContain('issue');
    await app.close();
  });

  it('AC-29: with only the file list present (no intent, blast, issue, specs or description) a brief is still made', async () => {
    const github = new TestGitHub({ detail: { head_sha: 'aaa', body: '', files: [LIMITER] } });
    const repoIntel = new FakeRepoIntel([new Error('no index')]);
    const { app, llm } = await appWith({ github, repoIntel });
    const { pr } = await setupPr({ body: '', files: [LIMITER] });

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect([...res.json().brief.missing_inputs].sort()).toEqual(
      ['blast', 'intent', 'issue', 'pr_description', 'specs'].sort(),
    );
    expect(res.json().brief.summary).toBe(ANSWER.summary);
    expect(llm.calls).toHaveLength(1);
    await app.close();
  });

  it('zero files after the refresh: 200 with an empty review_focus, since no focus item has a file to land on', async () => {
    const github = new TestGitHub({ detail: { head_sha: 'aaa', files: [] } });
    const repoIntel = new FakeRepoIntel([{ changedSymbols: [], callers: [], impactedEndpoints: [], degraded: false }]);
    const { app } = await appWith({ github, repoIntel });
    const { pr } = await setupPr({ files: [] });

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    expect(res.json().brief.review_focus).toEqual([]);
    expect(res.json().brief.risks.risks).toEqual([]);
    await app.close();
  });

  // ------------------------------------------------------- AC-31, AC-32

  it('AC-31: a model that throws answers 502 external_service_error, leaves the stored brief untouched and is not retried', async () => {
    const llm = new ThrowingLLM('openai', { structuredBySchema: { [SCHEMA_NAME]: ANSWER } });
    const { app } = await appWith({ llm });
    const { pr } = await setupPr();
    const original = storedBrief({ summary: 'ORIGINAL-SUMMARY' });
    await storeBrief(pr.id, original);

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('external_service_error');
    expect(llm.calls).toHaveLength(1);
    expect(await readStored(pr.id)).toEqual([original]);
    await app.close();
  });

  it('AC-31: an answer that does not match the contract answers 502 external_service_error, leaves the stored brief untouched and is not retried', async () => {
    const llm = mockLlm({});
    const { app } = await appWith({ llm });
    const { pr } = await setupPr();
    const original = storedBrief({ summary: 'ORIGINAL-SUMMARY' });
    await storeBrief(pr.id, original);

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('external_service_error');
    expect(llm.calls).toHaveLength(1);
    expect(await readStored(pr.id)).toEqual([original]);
    await app.close();
  });

  it('AC-32: a provider without a key answers 500 config_error naming the key, with no model call and the stored brief untouched', async () => {
    const llm = mockLlm();
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        github: new TestGitHub({ detail: { head_sha: 'aaa' } }),
        repoIntel: new FakeRepoIntel(),
        repoDocs: new MockRepoDocs(),
        // This machine's ~/.devdigest/secrets.json may hold real keys.
        secrets: { get: async () => undefined },
        // Deliberately NOT registered under anthropic: that is the missing key.
        llm: { openrouter: llm },
      },
    });
    const { pr } = await setupPr();
    const original = storedBrief({ summary: 'ORIGINAL-SUMMARY' });
    await storeBrief(pr.id, original);
    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { risk_brief: { provider: 'anthropic', model: 'claude-no-key' } } },
    });
    expect(put.statusCode).toBe(200);

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('config_error');
    expect(res.json().error.message).toContain('ANTHROPIC_API_KEY');
    expect(llm.calls).toHaveLength(0);
    expect(await readStored(pr.id)).toEqual([original]);
    await app.close();
  });

  // -------------------------------------------------------------------- AC-33

  it('AC-33: one brief: log line per generation on success, with the listed fields', async () => {
    const { app } = await appWith();
    const { pr } = await setupPr();
    const logs = captureLogs(app);

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(200);
    const found = logs.briefLines();
    expect(found).toHaveLength(1);
    const fields = found[0]!.args.find((a) => typeof a === 'object') as Record<string, unknown>;
    expect(fields).toMatchObject({
      prId: pr.id,
      model: expect.stringContaining('gpt-4.1-mini'),
      attempts: 1,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
      inputTokens: expect.any(Number),
      truncatedInputs: [],
      droppedRisks: 0,
      droppedFocus: 0,
      outcome: 'ok',
    });
    expect(fields.inputTokens as number).toBeGreaterThan(0);
    await app.close();
  });

  it('AC-33: one brief: log line per generation on failure, with the PR id and a failed outcome', async () => {
    const llm = new ThrowingLLM('openai', { structuredBySchema: { [SCHEMA_NAME]: ANSWER } });
    const { app } = await appWith({ llm });
    const { pr } = await setupPr();
    const logs = captureLogs(app);

    const res = await post(app, pr.id);

    expect(res.statusCode).toBe(502);
    const found = logs.briefLines();
    expect(found).toHaveLength(1);
    const fields = found[0]!.args.find((a) => typeof a === 'object') as Record<string, unknown>;
    expect(fields).toMatchObject({ prId: pr.id, outcome: 'failed' });
    await app.close();
  });

  // -------------------------------------------------------------------- AC-35

  it('AC-35: a stored row that breaks the contract (no summary) fails GET as a 500 instead of leaking', async () => {
    const { app } = await appWith();
    const { pr } = await setupPr();
    const { summary: _dropped, ...withoutSummary } = storedBrief();
    await storeBrief(pr.id, withoutSummary);

    const res = await get(app, pr.id);

    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('internal_error');
    expect(res.payload).not.toContain('Stored risk');
    await app.close();
  });
});
