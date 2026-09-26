import { createHash } from 'node:crypto';
import { z } from 'zod';
import { IntentChangeType, type IntentConfidence, type IntentSource } from '@devdigest/shared';
import { wrapUntrusted, type PromptIntent } from '@devdigest/reviewer-core';
import {
  INTENT_DATAMARK,
  INTENT_DOC_EXTENSIONS,
  INTENT_MIN_BODY_CHARS,
} from './intent-constants.js';

/**
 * Pure helpers for PR intent derivation: everything that can be unit-tested
 * without I/O. `intent-service.ts` is the only caller and owns the I/O
 * (fetching issues/docs, calling the model, persisting).
 */

// ---- LLM output schema — CODE decides confidence and sources, never the model ----
export const PrIntentExtraction = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  change_type: IntentChangeType,
});
export type PrIntentExtraction = z.infer<typeof PrIntentExtraction>;

// ---- Sanitisation --------------------------------------------------------

// Zero-width + bidi control characters that can hide or reorder text.
const ZERO_WIDTH_AND_BIDI_RE =
  /[​-‏‪-‮⁠-⁩﻿]/g;
// Unicode Tag block (U+E0000–U+E007F) — invisible "tag" characters used for
// steganographic prompt injection.
const UNICODE_TAGS_RE = /[\u{E0000}-\u{E007F}]/gu;
const HTML_COMMENTS_RE = /<!--[\s\S]*?-->/g;

/** Strip injection-prone invisible characters and cap length. Run BEFORE `datamark`. */
export function sanitizeSourceText(text: string, maxChars: number): string {
  const cleaned = text
    .replace(HTML_COMMENTS_RE, '')
    .replace(ZERO_WIDTH_AND_BIDI_RE, '')
    .replace(UNICODE_TAGS_RE, '');
  return cleaned.slice(0, maxChars);
}

/** Replace whitespace runs with the fixed datamark — see intent-constants.ts. */
export function datamark(text: string): string {
  return text.replace(/\s+/g, INTENT_DATAMARK);
}

// ---- Cache key --------------------------------------------------------

// A separator that cannot appear inside any hashed part (model id, prompt
// version, sanitised text) — a NUL byte, so two differently-split part lists
// can never collide onto the same hash.
const INPUT_HASH_SEPARATOR = '\u0000';

/**
 * A pure sha256 over the given parts (model id, `INTENT_PROMPT_VERSION`,
 * sanitised title/body, the rendered user message, …), joined by a byte that
 * cannot appear in any part. Local to this module — no platform/db import
 * (onion-architecture: application code stays pure; see F5).
 */
export function intentInputHash(...parts: string[]): string {
  return createHash('sha256').update(parts.join(INPUT_HASH_SEPARATOR)).digest('hex');
}

// ---- Confidence (code-derived, never the model) --------------------------

/**
 * `high` = a meaningful body (≥ INTENT_MIN_BODY_CHARS after sanitising) AND
 * ≥1 resolved linked issue or plan doc; `medium` = exactly one of the two;
 * `low` = neither. A ticket reference never counts — it's recorded but never
 * fetched, so it can't be "resolved".
 */
export function computeConfidence(
  sanitizedBody: string,
  sources: Pick<IntentSource, 'kind' | 'used'>[],
): IntentConfidence {
  const meaningfulBody = sanitizedBody.trim().length >= INTENT_MIN_BODY_CHARS;
  const hasResolvedIssueOrDoc = sources.some(
    (s) => s.used && (s.kind === 'issue' || s.kind === 'plan_doc'),
  );
  if (meaningfulBody && hasResolvedIssueOrDoc) return 'high';
  if (meaningfulBody || hasResolvedIssueOrDoc) return 'medium';
  return 'low';
}

// ---- Linked issues ---------------------------------------------------------

/**
 * Issue numbers referenced in `body`: closing-keyword references (`closes
 * #N`, `fixes owner/repo#N`, …) first, then any bare `#N` not already found.
 * A keyword reference naming a DIFFERENT owner/repo is skipped (only the
 * current repo's issues are fetched). GitHub's own keyword match ignores
 * negation ("does not close #N"), so this makes no relation distinction
 * either — every match is just "referenced".
 */
export function parseLinkedIssues(
  body: string,
  repo: { owner: string; name: string },
  cap: number,
): number[] {
  const found: number[] = [];
  const sameRepo = `${repo.owner}/${repo.name}`.toLowerCase();

  const keywordRe = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b\s*:?\s*([\w.-]+\/[\w.-]+)?#(\d{1,6})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = keywordRe.exec(body)) && found.length < cap) {
    const owner = m[1];
    const num = Number(m[2]);
    if (owner && owner.toLowerCase() !== sameRepo) continue;
    if (!found.includes(num)) found.push(num);
  }

  if (found.length < cap) {
    const bareRe = /(?:^|[^\w/])#(\d{1,6})\b/g;
    let b: RegExpExecArray | null;
    while ((b = bareRe.exec(body)) && found.length < cap) {
      const num = Number(b[1]);
      if (!found.includes(num)) found.push(num);
    }
  }

  return found.slice(0, cap);
}

// ---- Jira/Linear ticket keys (reference only, never fetched) --------------

/**
 * `TICKET-123`-shaped keys in `body` + `branch`. Excludes anything with a
 * `CVE-` prefix and anything followed by `-<digits>` (so `TICKET-12345-45`
 * and `CVE-2021-44228` never match).
 */
export function parseTicketKeys(body: string, branch: string, cap: number): string[] {
  const re = /\b(?!CVE-)([A-Z][A-Z0-9]{1,9})-(\d{1,6})(?!\d)(?!-\d)\b/g;
  const found = new Set<string>();
  for (const text of [body, branch]) {
    let m: RegExpExecArray | null;
    const scoped = new RegExp(re);
    while ((m = scoped.exec(text)) && found.size < cap) {
      found.add(`${m[1]}-${m[2]}`);
    }
  }
  return [...found].slice(0, cap);
}

// ---- Plan/spec doc links ([D2]) -------------------------------------------

const MD_LINK_TARGET_RE = /\]\(([^)\s]+)\)/g;
const BARE_URL_RE = /\bhttps?:\/\/\S+/g;
// A bare `path.md`-shaped token. The match must start at a token boundary —
// start-of-text, whitespace, or one of `( [ \` " '` — and NEVER right after
// `/`, `.`, `:` or a word char, so this can't re-match the tail of a URL or
// of a `../` path already captured (whole, unmodified) by BARE_URL_RE or
// MD_LINK_TARGET_RE. A leading run of `../` or `./` segments is captured as
// part of the SAME token (not just the trailing safe-looking remainder), so
// a `..`-prefixed candidate reaches isSafeRepoPath intact and gets rejected
// instead of silently losing its `..` prefix (finding A).
const BARE_PATH_RE = /(?<=^|[\s(\[`"'])(?:\.{1,2}\/)*[\w][\w./-]*\.(?:md|mdx|txt|rst)\b/gi;
const GITHUB_BLOB_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i;

/** A relative path with no `..` segment, no leading `/`, and no NUL byte. */
export function isSafeRepoPath(path: string): boolean {
  if (!path || path.includes('\0')) return false;
  if (path.startsWith('/')) return false;
  if (path.split('/').some((s) => s === '..')) return false;
  return true;
}

/** One of the recognised plan/spec doc extensions ([D2] / acceptance #4). */
export function hasDocExtension(path: string): boolean {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return false;
  return INTENT_DOC_EXTENSIONS.includes(path.slice(dot).toLowerCase());
}

export interface LinkedDocLink {
  /** Repo-relative path to read. */
  path: string;
  /** Ref named by a github.com blob URL (informational only — we always read
      from the local clone, so a doc added by the PR or from the base branch;
      see docFromAddedPatch / [D2] option A). */
  ref: string | null;
  /** Flattened original text, for logging. */
  raw: string;
}

export interface SkippedDocLink {
  raw: string;
  reason: 'external host' | 'unsafe path' | 'not a doc' | 'malformed';
}

function extractCandidateLinks(body: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const mdRe = new RegExp(MD_LINK_TARGET_RE);
  while ((m = mdRe.exec(body))) out.add(m[1]!);
  const urlRe = new RegExp(BARE_URL_RE);
  while ((m = urlRe.exec(body))) out.add(m[0]);
  const pathRe = new RegExp(BARE_PATH_RE);
  while ((m = pathRe.exec(body))) out.add(m[0]);
  return [...out];
}

function flattenForLog(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 120);
}

/**
 * Same-repo plan/spec doc links in `body`: a relative path, or
 * `https://github.com/<same owner>/<same repo>/blob/<ref>/<path>`. Everything
 * else (a different host, a different repo, `..`/absolute/NUL paths, a
 * non-doc extension) is rejected and returned in `skipped` for logging.
 */
export function parseLinkedDocs(
  body: string,
  repo: { owner: string; name: string },
  cap: number,
): { links: LinkedDocLink[]; skipped: SkippedDocLink[] } {
  const candidates = extractCandidateLinks(body);
  const links: LinkedDocLink[] = [];
  const skipped: SkippedDocLink[] = [];

  for (const raw of candidates) {
    if (links.length >= cap) break;
    const flat = flattenForLog(raw);

    if (/^https?:\/\//i.test(raw)) {
      const m = raw.match(GITHUB_BLOB_RE);
      if (!m) {
        skipped.push({ raw: flat, reason: 'external host' });
        continue;
      }
      const [, owner, name, ref, rawPath] = m as unknown as [string, string, string, string, string];
      if (owner.toLowerCase() !== repo.owner.toLowerCase() || name.toLowerCase() !== repo.name.toLowerCase()) {
        skipped.push({ raw: flat, reason: 'external host' });
        continue;
      }
      let path: string;
      try {
        path = decodeURIComponent(rawPath.split('?')[0]!.split('#')[0]!);
      } catch {
        // A path segment with an invalid %-escape (e.g. "%zz") must never
        // throw out of parseLinkedDocs — skip this link and keep resolving
        // the rest (acceptance criterion F4).
        skipped.push({ raw: flat, reason: 'malformed' });
        continue;
      }
      if (!isSafeRepoPath(path)) {
        skipped.push({ raw: flat, reason: 'unsafe path' });
        continue;
      }
      if (!hasDocExtension(path)) {
        skipped.push({ raw: flat, reason: 'not a doc' });
        continue;
      }
      links.push({ path, ref, raw: flat });
    } else {
      const path = raw.replace(/^\.\//, '');
      if (!isSafeRepoPath(path)) {
        skipped.push({ raw: flat, reason: 'unsafe path' });
        continue;
      }
      if (!hasDocExtension(path)) {
        skipped.push({ raw: flat, reason: 'not a doc' });
        continue;
      }
      links.push({ path, ref: null, raw: flat });
    }
  }

  return { links, skipped };
}

/**
 * Reconstruct a doc's content from the `+` lines of a unified-diff patch —
 * [D2] option A: when the doc was ADDED by this PR, read it from the patch
 * instead of the (pre-PR) base-branch clone.
 */
export function docFromAddedPatch(patch: string | null | undefined): string | null {
  if (!patch) return null;
  // Only a file the PR ADDS has its whole content in the patch (first hunk
  // `@@ -0,0 …`). A modified file's patch is just the changed hunks, so the
  // caller must read the full doc from the base branch instead [D2].
  const firstHunk = patch.split('\n').find((line) => line.startsWith('@@'));
  if (!firstHunk?.startsWith('@@ -0,0 ')) return null;
  const added: string[] = [];
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++')) continue;
    if (line.startsWith('+')) added.push(line.slice(1));
  }
  return added.length > 0 ? added.join('\n') : null;
}

// ---- Rendering the intent model's user message ----------------------------

export interface IntentSourceTexts {
  title: string;
  description: string | null;
  issues: { number: number; title: string; body: string }[];
  docs: { path: string; content: string }[];
  branch: string;
  commits: string[];
  paths: string[];
}

/**
 * Build the intent model's user message: one `wrapUntrusted` block per
 * source, constant labels only (`pr-title`, `pr-description`, `issue-${i}`,
 * `doc-${i}`, `pr-branch`, `pr-commits`, `pr-paths`), datamarked content.
 */
export function renderIntentSources(input: IntentSourceTexts): string {
  const sections: string[] = [];
  sections.push(`## PR title\n${wrapUntrusted('pr-title', datamark(input.title))}`);
  if (input.description) {
    sections.push(`## PR description\n${wrapUntrusted('pr-description', datamark(input.description))}`);
  }
  input.issues.forEach((issue, i) => {
    sections.push(
      `## Linked issue #${issue.number}\n${wrapUntrusted(`issue-${i}`, datamark(`${issue.title}\n\n${issue.body}`))}`,
    );
  });
  input.docs.forEach((doc, i) => {
    // The path comes from a link in the PR body — author-controlled, so it
    // rides inside the block, never in the constant header.
    sections.push(
      `## Plan/spec doc ${i + 1}\n${wrapUntrusted(`doc-${i}`, datamark(`${doc.path}\n\n${doc.content}`))}`,
    );
  });
  if (input.branch) sections.push(`## Branch name\n${wrapUntrusted('pr-branch', datamark(input.branch))}`);
  if (input.commits.length > 0) {
    sections.push(`## Commit subjects\n${wrapUntrusted('pr-commits', datamark(input.commits.join('\n')))}`);
  }
  if (input.paths.length > 0) {
    sections.push(`## Changed paths\n${wrapUntrusted('pr-paths', datamark(input.paths.join('\n')))}`);
  }
  return sections.join('\n\n');
}

// ---- Stored record → PromptIntent -----------------------------------------

export interface StoredIntent {
  intent: string;
  inScope: string[];
  outOfScope: string[];
  changeType: string | null;
  confidence: IntentConfidence;
  sources: IntentSource[];
}

/** Only USED sources are surfaced to the review prompt (a source that was
    considered but absent adds nothing for the reviewer to see). */
export function toPromptIntent(record: StoredIntent): PromptIntent {
  return {
    summary: record.intent,
    changeType: record.changeType ?? 'unknown',
    confidence: record.confidence,
    inScope: record.inScope,
    outOfScope: record.outOfScope,
    sources: record.sources.filter((s) => s.used).map((s) => s.ref),
  };
}
