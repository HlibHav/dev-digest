#!/usr/bin/env -S node
/**
 * DevDigest Test Quality Reviewer — eval harness (Analyst T2 / test-quality-cases).
 *
 * Adapted from Analyst E's evals/run.ts (API Contract Reviewer harness) with the
 * agent made configurable: this file loads the Test Quality Reviewer's real
 * `system_prompt` (agent id f3451435-c875-42f3-b115-7f9b29d7ff69) from
 * evals-tq/agent-tq.json (a DB dump, see reports/T2-*.md for the exact query),
 * and its two current skills (branch-coverage-gate, test-smells) exported to
 * evals-tq/skills-tq-v0/. Otherwise identical mechanics: the REAL `assemblePrompt`
 * from reviewer-core/src/prompt.ts, no repo map / no callers on non-verify runs,
 * pinned OpenRouter calls at temperature 0.
 *
 * Providers are Parasail (reasons) and AtlasCloud (reasoning fallback) per this
 * task's brief — NOT open-inference/deepinfra (those are the OTHER analyst's
 * providers for the API Contract fixture).
 *
 * Usage (run with tsx from reviewer-core/, so its node_modules resolve):
 *
 *   cd <repo>/reviewer-core
 *   node_modules/.bin/tsx <scratchpad>/evals-tq/run-tq.ts verify
 *   node_modules/.bin/tsx <scratchpad>/evals-tq/run-tq.ts run \
 *       --skills none|<scratchpad>/evals-tq/skills-tq-v0|<path> \
 *       [--cases id1,id2,...] [--providers parasail/fp8,atlas-cloud/fp4] \
 *       [--n 6] [--out <scratchpad>/evals-tq/results/x.jsonl] [--label skills-tq-v0]
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
const EVALS = __dirname; // .../scratchpad/evals-tq
const SCRATCH = dirname(EVALS); // .../scratchpad (shared review_schema.json, secrets lookup unchanged)
const CASES_DIR = join(EVALS, 'cases');

const MODEL = 'deepseek/deepseek-v4-flash';
// PR #9 (real, seeded DB fixture, run_traces run_id 2ea96545-6b76-4c0a-9900-913e4f0022d8 /
// 06bf144f-6e53-492e-8b35-92aa5a5ab2d8), current agent version — see reports/T2-*.md "Construction proof".
const EXPECTED_SKILLS_MD5 = 'c31611d60531d2993cf9114708cdf136';
const EXPECTED_NOSKILLS_MD5 = 'fe278743bc008f8e975a3214e940e86c';
const MAX_CONCURRENCY = 3;
const CALL_TIMEOUT_MS = 150_000;
const DEFAULT_PROVIDERS = ['parasail/fp8', 'atlas-cloud/fp4'];

// ---------------------------------------------------------------------------
// Types (identical to Analyst E's harness)

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
  false_positive?: boolean | null;
  contract_false_positive?: boolean | null;
  grounded?: boolean | null;
  matched_title?: string | null;
  matched_file?: string | null;
  matched_start_line?: number | null;
  matched_end_line?: number | null;
  findings?: Array<Pick<Finding, 'severity' | 'title' | 'rationale' | 'file' | 'start_line' | 'end_line'>> | null;
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Skills loading (unchanged from Analyst E's harness)

function stripFrontMatter(body: string): string {
  const m = body.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? body.slice(m[0].length) : body;
}

function loadSkills(skillsArg: string | null): PromptSkill[] {
  if (!skillsArg || skillsArg === 'none') return [];
  const dir = skillsArg.startsWith('/') ? skillsArg : join(SCRATCH, skillsArg);
  const entries = readdirSync(dir)
    .filter((e) => statSync(join(dir, e)).isDirectory())
    .sort();
  const skills: PromptSkill[] = [];
  for (const e of entries) {
    const skillMd = join(dir, e, 'SKILL.md');
    if (!existsSync(skillMd)) continue;
    const raw = readFileSync(skillMd, 'utf8');
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
// Case loading + diff-hunk grounding (identical fallback range logic)

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
// Agent system prompt — Test Quality Reviewer, from evals-tq/agent-tq.json

function loadAgentSystemPrompt(): string {
  const agent = JSON.parse(readFileSync(join(EVALS, 'agent-tq.json'), 'utf8'));
  return agent.system_prompt as string;
}

// ---------------------------------------------------------------------------
// OpenRouter call (identical to Analyst E's harness / h5.py / reviewer-core's
// own openrouter.ts:69 — same model, temperature 0, strict json_schema, pinned).

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
// Grading (identical to Analyst E's harness)

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
      grounded = false;
    }
  }

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
// Concurrency-limited map (identical)

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
// verify: construction proof against the REAL PR #9 stored trace (a seeded DB
// fixture PR whose description literally says "Fixture PR for the Test Quality
// Reviewer control experiment"), current agent, both arms.

function cmdVerify() {
  const system = loadAgentSystemPrompt();
  const skills = loadSkills('evals-tq/skills-tq-v0');
  const task = readFileSync(join(EVALS, 'pr9-task.txt'), 'utf8');
  const description = readFileSync(join(EVALS, 'pr9-nosk-pr_description.txt'), 'utf8');
  const diff = readFileSync(join(EVALS, 'pr9-diff.txt'), 'utf8');
  const repoMap = readFileSync(join(EVALS, 'pr9-nosk-repo_map.txt'), 'utf8');
  // callers: stored field is empty/null for this run — pass '' (assemblePrompt omits the
  // section when repoMap/callers are empty after .trim(), same as the app would).
  const callers = '';

  let allPass = true;

  const { assembly: withSkills } = assemblePrompt({
    system,
    skills,
    task,
    prDescription: description,
    repoMap,
    callers,
    diff,
  });
  const md5skills = createHash('md5').update(withSkills.user).digest('hex');
  console.log('skills loaded:', skills.map((s) => `${s.name}${s.untrusted ? '[untrusted]' : ''}`).join(', '));
  console.log('[skills]    rebuilt user md5:', md5skills, 'expected:', EXPECTED_SKILLS_MD5, md5skills === EXPECTED_SKILLS_MD5 ? 'PASS' : 'FAIL');
  allPass &&= md5skills === EXPECTED_SKILLS_MD5;

  const { assembly: noSkills } = assemblePrompt({
    system,
    skills: [],
    task,
    prDescription: description,
    repoMap,
    callers,
    diff,
  });
  const md5nosk = createHash('md5').update(noSkills.user).digest('hex');
  console.log('[no-skills] rebuilt user md5:', md5nosk, 'expected:', EXPECTED_NOSKILLS_MD5, md5nosk === EXPECTED_NOSKILLS_MD5 ? 'PASS' : 'FAIL');
  allPass &&= md5nosk === EXPECTED_NOSKILLS_MD5;

  console.log(allPass ? 'PASS — both arms verified (PR #9, current Test Quality Reviewer agent)' : 'FAIL — construction MISMATCH');
  if (!allPass) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// run: the baseline / arm runner (identical mechanics; no repo map / callers,
// per the shared brief, for every non-verify run)

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
      diff: c.diff,
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
  const n = args.n ? parseInt(args.n, 10) : 6;
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

async function cmdTopup(argv: string[]) {
  const args = parseArgs(argv);
  const skillsArg = args.skills ?? 'none';
  const label = args.label ?? (skillsArg === 'none' ? 'no-skills' : basename(skillsArg));
  const caseIds = args.cases ? args.cases.split(',') : listCaseIds();
  const providers = args.providers ? args.providers.split(',') : DEFAULT_PROVIDERS;
  const target = args.target ? parseInt(args.target, 10) : 6;
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
      const extra = Math.min(shortfall + 2, maxExtra);
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
      'usage: tsx run-tq.ts verify | run [--skills none|<dir>] [--cases a,b,c] [--providers p1,p2] [--n 6] [--out path] [--label name]' +
        ' | topup [--skills none|<dir>] [--label name] [--cases a,b,c] [--providers p1,p2] [--target 6] [--max-extra 8] [--out path]',
    );
    process.exitCode = 2;
  }
}

main();
