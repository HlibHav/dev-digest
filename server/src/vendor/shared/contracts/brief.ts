import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

/**
 * Confidence in a derived PR intent — set by CODE from which sources actually
 * existed (never by the model): `high` = a meaningful body AND a resolved
 * linked issue or plan doc; `medium` = exactly one of the two; `low` = neither.
 */
export const IntentConfidence = z.enum(['high', 'medium', 'low']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

/** The kind of change a derived intent believes the PR makes. */
export const IntentChangeType = z.enum([
  'feature',
  'bugfix',
  'refactor',
  'perf',
  'docs',
  'test',
  'chore',
  'unknown',
]);
export type IntentChangeType = z.infer<typeof IntentChangeType>;

/** Which kind of source contributed to a derived intent. */
export const IntentSourceKind = z.enum([
  'title',
  'description',
  'issue',
  'ticket_ref',
  'plan_doc',
  'branch',
  'commits',
  'paths',
]);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

/** One source considered while deriving intent — whether it existed/was used. */
export const IntentSource = z.object({
  kind: IntentSourceKind,
  ref: z.string(),
  used: z.boolean(),
  note: z.string().nullish(),
});
export type IntentSource = z.infer<typeof IntentSource>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

/** Why a blast-radius result is incomplete (homework-5). */
export const BlastDegradedReason = z.enum([
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
]);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
  rank: z.number().nullish(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
  degraded: z.boolean().nullish(),
  reason: BlastDegradedReason.nullish(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const RiskLineRef = z.object({
  file: z.string(),
  start_line: z.number().int().min(1),
  end_line: z.number().int().min(1),
});
export type RiskLineRef = z.infer<typeof RiskLineRef>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string().max(160),
  explanation: z.string().max(800),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
  line_refs: z.array(RiskLineRef).optional(),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk).max(5),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const ReviewFocusItem = z.object({
  file: z.string(),
  line: z.number().int().min(1),
  reason: z.string().max(300),
});
export type ReviewFocusItem = z.infer<typeof ReviewFocusItem>;

export const BriefMissingInput = z.enum(['intent', 'blast', 'issue', 'specs', 'pr_description']);
export type BriefMissingInput = z.infer<typeof BriefMissingInput>;

export const BriefTruncatedInput = z.enum(['specs', 'issue', 'pr_description', 'callers', 'files']);
export type BriefTruncatedInput = z.infer<typeof BriefTruncatedInput>;

export const PrBriefBase = z.object({
  summary: z.string().max(1200),
  intent: Intent.nullable(),
  blast: BlastRadius.nullable(),
  risks: Risks,
  review_focus: z.array(ReviewFocusItem).max(6),
  history: PrHistory.nullable(),
  head_sha: z.string(),
  generated_at: z.string(),
  model: z.string(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  cost_usd: z.number().nullable(),
  missing_inputs: z.array(BriefMissingInput),
  truncated_inputs: z.array(BriefTruncatedInput),
});

/** Stored-brief rules the permissive model schema leaves out: a risk names files, line ranges run forward, and a line ref points at one of the risk's own files. */
export function briefCrossChecks(b: z.infer<typeof PrBriefBase>, ctx: z.RefinementCtx): void {
  b.risks.risks.forEach((risk, i) => {
    if (risk.file_refs.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['risks', 'risks', i, 'file_refs'], message: 'a risk needs at least one file ref' });
    }
    (risk.line_refs ?? []).forEach((ref, j) => {
      if (ref.end_line < ref.start_line) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['risks', 'risks', i, 'line_refs', j, 'end_line'], message: 'end_line is below start_line' });
      }
      if (!risk.file_refs.includes(ref.file)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['risks', 'risks', i, 'line_refs', j, 'file'], message: 'line ref file is not in the risk file_refs' });
      }
    });
  });
}

export const PrBrief = PrBriefBase.superRefine(briefCrossChecks);
export type PrBrief = z.infer<typeof PrBrief>;

export const PrBriefResult = PrBriefBase.extend({ stale: z.boolean() }).superRefine(briefCrossChecks);
export type PrBriefResult = z.infer<typeof PrBriefResult>;

export const PrBriefResponse = z.object({ brief: PrBriefResult.nullable() });
export type PrBriefResponse = z.infer<typeof PrBriefResponse>;

export const PrBriefGenerateResponse = z.object({ brief: PrBriefResult });
export type PrBriefGenerateResponse = z.infer<typeof PrBriefGenerateResponse>;
