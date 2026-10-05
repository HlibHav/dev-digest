/**
 * Pure helpers for the onboarding tour: derive facts, order file lists, build
 * the model input, and merge or fall back to a stored tour. Data in, data out:
 * no I/O, no db, no adapter.
 */
import { wrapUntrusted } from '@devdigest/reviewer-core';
import {
  OnboardingTour as OnboardingTourSchema,
  type CloneScan,
  type OnboardingIndexStatus,
  type OnboardingItem,
  type OnboardingLlmMeta,
  type OnboardingSkeletonReason,
  type OnboardingTour,
  type OnboardingTourSection,
} from '@devdigest/shared';
import {
  CHECKLIST,
  MAX_COMMANDS,
  MAX_CRITICAL,
  MAX_FOLDERS,
  MAX_LINE,
  MAX_READING,
  MAX_README_CHARS,
  MAX_ROUTES,
  MAX_TASKS,
  NOTICE_NEEDS_INDEX,
  NOTICE_NO_CHAINS,
  NOTICE_UNSUPPORTED,
  SECTION_TITLES,
} from './constants.js';
import type { OnboardingLlmOutput } from './llm-schema.js';

/** Structural copy of repo-intel's RankedFileRow: application code takes data only. */
export type RankedFileRow = {
  path: string;
  pagerank: number;
  hotness: number;
  importers: number;
  junk: boolean;
};

export type OnboardingFacts = {
  repoFullName: string;
  commitSha: string;
  index: { status: OnboardingIndexStatus; filesIndexed: number; filesTotal: number };
  rankingAvailable: boolean;
  stack: string[];
  folders: { name: string; files: number }[];
  rootFiles: string[];
  scripts: Record<string, string>;
  readme: string | null;
  routes: string[];
  ranked: RankedFileRow[];
  criticalChains: string[][];
};

export type OnboardingModelInput = {
  stack: string[];
  folders: { name: string; files: number }[];
  routes: string[];
  readme: string;
  criticalFiles: string[];
  readingFiles: string[];
  commands: string[];
};

// ---- text ----

/** Collapse any whitespace run (newlines included) to one space and cap the length. */
export function oneLine(s: string, max: number = MAX_LINE): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function importerReason(n: number): string {
  return `imported by ${n} file${n === 1 ? '' : 's'}`;
}

// ---- deriving facts ----

export function toIndexStatus(input: {
  sourceFiles: number;
  flagOn: boolean;
  state: { status: 'full' | 'partial' | 'degraded' | 'failed'; filesIndexed: number } | null;
}): { status: OnboardingIndexStatus; filesIndexed: number; filesTotal: number } {
  const { sourceFiles, flagOn, state } = input;
  const filesIndexed = state?.filesIndexed ?? 0;
  const filesTotal = Math.max(filesIndexed, sourceFiles);
  let status: OnboardingIndexStatus;
  if (sourceFiles === 0) status = 'unsupported_languages';
  else if (!flagOn || !state || state.status === 'degraded' || state.status === 'failed') status = 'unavailable';
  else if (state.status === 'partial' || state.filesIndexed < sourceFiles) status = 'partial';
  else status = 'full';
  return { status, filesIndexed, filesTotal };
}

type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';

const LOCKFILES: [PackageManager, string[]][] = [
  ['pnpm', ['pnpm-lock.yaml']],
  ['yarn', ['yarn.lock']],
  ['bun', ['bun.lockb', 'bun.lock']],
  ['npm', ['package-lock.json', 'npm-shrinkwrap.json']],
];
const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
const RUN_SCRIPTS = ['dev', 'start', 'build', 'test'] as const;

function detectPackageManager(rootFiles: readonly string[]): PackageManager | null {
  for (const [pm, files] of LOCKFILES) if (files.some((f) => rootFiles.includes(f))) return pm;
  return rootFiles.includes('package.json') ? 'npm' : null;
}

const LANGUAGES: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', rb: 'Ruby', php: 'PHP', cs: 'C#',
  swift: 'Swift', c: 'C', h: 'C', cc: 'C++', cpp: 'C++', hpp: 'C++',
};
const MAX_LANGUAGES = 3;

export function detectStack(scan: Pick<CloneScan, 'extensionCounts' | 'rootFiles'>): string[] {
  const perLanguage = new Map<string, number>();
  for (const [ext, count] of Object.entries(scan.extensionCounts)) {
    const lang = LANGUAGES[ext.replace(/^\./, '').toLowerCase()];
    if (lang) perLanguage.set(lang, (perLanguage.get(lang) ?? 0) + count);
  }
  const stack = [...perLanguage.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_LANGUAGES)
    .map(([lang]) => lang);
  const pm = detectPackageManager(scan.rootFiles);
  if (pm) stack.push(pm);
  if (scan.rootFiles.some((f) => f === 'Dockerfile' || COMPOSE_FILES.includes(f))) stack.push('Docker');
  return stack;
}

export function deriveCommands(f: Pick<OnboardingFacts, 'rootFiles' | 'scripts'>): string[] {
  const pm = detectPackageManager(f.rootFiles);
  const out: string[] = [];
  if (pm) out.push(`${pm} install`);
  if (f.rootFiles.includes('.env.example')) out.push('cp .env.example .env');
  if (COMPOSE_FILES.some((c) => f.rootFiles.includes(c))) out.push('docker compose up -d');
  const runner = pm ?? 'npm';
  for (const s of RUN_SCRIPTS) {
    if (!Object.hasOwn(f.scripts, s)) continue;
    out.push(runner === 'npm' || runner === 'bun' ? `${runner} run ${s}` : `${runner} ${s}`);
  }
  return out.slice(0, MAX_COMMANDS);
}

function isTestCommand(c: string): boolean {
  return /^(npm run|pnpm|yarn|bun run) test$/.test(c);
}

// ---- file lists ----

export function orderReadingPath(ranked: readonly RankedFileRow[]): RankedFileRow[] {
  const score = (r: RankedFileRow) => r.pagerank * (1 + r.hotness);
  return ranked
    .filter((r) => !r.junk)
    .sort((a, b) => score(b) - score(a) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .slice(0, MAX_READING);
}

export function pickCriticalFiles(chains: readonly string[][], ranked: readonly RankedFileRow[]): RankedFileRow[] {
  const byPath = new Map(ranked.map((r) => [r.path, r]));
  const seen = new Set<string>();
  const out: RankedFileRow[] = [];
  for (const path of chains.flat()) {
    if (seen.has(path)) continue;
    seen.add(path);
    const row = byPath.get(path);
    if (row && !row.junk) out.push(row);
  }
  return out.slice(0, MAX_CRITICAL);
}

export function orientationChecklist(p: {
  hasCommands: boolean;
  hasTestCommand: boolean;
  hasReadingPath: boolean;
}): OnboardingItem[] {
  const titles: string[] = [];
  if (p.hasCommands) titles.push(CHECKLIST.run);
  if (p.hasTestCommand) titles.push(CHECKLIST.test);
  if (p.hasReadingPath) titles.push(CHECKLIST.read);
  titles.push(CHECKLIST.change);
  return titles.map((title) => ({ title, path: null, reason: null, reason_source: 'deterministic' }));
}

// ---- model input ----

export function buildModelInput(f: OnboardingFacts): OnboardingModelInput {
  return {
    stack: f.stack,
    folders: f.folders.slice(0, MAX_FOLDERS),
    routes: f.routes.slice(0, MAX_ROUTES),
    readme: (f.readme ?? '').slice(0, MAX_README_CHARS),
    criticalFiles: pickCriticalFiles(f.criticalChains, f.ranked)
      .slice(0, MAX_CRITICAL)
      .map((r) => r.path),
    readingFiles: orderReadingPath(f.ranked)
      .slice(0, MAX_READING)
      .map((r) => r.path),
    commands: deriveCommands(f),
  };
}

/** Facts and README are repository text: each sits in its own fenced block. */
export function renderModelInput(input: OnboardingModelInput): string {
  const { readme, ...facts } = input;
  return [wrapUntrusted('repo-facts', JSON.stringify(facts, null, 2)), wrapUntrusted('repo-readme', readme)].join('\n\n');
}

// ---- building tours ----

type Rows = { items: OnboardingItem[]; notice: string | null };

function fileRows(rows: readonly RankedFileRow[]): OnboardingItem[] {
  return rows.map((r) => ({
    path: r.path,
    reason: importerReason(r.importers),
    reason_source: 'deterministic' as const,
  }));
}

function listNotice(f: OnboardingFacts): string | null {
  if (f.index.status === 'unsupported_languages') return NOTICE_UNSUPPORTED;
  if (!f.rankingAvailable) return NOTICE_NEEDS_INDEX;
  return null;
}

function criticalRows(f: OnboardingFacts): Rows {
  const notice = listNotice(f);
  if (notice) return { items: [], notice };
  const items = fileRows(pickCriticalFiles(f.criticalChains, f.ranked));
  return items.length ? { items, notice: null } : { items: [], notice: NOTICE_NO_CHAINS };
}

function readingRows(f: OnboardingFacts): Rows {
  const notice = listNotice(f);
  if (notice) return { items: [], notice };
  return { items: fileRows(orderReadingPath(f.ranked)), notice: null };
}

function architectureItems(f: OnboardingFacts): OnboardingItem[] {
  return [
    ...f.stack.map((title) => ({ title, reason_source: 'deterministic' as const })),
    ...f.folders.slice(0, MAX_FOLDERS).map((d) => ({
      path: `${d.name}/`,
      reason: `${d.files} files`,
      reason_source: 'deterministic' as const,
    })),
  ];
}

function section(
  kind: OnboardingTourSection['kind'],
  items: OnboardingItem[],
  extra: { body?: string; diagram?: string | null; notice?: string | null } = {},
): OnboardingTourSection {
  return {
    kind,
    title: SECTION_TITLES[kind],
    body: extra.body ?? '',
    diagram: extra.diagram ?? null,
    links: [],
    items,
    ...(extra.notice ? { notice: extra.notice } : {}),
  };
}

function tourShell(f: OnboardingFacts, llm: OnboardingLlmMeta, now: Date) {
  return {
    generated_at: now.toISOString(),
    commit_sha: f.commitSha,
    index: {
      status: f.index.status,
      files_indexed: f.index.filesIndexed,
      files_total: f.index.filesTotal,
    },
    llm,
  };
}

function checklistFor(f: OnboardingFacts, commands: readonly string[]): OnboardingItem[] {
  return orientationChecklist({
    hasCommands: commands.length > 0,
    hasTestCommand: commands.some(isTestCommand),
    hasReadingPath: readingRows(f).items.length > 0,
  });
}

export function buildSkeleton(
  f: OnboardingFacts,
  reason: OnboardingSkeletonReason | null,
  llm: OnboardingLlmMeta,
  now: Date,
): OnboardingTour {
  const commands = deriveCommands(f);
  const critical = criticalRows(f);
  const reading = readingRows(f);
  return {
    ...tourShell(f, llm, now),
    source: 'skeleton',
    skeleton_reason: reason,
    sections: [
      section('architecture', architectureItems(f)),
      section('critical_paths', critical.items, { notice: critical.notice }),
      section('run_locally', commands.map((command) => ({ command, reason_source: 'deterministic' as const }))),
      section('reading_path', reading.items, { notice: reading.notice }),
      section('first_tasks', checklistFor(f, commands)),
    ],
  };
}

/** Attach the model's reasons to a deterministic list; nothing is added, dropped or reordered. */
function withReasons(items: OnboardingItem[], reasons: ReadonlyMap<string, string>): OnboardingItem[] {
  return items.map((item) => {
    const reason = item.path ? reasons.get(item.path) : undefined;
    return reason ? { ...item, reason, reason_source: 'llm' as const } : item;
  });
}

function reasonMap(entries: OnboardingLlmOutput['file_reasons'], allowed: ReadonlySet<string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of entries) {
    const reason = oneLine(e.reason);
    if (reason && allowed.has(e.path) && !out.has(e.path)) out.set(e.path, reason);
  }
  return out;
}

export function mergeTour(
  f: OnboardingFacts,
  out: OnboardingLlmOutput,
  existingTaskPaths: ReadonlySet<string>,
  llm: OnboardingLlmMeta,
  now: Date,
): OnboardingTour {
  const commands = deriveCommands(f);
  const critical = criticalRows(f);
  const reading = readingRows(f);

  const notes = new Map<string, string>();
  for (const n of out.command_notes) {
    const note = oneLine(n.note);
    if (note && commands.includes(n.command) && !notes.has(n.command)) notes.set(n.command, note);
  }
  const commandItems: OnboardingItem[] = commands.map((command) => {
    const note = notes.get(command);
    return note
      ? { command, note, reason_source: 'llm' as const }
      : { command, reason_source: 'deterministic' as const };
  });

  const tasks: OnboardingItem[] = [];
  for (const t of out.first_tasks) {
    if (tasks.length >= MAX_TASKS) break;
    const title = oneLine(t.title);
    if (!title || !existingTaskPaths.has(t.path)) continue;
    tasks.push({ title, path: t.path, reason: oneLine(t.reason), reason_source: 'llm' });
  }

  const criticalPaths = new Set(critical.items.map((i) => i.path!));
  const readingPaths = new Set(reading.items.map((i) => i.path!));

  return {
    ...tourShell(f, llm, now),
    source: 'llm',
    skeleton_reason: null,
    sections: [
      section('architecture', architectureItems(f), { body: out.overview, diagram: out.diagram }),
      section('critical_paths', withReasons(critical.items, reasonMap(out.file_reasons, criticalPaths)), {
        notice: critical.notice,
      }),
      section('run_locally', commandItems),
      section('reading_path', withReasons(reading.items, reasonMap(out.file_reasons, readingPaths)), {
        notice: reading.notice,
      }),
      section('first_tasks', tasks.length ? tasks : checklistFor(f, commands)),
    ],
  };
}

export function parseStoredTour(json: unknown): OnboardingTour | null {
  const parsed = OnboardingTourSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export function formatGenerationLog(r: {
  repo: string;
  llm: OnboardingLlmMeta;
  outcome: string;
  durationMs: number;
}): string {
  const { llm } = r;
  const model = llm.provider && llm.model ? `${llm.provider}/${llm.model}` : '—';
  const tokens = llm.tokens_in != null && llm.tokens_out != null ? `${llm.tokens_in}/${llm.tokens_out}` : '—/—';
  const cost = llm.cost_usd != null ? `$${llm.cost_usd.toFixed(4)}` : '—';
  return `onboarding generation repo=${r.repo} model=${model} llm_calls=${llm.calls} tokens ${tokens} ${cost} outcome=${r.outcome} duration_ms=${r.durationMs}`;
}
