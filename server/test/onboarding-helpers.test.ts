import { describe, it, expect } from 'vitest';
import {
  buildSkeleton,
  deriveCommands,
  orderReadingPath,
  mergeTour,
  buildModelInput,
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
});
