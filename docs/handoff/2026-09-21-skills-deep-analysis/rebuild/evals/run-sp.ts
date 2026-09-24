#!/usr/bin/env -S node
/**
 * DevDigest API Contract Reviewer — eval harness (Analyst E / eval-harness).
 *
 * Assembles [system, user] with the REAL `assemblePrompt` from
 * reviewer-core/src/prompt.ts (imported directly by absolute path — that file
 * has no runtime deps, its only import is `import type {...} from
 * '@devdigest/shared'`, which tsx/esbuild strips at transpile time since it is
 * syntactically type-only, so it resolves fine even though this script lives
 * outside the reviewer-core package). No repo map, no callers, for every run
 * except `verify`.
 *
 * Usage (run with tsx from anywhere; node_modules used are reviewer-core's,
 * found by cwd when invoked as shown):
 *
 *   cd <repo>/reviewer-core
 *   node_modules/.bin/tsx <scratchpad>/evals/run.ts verify
 *   node_modules/.bin/tsx <scratchpad>/evals/run.ts run \
 *       --skills none|<scratchpad>/evals/skills-v0|<path-to-new-skills-dir> \
 *       [--cases id1,id2,...] [--providers deepinfra/fp8,parasail/fp8,open-inference/fp8] \
 *       [--n 4] [--out <scratchpad>/evals/results/baseline.jsonl] [--label skills-v0]
 *
 * One-command re-run of a NEW skills directory against the full case set,
 * all three providers, n=4 (see reports/E-eval-harness.md for the exact line):
 *
 *   node_modules/.bin/tsx run.ts run --skills /path/to/new-skills --label new-skills \
 *       --out ../results/new-skills.jsonl
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import {
  assemblePrompt,
  type PromptSkill,
} from '/Users/Glebazzz/Claude/PROJECTS/NEO/dev-digest/.claude/worktrees/h1-skill-size-hypothesis-7b81ce/reviewer-core/src/prompt.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRATCH = dirname(__dirname); // .../scratchpad
const EVALS = __dirname; // .../scratchpad/evals
const CASES_DIR = join(EVALS, 'cases');

const MODEL = 'deepseek/deepseek-v4-flash';
const EXPECTED_ALL5_MD5 = 'efe2022466b3f37b599e4cb3147db454';
const EXPECTED_NOSKILLS_MD5 = '9e5e904263dbd110be65fbee12c77b0a';
const MAX_CONCURRENCY = 3;
const CALL_TIMEOUT_MS = 150_000;
const DEFAULT_PROVIDERS = ['deepinfra/fp8', 'parasail/fp8', 'open-inference/fp8'];

// ---------------------------------------------------------------------------
// Types

interface CaseDef {
  id: string;
  kind: 'catch' | 'regression' | 'clean';
  defect: string;
  found_regex: string;
  must_block: boolean;
  must_not_flag_regex: string | null;
  task: string;
}

interface LoadedCase {
  def: CaseDef;
  description: string;
  diff: string;
  hunkRanges: Map<string, Array<[number, number]>>;
}

interface Finding {
  severity?: string;
  title?: string;
  rationale?: string;
  file?: string;
  start_line?: number;
  end_line?: number;
  [k: string]: unknown;
}

interface RunRow {
  case: string;
  kind: string;
  arm: string;
  provider: string;
  rep: number;
  ts: string;
  served_by?: string | null;
  gen_id?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  reasoning_tokens?: number | null;
  cost?: number | null;
  secs: number;
  verdict?: string | null;
  score?: number | null;
  n_findings?: number | null;
  n_critical?: number | null;
  found?: boolean | null;
  blocks?: boolean | null;
  /** Any WARNING/CRITICAL finding at all — the strict, kind-agnostic reading. */
  false_positive?: boolean | null;
  /**
   * Any WARNING/CRITICAL finding whose text matches `must_not_flag_regex` — i.e.
   * a finding actually ABOUT the thing the case says must not be flagged
   * (a claimed incompatibility, for `clean-optional-field`), as opposed to an
   * unrelated nitpick that also happens to be WARNING/CRITICAL. Only
   * meaningful when the case sets `must_not_flag_regex`; null otherwise.
   * NOTE: added after the initial 176-row baseline run — rows written before
   * this field existed do not have it (see reports/E-eval-harness.md).
   */
  contract_false_positive?: boolean | null;
  grounded?: boolean | null;
  matched_title?: string | null;
  matched_file?: string | null;
  matched_start_line?: number | null;
  matched_end_line?: number | null;
  /** Full findings, severity/title/rationale/file/lines only (trimmed — no
   * confidence/kind/etc.) — kept so a case.json regex can be re-graded from
   * this row without paying for another OpenRouter call. Added after the
   * initial baseline run; earlier rows don't have it (see report). */
  findings?: Array<Pick<Finding, 'severity' | 'title' | 'rationale' | 'file' | 'start_line' | 'end_line'>> | null;
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Skills loading

function stripFrontMatter(body: string): string {
  // Strip a leading YAML front-matter block (---\n...\n---\n) if present.
  // The v0 skills exported from the DB have none (bodies start with "# Title"),
  // but a skill-creator-style SKILL.md may, so the harness always checks.
  const m = body.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? body.slice(m[0].length) : body;
}

function loadSkills(skillsArg: string | null): PromptSkill[] {
  if (!skillsArg || skillsArg === 'none') return [];
  const dir = skillsArg.startsWith('/') ? skillsArg : join(SCRATCH, skillsArg);
  const entries = readdirSync(dir)
    .filter((e) => statSync(join(dir, e)).isDirectory())
    .sort(); // NN-name folders sort in the intended agent_skills order
  const skills: PromptSkill[] = [];
  for (const e of entries) {
    const skillMd = join(dir, e, 'SKILL.md');
    if (!existsSync(skillMd)) continue;
    const raw = readFileSync(skillMd, 'utf8');
    // NOTE: do not trim the stripped body — a skill's stored body can carry a
    // leading blank line (e.g. deprecation-policy does) that is part of its
    // exact byte content and must survive into renderSkillsBlock unchanged,
    // or the construction proof's md5 no longer matches.
    const body = stripFrontMatter(raw);
    const metaPath = join(dir, e, 'meta.json');
    let name = e.replace(/^\d+-/, '');
    let untrusted = false;
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      name = meta.name ?? name;
      untrusted = !!meta.untrusted;
    }
    skills.push({ name, body, untrusted });
  }
  return skills;
}

// ---------------------------------------------------------------------------
// Case loading + diff-hunk grounding (mirrors reviewer-core/src/grounding.ts's
// fallback range: [newStart, newStart + newLines - 1] per hunk, per file).

function parseDiffHunks(diffText: string): Map<string, Array<[number, number]>> {
  const map = new Map<string, Array<[number, number]>>();
  let currentFile: string | null = null;
  const fileHeaderRe = /^diff --git a\/(.*) b\/(.*)$/;
  const hunkHeaderRe = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
  for (const line of diffText.split('\n')) {
    const fm = line.match(fileHeaderRe);
    if (fm) {
      currentFile = fm[2];
      if (!map.has(currentFile)) map.set(currentFile, []);
      continue;
    }
    const hm = line.match(hunkHeaderRe);
    if (hm && currentFile) {
      const newStart = parseInt(hm[1], 10);
      const newLines = hm[2] !== undefined ? parseInt(hm[2], 10) : 1;
      map.get(currentFile)!.push([newStart, newStart + Math.max(newLines, 1) - 1]);
    }
  }
  return map;
}

function loadCase(id: string): LoadedCase {
  const dir = join(CASES_DIR, id);
  const def: CaseDef = JSON.parse(readFileSync(join(dir, 'case.json'), 'utf8'));
  const description = readFileSync(join(dir, 'description.md'), 'utf8');
  const diff = readFileSync(join(dir, 'diff.patch'), 'utf8');
  return { def, description, diff, hunkRanges: parseDiffHunks(diff) };
}

function listCaseIds(): string[] {
  return readdirSync(CASES_DIR)
    .filter((e) => statSync(join(CASES_DIR, e)).isDirectory())
    .sort();
}

// ---------------------------------------------------------------------------
// Agent system prompt

function loadAgentSystemPrompt(): string {
  const agent = JSON.parse(readFileSync(process.env.AGENT_JSON ?? join(EVALS, 'agent.json'), 'utf8'));
  return agent.system_prompt as string;
}

// ---------------------------------------------------------------------------
// OpenRouter call (mirrors h5.py / reviewer-core/src/llm/openrouter.ts:69 —
// same model, temperature 0, response_format json_schema strict, usage.include;
// ALWAYS pinned per the shared brief's hard rule 4, never unpinned).

function loadApiKey(): string {
  const p = join(homedir(), '.devdigest', 'secrets.json');
  const secrets = JSON.parse(readFileSync(p, 'utf8'));
  const key = secrets.OPENROUTER_API_KEY as string;
  if (!key) throw new Error('OPENROUTER_API_KEY missing from secrets.json');
  return key;
}

const REVIEW_SCHEMA = JSON.parse(readFileSync(join(SCRATCH, 'review_schema.json'), 'utf8'));
const API_KEY = loadApiKey();

async function callOpenRouter(
  system: string,
  user: string,
  providerTag: string,
): Promise<{
  served_by?: string;
  gen_id?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  reasoning_tokens?: number;
  cost?: number;
  content?: string;
  error?: string;
  secs: number;
}> {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'Review', schema: REVIEW_SCHEMA, strict: true },
    },
    usage: { include: true },
    provider: { order: [providerTag], allow_fallbacks: false },
  };
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const secs = (Date.now() - t0) / 1000;
    const text = await res.text();
    if (!res.ok) {
      return { error: `HTTP ${res.status}: ${text.slice(0, 300)}`, secs };
    }
    const json = JSON.parse(text);
    if (json.error) return { error: String(json.error).slice(0, 300), secs };
    const choice = (json.choices || [])[0] || {};
    const msg = choice.message || {};
    const usage = json.usage || {};
    return {
      served_by: json.provider,
      gen_id: json.id,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens,
      cost: usage.cost,
      content: msg.content || '',
      secs,
    };
  } catch (err: unknown) {
    const secs = (Date.now() - t0) / 1000;
    const e = err as Error;
    return { error: `${e.name}: ${e.message}`, secs };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Grading

function parseReview(content: string): { verdict?: string; score?: number; findings: Finding[] } | null {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const d = JSON.parse(m[0]);
    return { verdict: d.verdict, score: d.score, findings: d.findings || [] };
  } catch {
    return null;
  }
}

function findingText(f: Finding): string {
  return `${f.title || ''}\n${f.rationale || ''}`;
}

function grade(
  caseDef: CaseDef,
  hunkRanges: Map<string, Array<[number, number]>>,
  review: { verdict?: string; score?: number; findings: Finding[] } | null,
): Pick<
  RunRow,
  | 'verdict'
  | 'score'
  | 'n_findings'
  | 'n_critical'
  | 'found'
  | 'blocks'
  | 'false_positive'
  | 'contract_false_positive'
  | 'grounded'
  | 'matched_title'
  | 'matched_file'
  | 'matched_start_line'
  | 'matched_end_line'
  | 'findings'
> {
  if (!review) {
    return {
      verdict: null,
      score: null,
      n_findings: null,
      n_critical: null,
      found: null,
      blocks: null,
      false_positive: null,
      contract_false_positive: null,
      grounded: null,
      matched_title: null,
      matched_file: null,
      matched_start_line: null,
      matched_end_line: null,
      findings: null,
    };
  }
  const findings = review.findings;
  const critWarn = findings.filter((f) => ['CRITICAL', 'WARNING'].includes((f.severity || '').toUpperCase()));
  const nCritical = findings.filter((f) => (f.severity || '').toUpperCase() === 'CRITICAL').length;

  let matched: Finding | undefined;
  let found: boolean | null = null;
  let blocks: boolean | null = null;
  let grounded: boolean | null = null;

  if (caseDef.kind !== 'clean' && caseDef.found_regex) {
    const rx = new RegExp(caseDef.found_regex, 'is');
    matched = findings.find((f) => rx.test(findingText(f)));
    found = !!matched;
    blocks = !!matched && (matched.severity || '').toUpperCase() === 'CRITICAL';
    if (matched && matched.file && matched.start_line != null && matched.end_line != null) {
      const ranges = hunkRanges.get(matched.file) || [];
      grounded = ranges.some(([s, e]) => !(matched!.end_line! < s || matched!.start_line! > e));
    } else if (matched) {
      grounded = false; // matched but no usable file/line — can't be grounded
    }
  }

  // false_positive: ANY WARNING/CRITICAL at all (strict, kind-agnostic reading).
  // contract_false_positive: a WARNING/CRITICAL whose text actually matches
  // must_not_flag_regex — i.e. genuinely about the thing the case forbids
  // flagging (an incompatibility claim), not just any unrelated nitpick that
  // happens to be WARNING/CRITICAL. Distinguishing these matters: a skill
  // author optimizing against the broad field alone would also be penalized
  // for e.g. "duplicate React keys" nitpicks that have nothing to do with the
  // contract (see reports/E-eval-harness.md, "Baseline surprises" #3).
  let falsePositive = false;
  let contractFalsePositive: boolean | null = null;
  if (caseDef.kind === 'clean') {
    falsePositive = critWarn.length > 0;
    if (critWarn.length > 0) matched = critWarn[0];
  }
  if (caseDef.must_not_flag_regex) {
    const rx2 = new RegExp(caseDef.must_not_flag_regex, 'is');
    contractFalsePositive = critWarn.some((f) => rx2.test(findingText(f)));
    if (caseDef.kind !== 'clean') falsePositive = contractFalsePositive;
  }

  return {
    verdict: review.verdict ?? null,
    score: review.score ?? null,
    n_findings: findings.length,
    n_critical: nCritical,
    found,
    blocks,
    false_positive: falsePositive,
    contract_false_positive: contractFalsePositive,
    grounded: grounded ?? null,
    matched_title: matched?.title ?? null,
    matched_file: matched?.file ?? null,
    matched_start_line: matched?.start_line ?? null,
    matched_end_line: matched?.end_line ?? null,
    findings: findings.map((f) => ({
      severity: f.severity,
      title: f.title,
      rationale: f.rationale,
      file: f.file,
      start_line: f.start_line,
      end_line: f.end_line,
    })),
  };
}

// ---------------------------------------------------------------------------
// Concurrency-limited map

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(new Array(Math.min(limit, items.length)).fill(0).map(() => worker()));
  return results;
}

// ---------------------------------------------------------------------------
// verify: construction proof (repo map + callers from the stored trace, PR #8,
// current five skills from the DB — must reproduce the given md5).

function cmdVerify() {
  const system = loadAgentSystemPrompt();
  const skills = loadSkills('evals/skills-v0');
  const pr8 = loadCase('pr8-status-code');
  const repoMap = readFileSync(join(EVALS, 'pr8-repo-map.txt'), 'utf8');
  const callers = readFileSync(join(EVALS, 'pr8-callers.txt'), 'utf8');

  let allPass = true;

  // Arm 1: all five current skills — must reproduce the app's own PR #8 all-five prompt.
  const { assembly: all5 } = assemblePrompt({
    system,
    skills,
    task: pr8.def.task,
    prDescription: pr8.description,
    repoMap,
    callers,
    diff: pr8.diff,
  });
  const md5all5 = createHash('md5').update(all5.user).digest('hex');
  console.log('skills loaded:', skills.map((s) => `${s.name}${s.untrusted ? '[untrusted]' : ''}`).join(', '));
  console.log('[all5]     rebuilt user md5:', md5all5, 'expected:', EXPECTED_ALL5_MD5, md5all5 === EXPECTED_ALL5_MD5 ? 'PASS' : 'FAIL');
  allPass &&= md5all5 === EXPECTED_ALL5_MD5;

  // Arm 2: no skills — must ALSO reproduce the app's own PR #8 no-skills prompt (hard rule
  // 5: "no arm runs on an unverified construction" applies to every arm, not just all5).
  // Confirmed by inspection that prompt_no_skills.json and prompt_all5.json carry the same
  // repo_map/callers (same PR, same run window), so pr8-repo-map.txt / pr8-callers.txt cover
  // both arms — see evals/pr8-nosk-repo-map.txt / pr8-nosk-callers.txt (byte-identical to the
  // all5 files) for the independent extraction that established this.
  const { assembly: nosk } = assemblePrompt({
    system,
    skills: [],
    task: pr8.def.task,
    prDescription: pr8.description,
    repoMap,
    callers,
    diff: pr8.diff,
  });
  const md5nosk = createHash('md5').update(nosk.user).digest('hex');
  console.log('[no-skills] rebuilt user md5:', md5nosk, 'expected:', EXPECTED_NOSKILLS_MD5, md5nosk === EXPECTED_NOSKILLS_MD5 ? 'PASS' : 'FAIL');
  allPass &&= md5nosk === EXPECTED_NOSKILLS_MD5;

  console.log(allPass ? 'PASS — both arms verified' : 'FAIL — construction MISMATCH');
  if (!allPass) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// run: the baseline / arm runner

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = val;
    }
  }
  return out;
}

async function runJobs(
  label: string,
  system: string,
  skills: PromptSkill[],
  cases: Map<string, LoadedCase>,
  jobs: Array<{ caseId: string; provider: string; rep: number }>,
  outPath: string,
) {
  let done = 0;
  await mapLimit(jobs, MAX_CONCURRENCY, async (job) => {
    const c = cases.get(job.caseId)!;
    const { messages } = assemblePrompt({
      system,
      skills,
      task: c.def.task,
      prDescription: c.description,
      diff: c.diff, // no repoMap, no callers — see module docstring
    });
    const sys = messages[0].content;
    const usr = messages[1].content;
    const r = await callOpenRouter(sys, usr, job.provider);
    const review = r.content ? parseReview(r.content) : null;
    const g = grade(c.def, c.hunkRanges, review);
    const row: RunRow = {
      case: job.caseId,
      kind: c.def.kind,
      arm: label,
      provider: job.provider,
      rep: job.rep,
      ts: new Date().toISOString(),
      served_by: r.served_by ?? null,
      gen_id: r.gen_id ?? null,
      prompt_tokens: r.prompt_tokens ?? null,
      completion_tokens: r.completion_tokens ?? null,
      reasoning_tokens: r.reasoning_tokens ?? null,
      cost: r.cost ?? null,
      secs: r.secs,
      error: r.error ?? null,
      ...g,
    };
    appendFileSync(outPath, JSON.stringify(row) + '\n');
    done++;
    console.log(
      `[${done}/${jobs.length}] ${job.caseId} ${job.provider} #${job.rep} -> ` +
        (r.error ? `ERROR ${r.error.slice(0, 100)}` : `found=${g.found} blocks=${g.blocks} fp=${g.false_positive} verdict=${g.verdict} $${r.cost ?? '?'}`),
    );
  });
}

async function cmdRun(argv: string[]) {
  const args = parseArgs(argv);
  const skillsArg = args.skills ?? 'none';
  const label = args.label ?? (skillsArg === 'none' ? 'no-skills' : basename(skillsArg));
  const caseIds = args.cases ? args.cases.split(',') : listCaseIds();
  const providers = args.providers ? args.providers.split(',') : DEFAULT_PROVIDERS;
  const n = args.n ? parseInt(args.n, 10) : 4;
  const outPath = args.out ? (args.out.startsWith('/') ? args.out : join(SCRATCH, args.out)) : join(EVALS, 'results', 'baseline.jsonl');
  mkdirSync(dirname(outPath), { recursive: true });

  const system = loadAgentSystemPrompt();
  const skills = loadSkills(skillsArg);
  console.log(
    `arm=${label} skills=${skills.length}${skills.length ? ' (' + skills.map((s) => s.name).join(', ') + ')' : ''} ` +
      `cases=${caseIds.join(',')} providers=${providers.join(',')} n=${n} -> ${outPath}`,
  );

  const cases = new Map(caseIds.map((id) => [id, loadCase(id)]));

  const jobs: Array<{ caseId: string; provider: string; rep: number }> = [];
  for (const provider of providers) {
    for (const caseId of caseIds) {
      for (let rep = 1; rep <= n; rep++) jobs.push({ caseId, provider, rep });
    }
  }

  await runJobs(label, system, skills, cases, jobs, outPath);
  console.log('done ->', outPath);
}

/**
 * Top up a cell that fell short of n successes (e.g. deepinfra/fp8's frequent
 * upstream 429s) by issuing more reps, numbered starting after the highest rep
 * already recorded for that (case, arm, provider) in outPath, until each named
 * cell has `--target` non-error rows or `--max-extra` extra attempts have been
 * spent on it, whichever comes first. Never rewrites or removes existing rows.
 */
async function cmdTopup(argv: string[]) {
  const args = parseArgs(argv);
  const skillsArg = args.skills ?? 'none';
  const label = args.label ?? (skillsArg === 'none' ? 'no-skills' : basename(skillsArg));
  const caseIds = args.cases ? args.cases.split(',') : listCaseIds();
  const providers = args.providers ? args.providers.split(',') : DEFAULT_PROVIDERS;
  const target = args.target ? parseInt(args.target, 10) : 4;
  const maxExtra = args['max-extra'] ? parseInt(args['max-extra'], 10) : 8;
  const outPath = args.out ? (args.out.startsWith('/') ? args.out : join(SCRATCH, args.out)) : join(EVALS, 'results', 'baseline.jsonl');

  const existing: RunRow[] = existsSync(outPath)
    ? readFileSync(outPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

  const system = loadAgentSystemPrompt();
  const skills = loadSkills(skillsArg);
  const cases = new Map(caseIds.map((id) => [id, loadCase(id)]));

  const jobs: Array<{ caseId: string; provider: string; rep: number }> = [];
  for (const provider of providers) {
    for (const caseId of caseIds) {
      const rows = existing.filter((r) => r.case === caseId && r.arm === label && r.provider === provider);
      const okCount = rows.filter((r) => !r.error).length;
      const shortfall = Math.max(0, target - okCount);
      if (shortfall === 0) continue;
      const extra = Math.min(shortfall + 2, maxExtra); // pad by 2 to absorb likely retries' own failures
      const maxRep = rows.reduce((m, r) => Math.max(m, r.rep), 0);
      console.log(`topup ${caseId} ${label} ${provider}: have ${okCount}/${target} ok, requesting ${extra} more`);
      for (let i = 1; i <= extra; i++) jobs.push({ caseId, provider, rep: maxRep + i });
    }
  }
  if (jobs.length === 0) {
    console.log('nothing to top up — every requested cell already has', target, 'ok rows');
    return;
  }
  await runJobs(label, system, skills, cases, jobs, outPath);
  console.log('topup done ->', outPath);
}

// ---------------------------------------------------------------------------

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === 'verify') {
    cmdVerify();
  } else if (cmd === 'run') {
    await cmdRun(rest);
  } else if (cmd === 'topup') {
    await cmdTopup(rest);
  } else {
    console.error(
      'usage: tsx run.ts verify | run [--skills none|<dir>] [--cases a,b,c] [--providers p1,p2] [--n 4] [--out path] [--label name]' +
        ' | topup [--skills none|<dir>] [--label name] [--cases a,b,c] [--providers p1,p2] [--target 4] [--max-extra 8] [--out path]',
    );
    process.exitCode = 2;
  }
}

main();
