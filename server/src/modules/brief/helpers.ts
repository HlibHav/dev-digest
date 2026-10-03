import type { BlastRadius, BriefMissingInput, ReviewFocusItem, Risk, RiskLineRef } from '@devdigest/shared';
import {
  BRIEF_MAX_FOCUS,
  BRIEF_MAX_FOCUS_REASON_CHARS,
  BRIEF_MAX_RISKS,
  BRIEF_MAX_RISK_EXPLANATION_CHARS,
  BRIEF_MAX_RISK_TITLE_CHARS,
  BRIEF_MAX_SUMMARY_CHARS,
} from './constants.js';
import type { PrBriefModelAnswer } from './schemas.js';

/** A run of changed lines on the new side of a file, 1-based and inclusive. */
export type ChangedRange = { start: number; end: number };

export type ValidationContext = {
  /** PR files and their changed ranges (empty = no diff text or a binary file). */
  prFiles: Map<string, ChangedRange[]>;
  /** Blast caller lines per file, ascending. */
  callerLines: Map<string, number[]>;
  /** Files named by the blast map: changed-symbol files and caller files. */
  blastFiles: Set<string>;
};

const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;

/**
 * Reads only the numbers of each hunk header (`@@ -a,b +c,d @@`) and returns the
 * new-side ranges. An omitted length is 1; a zero length (a pure deletion)
 * clamps to the single line `max(c, 1)`. Never returns patch text (AC-11).
 */
export function parseNewSideRanges(patch: string | null): ChangedRange[] {
  if (!patch) return [];
  const ranges: ChangedRange[] = [];
  for (const m of patch.matchAll(HUNK_HEADER_RE)) {
    const start = Number(m[1]);
    const length = m[2] === undefined ? 1 : Number(m[2]);
    if (length === 0) {
      const line = Math.max(start, 1);
      ranges.push({ start: line, end: line });
    } else {
      ranges.push({ start, end: start + length - 1 });
    }
  }
  return ranges;
}

export function buildValidationContext(
  files: { path: string; ranges: ChangedRange[] }[],
  blast: BlastRadius | null,
): ValidationContext {
  const prFiles = new Map<string, ChangedRange[]>();
  for (const f of files) prFiles.set(f.path, f.ranges);

  const callerLines = new Map<string, number[]>();
  const blastFiles = new Set<string>();
  for (const s of blast?.changed_symbols ?? []) blastFiles.add(s.file);
  for (const d of blast?.downstream ?? []) {
    for (const c of d.callers) {
      blastFiles.add(c.file);
      const lines = callerLines.get(c.file) ?? [];
      if (!lines.includes(c.line)) lines.push(c.line);
      callerLines.set(c.file, lines);
    }
  }
  for (const lines of callerLines.values()) lines.sort((a, b) => a - b);

  return { prFiles, callerLines, blastFiles };
}

const isKnownFile = (file: string, ctx: ValidationContext) => ctx.prFiles.has(file) || ctx.blastFiles.has(file);

/**
 * Snaps a line range of a known file to where the PR or the blast map can
 * point (AC-21, AC-21a). A PR file accepts a start inside a changed range
 * (end cut to that range) or, when the file is also in the blast map, a
 * caller line; a blast-only file accepts only caller lines.
 */
function snapRange(file: string, start: number, end: number, ctx: ValidationContext): ChangedRange {
  const callers = ctx.callerLines.get(file) ?? [];
  const ranges = ctx.prFiles.get(file);

  if (ranges !== undefined) {
    const hit = ranges.find((r) => start >= r.start && start <= r.end);
    if (hit) return { start, end: Math.min(Math.max(end, start), hit.end) };
    if (callers.includes(start)) return { start, end: start };
    const first = ranges[0];
    return first ? { start: first.start, end: first.end } : { start: 1, end: 1 };
  }

  if (callers.includes(start)) return { start, end: start };
  const first = callers[0] ?? 1;
  return { start: first, end: first };
}

export type NormalizedAnswer = {
  summary: string;
  risks: Risk[];
  review_focus: ReviewFocusItem[];
  droppedRisks: number;
  droppedFocus: number;
};

/**
 * Turns the model's permissive answer into the stored shape, in code: drop what
 * names no known file, snap lines, cap to 5 risks and 6 focus items (from the
 * end, after validation), then cut text to the stored limits. Keeps model order.
 */
export function normalizeAnswer(answer: PrBriefModelAnswer, ctx: ValidationContext): NormalizedAnswer {
  let droppedRisks = 0;
  const validRisks: Risk[] = [];
  for (const r of answer.risks) {
    const fileRefs = r.file_refs.filter((f) => isKnownFile(f, ctx));
    if (fileRefs.length === 0) {
      droppedRisks += 1;
      continue;
    }
    const lineRefs: RiskLineRef[] = (r.line_refs ?? [])
      .filter((l) => fileRefs.includes(l.file))
      .map((l) => {
        const range = snapRange(l.file, l.start_line, l.end_line, ctx);
        return { file: l.file, start_line: range.start, end_line: range.end };
      });
    validRisks.push({
      kind: r.kind,
      title: r.title,
      explanation: r.explanation,
      severity: r.severity,
      file_refs: fileRefs,
      ...(lineRefs.length > 0 ? { line_refs: lineRefs } : {}),
    });
  }

  let droppedFocus = 0;
  const validFocus: ReviewFocusItem[] = [];
  for (const f of answer.review_focus) {
    if (!isKnownFile(f.file, ctx)) {
      droppedFocus += 1;
      continue;
    }
    validFocus.push({ file: f.file, line: snapRange(f.file, f.line, f.line, ctx).start, reason: f.reason });
  }

  droppedRisks += Math.max(0, validRisks.length - BRIEF_MAX_RISKS);
  droppedFocus += Math.max(0, validFocus.length - BRIEF_MAX_FOCUS);

  return {
    summary: answer.summary.slice(0, BRIEF_MAX_SUMMARY_CHARS),
    risks: validRisks.slice(0, BRIEF_MAX_RISKS).map((r) => ({
      ...r,
      title: r.title.slice(0, BRIEF_MAX_RISK_TITLE_CHARS),
      explanation: r.explanation.slice(0, BRIEF_MAX_RISK_EXPLANATION_CHARS),
    })),
    review_focus: validFocus
      .slice(0, BRIEF_MAX_FOCUS)
      .map((f) => ({ ...f, reason: f.reason.slice(0, BRIEF_MAX_FOCUS_REASON_CHARS) })),
    droppedRisks,
    droppedFocus,
  };
}

/** Which inputs the brief had to do without (AC-28 and friends). */
export function computeMissingInputs(i: {
  intent: unknown | null;
  blast: BlastRadius | null;
  issueFound: boolean;
  specsRead: number;
  description: string | null;
}): BriefMissingInput[] {
  const missing: BriefMissingInput[] = [];
  if (!i.intent) missing.push('intent');
  if (!i.blast || i.blast.degraded === true) missing.push('blast');
  if (!i.issueFound) missing.push('issue');
  if (i.specsRead === 0) missing.push('specs');
  if (!i.description || i.description.trim() === '') missing.push('pr_description');
  return missing;
}
