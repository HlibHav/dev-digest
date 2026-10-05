/**
 * BriefService against hand-built port stubs (U4) — no container, no database,
 * no network, no Docker. Red-first: names `src/modules/brief/service.ts`, which
 * does not exist yet. Mirrors `intent-service.test.ts`.
 *
 * Covers the AC-31 hang case (a never-resolving model call, fake timers) plus
 * the service shape the plan fixes for step 8: ConfigError passes through
 * unwrapped, one in-flight generation per PR, the in-flight entry cleared after
 * a failure, `get()` never parses the stored row.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { BlastRadius, FeatureModelChoice, IssueMeta, PrDetail, RepoRef } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { ConfigError, ExternalServiceError, NotFoundError } from '../src/platform/errors.js';
import { BriefService, type BriefPorts } from '../src/modules/brief/service.js';
import { BRIEF_SCHEMA_NAME } from '../src/modules/brief/constants.js';

const WS = 'ws-1';
const PR = 'pr-1';
const DEADLINE = 60_000;

const PATCH_SENTINEL = 'SECRET_PATCH_TEXT_DO_NOT_SEND';

const MODEL_ANSWER = {
  summary: 'Adds a limiter.',
  risks: [
    {
      kind: 'correctness',
      title: 'Limiter order',
      explanation: 'The limiter runs after auth.',
      severity: 'medium',
      file_refs: ['src/a.ts'],
      line_refs: [{ file: 'src/a.ts', start_line: 11, end_line: 12 }],
    },
  ],
  review_focus: [{ file: 'src/a.ts', line: 12, reason: 'Check the bucket math.' }],
};

function detail(over: Partial<PrDetail> = {}): PrDetail {
  return {
    id: PR,
    number: 482,
    title: 'Add rate limiting',
    author: 'marisa.koch',
    branch: 'feat/rl',
    base: 'main',
    head_sha: 'bbb',
    additions: 5,
    deletions: 1,
    files_count: 1,
    status: 'open',
    opened_at: null,
    updated_at: null,
    body: 'Adds a token bucket limiter.',
    files: [
      {
        path: 'src/a.ts',
        additions: 5,
        deletions: 1,
        patch: `@@ -8,3 +10,5 @@ function leakedName() {\n+const x = "${PATCH_SENTINEL}";\n context`,
      },
    ],
    commits: [],
    ...over,
  } as PrDetail;
}

interface Opts {
  structured?: unknown;
  /** Replace completeStructured on the provider the service receives. */
  complete?: (req: unknown) => Promise<unknown>;
  llmThrows?: Error;
  refreshed?: PrDetail;
  intent?: { intent: string; inScope: string[]; outOfScope: string[] } | undefined;
  blast?: () => Promise<BlastRadius | undefined>;
  stored?: unknown;
  pull?: { id: string; repoId: string; headSha: string } | undefined;
  costUsd?: number | undefined;
}

function harness(opts: Opts = {}) {
  const llm = new MockLLMProvider('openai', {
    structuredBySchema: { [BRIEF_SCHEMA_NAME]: opts.structured ?? MODEL_ANSWER },
  });
  if (opts.complete) {
    (llm as unknown as { completeStructured: unknown }).completeStructured = async (req: unknown) => {
      llm.calls.push({ method: 'completeStructured', req });
      return opts.complete!(req);
    };
  } else if ('costUsd' in opts) {
    const original = llm.completeStructured.bind(llm);
    (llm as unknown as { completeStructured: unknown }).completeStructured = async (req: never) => ({
      ...(await original(req)),
      costUsd: opts.costUsd,
    });
  }

  const saved: { prId: string; brief: Record<string, unknown> }[] = [];
  const logs: { fields: Record<string, unknown>; message: string }[] = [];
  const getBlast = vi.fn(opts.blast ?? (async () => undefined));
  const refreshPullDetail = vi.fn(async () => opts.refreshed ?? detail());
  const getStored = vi.fn(async () => opts.stored);
  const llmPort = vi.fn(async () => {
    if (opts.llmThrows) throw opts.llmThrows;
    return llm;
  });

  const ports: BriefPorts = {
    getPull: async () => ('pull' in opts ? opts.pull : { id: PR, repoId: 'repo-1', headSha: 'aaa' }),
    getRepo: async () => ({ owner: 'acme', name: 'payments-api', clonePath: '/clones/acme/payments-api' }),
    refreshPullDetail,
    getStored,
    save: async (prId: string, brief: unknown) => {
      saved.push({ prId, brief: brief as Record<string, unknown> });
    },
    getIntent: async () => ('intent' in opts ? opts.intent : { intent: 'Adds a limiter.', inScope: ['limiter'], outOfScope: [] }),
    getBlast,
    getIssue: async (_ref: RepoRef, n: number) => ({ number: n, title: `Issue ${n}`, body: 'body', state: 'open' }) as IssueMeta,
    agentIds: async () => [],
    resolveAgentDocs: async () => [],
    resolveModel: async (): Promise<FeatureModelChoice> => ({ provider: 'openai', model: 'gpt-4.1-mini' }),
    llm: llmPort,
    count: (t: string) => Math.ceil(t.length / 4),
    classifyFile: () => 'core',
    parseLinkedIssues: () => [],
    sanitize: (t: string) => t,
    now: () => new Date('2026-10-03T10:00:00.000Z'),
    log: (fields: Record<string, unknown>, message: string) => {
      logs.push({ fields, message });
    },
    limits: { deadlineMs: DEADLINE },
  } as unknown as BriefPorts;

  return { service: new BriefService(ports), llm, saved, logs, getBlast, refreshPullDetail, getStored, llmPort };
}

const completeCalls = (llm: MockLLMProvider) => llm.calls.filter((c) => c.method === 'completeStructured');

afterEach(() => {
  vi.useRealTimers();
});

describe('generate — AC-31 hang case: the model call never finishes', () => {
  it('rejects with ExternalServiceError (502, external_service_error) at the 60 s deadline, 1 call, nothing stored', async () => {
    vi.useFakeTimers();
    const h = harness({ complete: () => new Promise(() => {}) });

    let settled: unknown = 'pending';
    const p = h.service.generate(WS, PR);
    p.then(
      () => (settled = 'resolved'),
      (e) => (settled = e),
    );

    await vi.advanceTimersByTimeAsync(DEADLINE - 1);
    expect(settled).toBe('pending'); // not before the deadline

    await vi.advanceTimersByTimeAsync(1);
    await expect(p).rejects.toBeInstanceOf(ExternalServiceError);
    expect(settled).toBeInstanceOf(ExternalServiceError);
    expect((settled as ExternalServiceError).code).toBe('external_service_error');
    expect((settled as ExternalServiceError).statusCode).toBe(502);

    expect(completeCalls(h.llm)).toHaveLength(1); // no retry
    expect(h.saved).toEqual([]); // stored brief untouched
  });

  it('passes the deadline to the provider as timeoutMs and disables schema re-asking (maxRetries 0)', async () => {
    const h = harness();
    await h.service.generate(WS, PR);

    const req = completeCalls(h.llm)[0]!.req as { timeoutMs: number; maxRetries: number; schemaName: string };
    expect(req.timeoutMs).toBe(DEADLINE);
    expect(req.maxRetries).toBe(0);
    expect(req.schemaName).toBe(BRIEF_SCHEMA_NAME);
  });
});

describe('generate — failures', () => {
  it('a model error becomes ExternalServiceError, one call, nothing stored, one failed log line', async () => {
    const h = harness({
      complete: async () => {
        throw new Error('provider 500');
      },
    });
    await expect(h.service.generate(WS, PR)).rejects.toBeInstanceOf(ExternalServiceError);

    expect(completeCalls(h.llm)).toHaveLength(1);
    expect(h.saved).toEqual([]);
    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]!.message).toBe('brief: failed');
    expect(h.logs[0]!.fields).toMatchObject({ prId: PR, outcome: 'failed' });
  });

  it('a ConfigError from llm() propagates unchanged (not wrapped as 502), with 0 model calls and nothing stored', async () => {
    const err = new ConfigError('ANTHROPIC_API_KEY is not configured');
    const h = harness({ llmThrows: err });

    await expect(h.service.generate(WS, PR)).rejects.toBe(err);
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('config_error');
    expect(completeCalls(h.llm)).toHaveLength(0);
    expect(h.saved).toEqual([]);
  });

  it('an unknown PR is NotFoundError before anything else: no refresh, no model call', async () => {
    const h = harness({ pull: undefined });
    await expect(h.service.generate(WS, PR)).rejects.toBeInstanceOf(NotFoundError);
    expect(h.refreshPullDetail).not.toHaveBeenCalled();
    expect(h.llmPort).not.toHaveBeenCalled();
    expect(completeCalls(h.llm)).toHaveLength(0);
  });
});

describe('generate — in-flight dedupe (AC-10 at service level)', () => {
  it('a second generate for the same PR while the first is pending gets the first result: 1 call, 1 save', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const base = new MockLLMProvider('openai', { structuredBySchema: { [BRIEF_SCHEMA_NAME]: MODEL_ANSWER } });
    const h = harness({
      complete: async (req) => {
        await gate;
        return base.completeStructured(req as never);
      },
    });

    const first = h.service.generate(WS, PR);
    await vi.waitFor(() => expect(completeCalls(h.llm)).toHaveLength(1)); // first is now in flight
    const second = h.service.generate(WS, PR);
    release();
    const [a, b] = await Promise.all([first, second]);

    expect(b).toEqual(a);
    expect(completeCalls(h.llm)).toHaveLength(1);
    expect(h.saved).toHaveLength(1);
  });

  it('the in-flight entry is cleared after a failure, so a retry calls the model again', async () => {
    const base = new MockLLMProvider('openai', { structuredBySchema: { [BRIEF_SCHEMA_NAME]: MODEL_ANSWER } });
    let attempt = 0;
    const h = harness({
      complete: async (req) => {
        attempt += 1;
        if (attempt === 1) throw new Error('provider 500');
        return base.completeStructured(req as never);
      },
    });

    await expect(h.service.generate(WS, PR)).rejects.toBeInstanceOf(ExternalServiceError);
    const result = await h.service.generate(WS, PR);

    expect(completeCalls(h.llm)).toHaveLength(2);
    expect(result.stale).toBe(false);
    expect(h.saved).toHaveLength(1);
  });
});

describe('generate — success path', () => {
  it('stores and returns the validated brief, stale false, stamped with the refreshed head and model', async () => {
    const h = harness({ refreshed: detail({ head_sha: 'bbb' }) }); // stored head is aaa
    const result = await h.service.generate(WS, PR);

    expect(h.saved).toHaveLength(1);
    expect(h.saved[0]!.prId).toBe(PR);
    const stored = h.saved[0]!.brief;
    expect(stored).toMatchObject({
      summary: 'Adds a limiter.',
      head_sha: 'bbb',
      model: 'openai/gpt-4.1-mini',
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.001,
      generated_at: '2026-10-03T10:00:00.000Z',
      history: null,
      truncated_inputs: [],
    });
    // The stub has no blast map, linked issue or docs; intent and description exist.
    expect([...(stored.missing_inputs as string[])].sort()).toEqual(['blast', 'issue', 'specs']);
    expect(stored.risks).toEqual({ risks: [expect.objectContaining({ title: 'Limiter order', file_refs: ['src/a.ts'] })] });
    expect(stored.review_focus).toEqual([{ file: 'src/a.ts', line: 12, reason: 'Check the bucket math.' }]);
    expect(stored.intent).toEqual({ intent: 'Adds a limiter.', in_scope: ['limiter'], out_of_scope: [] });
    expect(result).toEqual({ ...stored, stale: false });
  });

  it('cost_usd is null when the provider reports none', async () => {
    const h = harness({ costUsd: undefined });
    await h.service.generate(WS, PR);
    expect(h.saved[0]!.brief.cost_usd).toBeNull();
  });

  it('no stored intent: intent null and listed missing, still one model call', async () => {
    const h = harness({ intent: undefined });
    await h.service.generate(WS, PR);
    expect(h.saved[0]!.brief.intent).toBeNull();
    expect(h.saved[0]!.brief.missing_inputs).toContain('intent');
    expect(completeCalls(h.llm)).toHaveLength(1);
  });

  it('a throwing blast lookup: blast null and listed missing, the blast lookup ran exactly once', async () => {
    const h = harness({
      blast: async () => {
        throw new Error('index unavailable');
      },
    });
    await h.service.generate(WS, PR);
    expect(h.getBlast).toHaveBeenCalledTimes(1);
    expect(h.saved[0]!.brief.blast).toBeNull();
    expect(h.saved[0]!.brief.missing_inputs).toContain('blast');
  });

  it('sends the model no diff text: the patch body and the hunk-header trailing text appear in no message', async () => {
    const h = harness();
    await h.service.generate(WS, PR);

    const req = completeCalls(h.llm)[0]!.req as { messages: { role: string; content: string }[] };
    const all = req.messages.map((m) => m.content).join('\n');
    expect(req.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(all).not.toContain(PATCH_SENTINEL);
    expect(all).not.toContain('leakedName');
    expect(all).toContain('src/a.ts');
  });

  it('writes one structured log line on success', async () => {
    const h = harness();
    await h.service.generate(WS, PR);

    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]!.message).toBe('brief: generated');
    expect(h.logs[0]!.fields).toMatchObject({
      prId: PR,
      model: expect.stringContaining('gpt-4.1-mini'),
      attempts: 1,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
      truncatedInputs: [],
      droppedRisks: 0,
      droppedFocus: 0,
      outcome: 'ok',
    });
  });
});

describe('get — reads the stored row without parsing it', () => {
  it('returns the stored json with stale computed from the head, and makes no model call', async () => {
    const stored = { head_sha: 'aaa', note: 'not a valid PrBrief: no summary on purpose' };
    const h = harness({ stored });
    const result = await h.service.get(WS, PR);

    expect(result).toEqual({ ...stored, stale: false });
    expect(completeCalls(h.llm)).toHaveLength(0);
    expect(h.llmPort).not.toHaveBeenCalled();
  });

  it('stale is true when the stored brief head differs from the PR head', async () => {
    const h = harness({ stored: { head_sha: 'old' } });
    expect(await h.service.get(WS, PR)).toEqual({ head_sha: 'old', stale: true });
  });

  it('no stored brief -> null', async () => {
    const h = harness({ stored: undefined });
    expect(await h.service.get(WS, PR)).toBeNull();
  });

  it('an unknown PR is NotFoundError and the stored row is never read', async () => {
    const h = harness({ pull: undefined, stored: { head_sha: 'aaa' } });
    await expect(h.service.get(WS, PR)).rejects.toBeInstanceOf(NotFoundError);
    expect(h.getStored).not.toHaveBeenCalled();
  });
});
