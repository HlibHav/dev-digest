/* ConventionsService against fake ports — no container, no database, no network.
   The point of these tests is the SHAPE of the pipeline: which step is allowed
   to call the model, and what happens to what the model says afterwards. */
import { describe, it, expect, vi } from 'vitest';
import type { FeatureModelChoice, Skill } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { ConventionsService, type ConventionsPorts, type RepoBasics } from '../src/modules/conventions/service.js';
import type { ConventionRow, VerifiedCandidate } from '../src/modules/conventions/helpers.js';
import {
  EXTRACTION_SCHEMA_NAME,
  EXTRACTION_TOTAL_BUDGET_MS,
} from '../src/modules/conventions/constants.js';

const WS = 'ws-1';
const REPO = 'repo-1';

const BASICS: RepoBasics = {
  id: REPO, owner: 'acme', name: 'payments-api',
  fullName: 'acme/payments-api', defaultBranch: 'main', clonePath: '/clones/acme/payments-api',
};

const FILES: Record<string, string> = {
  'tsconfig.json': '{\n  "strict": true\n}',
  'src/modules/skills/service.ts':
    "import type { Skill } from '@devdigest/shared';\n\nexport class SkillsService {\n  constructor(private repo: SkillsRepository) {}\n}",
};

function extraction(over: Record<string, unknown> = {}) {
  return {
    candidates: [
      {
        category: 'architecture',
        rule: 'A service takes the ports it calls, not the container.',
        evidence: {
          path: 'src/modules/skills/service.ts',
          line: 99, // wrong on purpose
          snippet: 'constructor(private repo: SkillsRepository) {}',
        },
        confidence: 0.9,
      },
      {
        category: 'invented',
        rule: 'Always call the mainframe before lunch.',
        evidence: { path: 'src/modules/skills/service.ts', line: 2, snippet: 'callMainframe();' },
        confidence: 0.95,
      },
    ],
    ...over,
  };
}

interface Harness {
  service: ConventionsService;
  llm: MockLLMProvider;
  inserted: VerifiedCandidate[];
  deletedPending: number;
  reads: string[];
  upserts: { name: string; body: string; evidenceFiles: string[] }[];
}

function harness(opts: {
  ranked?: string[];
  structured?: unknown;
  accepted?: ConventionRow[];
  scanRows?: number;
  /** Simulate a repo with no clone on disk: every read misses. */
  readFails?: boolean;
  /** Replace the file fixtures entirely. */
  blankFiles?: Record<string, string>;
  /** Model call that never resolves, to exercise the budget. */
  hangs?: boolean;
} = {}): Harness {
  const llm = new MockLLMProvider('openai', {
    structuredBySchema: { [EXTRACTION_SCHEMA_NAME]: opts.structured ?? extraction() },
  });
  const inserted: VerifiedCandidate[] = [];
  const upserts: Harness['upserts'] = [];
  const reads: string[] = [];
  let deletedPending = 0;

  const repo = {
    listForRepo: async () => [],
    listByStatus: async () => opts.accepted ?? [],
    deletePending: async () => { deletedPending += 1; return 0; },
    insertCandidates: async (_w: string, _r: string, _s: string, c: readonly VerifiedCandidate[]) => {
      inserted.push(...c); return c.length;
    },
    update: async () => undefined,
    countForScan: async () => opts.scanRows ?? 0,
    latestScan: async () => undefined,
  } as unknown as ConventionsPorts['repo'];

  const ports: ConventionsPorts = {
    repo,
    sampleFiles: async () => opts.ranked ?? ['src/modules/skills/service.ts'],
    getRepoBasics: async () => BASICS,
    readRepoFile: async (_ref, path) => {
      reads.push(path);
      const content = opts.readFails ? undefined : (opts.blankFiles ?? FILES)[path];
      if (content === undefined) throw new Error(`ENOENT ${path}`);
      return content;
    },
    resolveModel: async (): Promise<FeatureModelChoice> => ({ provider: 'openai', model: 'gpt-5.4' }),
    llm: async () =>
      opts.hangs
        ? ({
            ...llm,
            completeStructured: () => new Promise(() => {}),
          } as unknown as MockLLMProvider)
        : llm,
    upsertSkill: async (_ws, input) => {
      upserts.push({ name: input.name, body: input.body, evidenceFiles: input.evidenceFiles });
      return { id: 'sk-1', name: input.name, body: input.body } as unknown as Skill;
    },
  };

  return {
    service: new ConventionsService(ports),
    llm, inserted, upserts, reads,
    get deletedPending() { return deletedPending; },
  } as Harness;
}

describe('sample collection', () => {
  it('reads config files and ranked files without calling the model', async () => {
    const h = harness();
    const { samples } = await h.service.collectSamples(REPO);
    expect(samples.map((s) => s.path)).toEqual([
      'tsconfig.json',
      'src/modules/skills/service.ts',
    ]);
    // The whole criterion in one assertion: selection made no model call.
    expect(h.llm.calls).toHaveLength(0);
  });

  it('probes every declared config path and tolerates the misses', async () => {
    const h = harness();
    await h.service.collectSamples(REPO);
    expect(h.reads).toContain('tsconfig.json');
    expect(h.reads).toContain('.prettierrc');
    expect(h.reads.length).toBeGreaterThan(2);
  });

  it('treats a blank file as absent rather than sampling nothing', async () => {
    // MockGitClient returns '' for an unknown path instead of throwing, and an
    // empty config demonstrates no convention either way.
    const h = harness({
      ranked: ['src/blank.ts'],
      blankFiles: { ...FILES, 'src/blank.ts': '   \n' },
    });
    const { samples } = await h.service.collectSamples(REPO);
    expect(samples.map((f) => f.path)).not.toContain('src/blank.ts');
    expect(samples.map((f) => f.path)).toContain('tsconfig.json');
  });

  it('refuses to scan an unindexed repo instead of returning nothing', async () => {
    // No ranked files AND no readable configs → the repo was never indexed.
    const h = harness({ ranked: [], readFails: true });
    await expect(h.service.collectSamples(REPO)).rejects.toThrow(/index this repo first/i);
  });
});

describe('runScan', () => {
  it('keeps the grounded candidate, drops the invented one, and fixes the line', async () => {
    const h = harness();
    const written = await h.service.runScan(WS, REPO, 'scan-1');
    expect(written).toBe(1);
    expect(h.inserted).toHaveLength(1);
    expect(h.inserted[0]?.rule).toMatch(/takes the ports/);
    expect(h.inserted[0]?.evidenceLine).toBe(4); // model said 99
  });

  it('asks the model under the schema name the fixtures key on', async () => {
    const h = harness();
    await h.service.runScan(WS, REPO, 'scan-1');
    const call = h.llm.calls.find((c) => c.method === 'completeStructured');
    expect((call?.req as { schemaName: string }).schemaName).toBe(EXTRACTION_SCHEMA_NAME);
  });

  it('uses the model the workspace chose, not a hardcoded one', async () => {
    const h = harness();
    await h.service.runScan(WS, REPO, 'scan-1');
    const call = h.llm.calls.find((c) => c.method === 'completeStructured');
    expect((call?.req as { model: string }).model).toBe('gpt-5.4');
  });

  it('bounds the whole model call below JobRunner\'s 120s, not just one attempt', async () => {
    const h = harness();
    await h.service.runScan(WS, REPO, 'scan-1');
    const call = h.llm.calls.find((c) => c.method === 'completeStructured');
    const req = call?.req as { timeoutMs: number; maxRetries: number };
    // The providers apply timeoutMs PER ATTEMPT inside their retry loop, so
    // attempts x timeout has to stay under the job timeout as well.
    expect(req.maxRetries).toBe(0);
    expect(req.timeoutMs * (req.maxRetries + 1)).toBeLessThan(120_000);
    expect(EXTRACTION_TOTAL_BUDGET_MS).toBeLessThan(120_000);
  });

  it('gives up at its own deadline rather than letting the job time out', async () => {
    // Fake timers: the point is WHICH deadline fires, not waiting for it.
    vi.useFakeTimers();
    try {
      const h = harness({ hangs: true });
      const scan = h.service.runScan(WS, REPO, 'scan-1');
      const assertion = expect(scan).rejects.toThrow(/timed out/i);
      await vi.advanceTimersByTimeAsync(EXTRACTION_TOTAL_BUDGET_MS + 1_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('writes nothing when this scan id already produced rows', async () => {
    const h = harness({ scanRows: 3 });
    expect(await h.service.runScan(WS, REPO, 'scan-1')).toBe(0);
    expect(h.llm.calls).toHaveLength(0);
  });

  it('clears pending rows only after the model answered', async () => {
    const h = harness();
    await h.service.runScan(WS, REPO, 'scan-1');
    expect(h.deletedPending).toBe(1);
  });
});

describe('createSkill', () => {
  const accepted: ConventionRow[] = [
    {
      id: 'c1', category: 'architecture', rule: 'A service takes ports.',
      evidencePath: 'src/modules/skills/service.ts', evidenceLine: 4,
      evidenceSnippet: 'x', confidence: 0.9, status: 'accepted',
    },
  ];

  it('refuses when nothing has been accepted', async () => {
    const h = harness({ accepted: [] });
    await expect(h.service.createSkill(WS, REPO, {})).rejects.toThrow(/accept at least one/i);
  });

  it('names the skill repo-conventions and carries evidence paths', async () => {
    const h = harness({ accepted });
    await h.service.createSkill(WS, REPO, {});
    expect(h.upserts[0]?.name).toBe('repo-conventions');
    expect(h.upserts[0]?.evidenceFiles).toEqual(['src/modules/skills/service.ts']);
  });

  it('uses the body the user edited in the modal, not the generated one', async () => {
    const h = harness({ accepted });
    await h.service.createSkill(WS, REPO, { body: '# Edited by hand' });
    expect(h.upserts[0]?.body).toBe('# Edited by hand');
  });

  it('falls back to the generated body when the modal sent none', async () => {
    const h = harness({ accepted });
    await h.service.createSkill(WS, REPO, {});
    expect(h.upserts[0]?.body).toContain('## architecture');
  });
});
