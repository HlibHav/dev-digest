/* Pure helpers for convention extraction: sampling, evidence verification and
   skill assembly. No I/O, no container, no model — everything here is a
   function of its arguments, which is what lets the unit tests cover the two
   rules that matter (samples are chosen by code, evidence is proven by code). */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ConventionCandidate, ConventionStatus } from '@devdigest/shared';
import {
  CONFIG_SAMPLE_PATHS,
  MAX_CANDIDATES,
  SAMPLE_MAX_CHARS,
  SAMPLE_MAX_LINES,
} from './constants.js';

export interface SampleFile {
  path: string;
  content: string;
}

/**
 * What the model is asked to return, before any of it is believed.
 *
 * The schema lives here rather than in the service so the service stays free of
 * zod and reads as orchestration, and so the verifier and the shape it verifies
 * sit in one file.
 */
export const RawCandidate = z.object({
  category: z.string(),
  rule: z.string(),
  evidence: z.object({
    path: z.string(),
    line: z.number().int(),
    snippet: z.string(),
  }),
  confidence: z.number(),
});
export type RawCandidate = z.infer<typeof RawCandidate>;

export const ExtractionResult = z.object({
  candidates: z.array(RawCandidate).max(MAX_CANDIDATES),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;

/** A candidate whose snippet was located in the named file. */
export interface VerifiedCandidate {
  category: string;
  rule: string;
  evidencePath: string;
  evidenceLine: number;
  evidenceSnippet: string;
  confidence: number;
  ruleHash: string;
}

export interface ConventionRow {
  id: string;
  category: string;
  rule: string;
  evidencePath: string | null;
  evidenceLine: number | null;
  evidenceSnippet: string | null;
  confidence: number | null;
  status: ConventionStatus;
}

/**
 * Config files present in the repo, in declared order.
 *
 * Deliberately code, not a model call: the lesson requires sample selection to
 * be deterministic, and a config file is a declared convention — there is
 * nothing to infer about whether it belongs in the sample.
 */
export function pickConfigPaths(repoPaths: Iterable<string>): string[] {
  const present = new Set(repoPaths);
  return CONFIG_SAMPLE_PATHS.filter((p) => present.has(p));
}

/** Cap a sampled file so one large module cannot eat the prompt budget. */
export function truncateSample(content: string): string {
  const byLine = content.split('\n').slice(0, SAMPLE_MAX_LINES).join('\n');
  return byLine.length > SAMPLE_MAX_CHARS ? byLine.slice(0, SAMPLE_MAX_CHARS) : byLine;
}

/** Render samples for the prompt with 1-based line numbers, so the model can
    cite a line and we can check the citation. */
export function renderSamples(samples: readonly SampleFile[]): string {
  return samples
    .map((s) => {
      const numbered = s.content
        .split('\n')
        .map((line, i) => `${i + 1}: ${line}`)
        .join('\n');
      return `--- ${s.path} ---\n${numbered}`;
    })
    .join('\n\n');
}

/** Case- and whitespace-insensitive form used for the dedupe key. */
export function normalizeRule(rule: string): string {
  return rule.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function ruleHash(rule: string): string {
  return createHash('sha256').update(normalizeRule(rule)).digest('hex').slice(0, 32);
}

/** Collapse a snippet to something comparable against a source line. */
function normalizeCode(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** The first line of a snippet that has any content — a model often quotes a
    block, and only its opening line has to be locatable. */
function firstMeaningfulLine(snippet: string): string {
  for (const line of snippet.split('\n')) {
    if (normalizeCode(line).length > 0) return line;
  }
  return '';
}

/**
 * Locate a snippet in a file, returning its 1-based line, or null.
 *
 * Note what this does NOT do: check that line N exists. Any file longer than N
 * passes that test, which would let an invented citation through and point the
 * GitHub link at unrelated code. We look for the text instead.
 */
export function findSnippetLine(content: string, snippet: string): number | null {
  const needle = normalizeCode(firstMeaningfulLine(snippet));
  if (needle.length === 0) return null;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (normalizeCode(lines[i] ?? '').includes(needle)) return i + 1;
  }
  return null;
}

/** Match a cited path against the sampled files, tolerating a leading `./` or a
    repo-name prefix the model may have added. */
export function matchSample(
  samples: readonly SampleFile[],
  citedPath: string,
): SampleFile | undefined {
  const cited = citedPath.replace(/^\.?\//, '');
  const exact = samples.find((s) => s.path === cited);
  if (exact) return exact;
  return samples.find((s) => s.path.endsWith(`/${cited}`) || cited.endsWith(`/${s.path}`));
}

/**
 * Keep only candidates whose evidence is real.
 *
 * A candidate citing a file we never sampled is dropped; so is one whose
 * snippet is nowhere in that file. When the snippet IS found but at a different
 * line than claimed, the line is corrected rather than the candidate discarded
 * — the model misremembering a number is not a reason to lose a true rule, and
 * the corrected line is what the deep link needs.
 */
export function verifyCandidates(
  raws: readonly RawCandidate[],
  samples: readonly SampleFile[],
): VerifiedCandidate[] {
  const out: VerifiedCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of raws) {
    const rule = raw.rule?.trim();
    if (!rule) continue;
    const sample = matchSample(samples, raw.evidence?.path ?? '');
    if (!sample) continue;
    const line = findSnippetLine(sample.content, raw.evidence?.snippet ?? '');
    if (line === null) continue;
    const hash = ruleHash(rule);
    if (seen.has(hash)) continue;
    seen.add(hash);
    out.push({
      category: (raw.category || 'general').trim(),
      rule,
      evidencePath: sample.path,
      evidenceLine: line,
      evidenceSnippet: raw.evidence.snippet.trim(),
      confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
      ruleHash: hash,
    });
  }
  return out;
}

export function toCandidateDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    category: row.category,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_line: row.evidenceLine,
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    status: row.status,
  };
}

/**
 * Assemble accepted candidates into the body of the `repo-conventions` skill.
 *
 * Grouped by category so a reviewer reads related rules together, and every
 * rule keeps its evidence path and line — a rule a reviewer cannot trace back
 * to real code is one they cannot act on.
 */
export function buildSkillBody(
  candidates: readonly ConventionRow[],
  repoFullName: string,
): string {
  const groups = new Map<string, ConventionRow[]>();
  for (const c of candidates) {
    const key = c.category || 'general';
    const list = groups.get(key);
    if (list) list.push(c);
    else groups.set(key, [c]);
  }

  const sections = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, rules]) => {
      const body = rules
        .map((r) => {
          const where = r.evidencePath
            ? ` Evidence: \`${r.evidencePath}${r.evidenceLine ? `:${r.evidenceLine}` : ''}\``
            : '';
          return `- ${r.rule}${where}`;
        })
        .join('\n');
      return `## ${category}\n\n${body}`;
    });

  return [
    `# Repo conventions — ${repoFullName}`,
    '',
    'Rules extracted from this repository and approved by a maintainer. Flag a',
    'diff that breaks one of them, and cite the rule. These describe how THIS',
    'repo is written; do not apply them to code outside it.',
    '',
    ...sections,
  ].join('\n');
}
