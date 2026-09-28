import * as z from 'zod/v4';
import type { FindingRecord, ReviewRecord } from '@devdigest/shared';

/** Cuts `s` to at most `max` chars, appending "…" only when it actually had to cut. */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 0) return '';
  return `${s.slice(0, max - 1)}…`;
}

// ---- Output schemas (zod v4, key order matches the plan's Contracts & data) ----

export const FindingOut = z.object({
  severity: z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']),
  file: z.string(),
  line: z.number().int(),
  title: z.string(),
  body: z.string(),
});
export type FindingOut = z.infer<typeof FindingOut>;

export const ReviewOut = z.object({
  status: z.enum(['done', 'running']),
  run_id: z.string().nullable(),
  // Absent (not merely empty) on the still-running placeholder — a run in progress has no
  // resolved agent name to show yet; presentReview always fills it in for a done review.
  agent: z.string().optional(),
  verdict: z.enum(['request_changes', 'approve', 'comment']).nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  counts: z.object({
    critical: z.number().int(),
    warning: z.number().int(),
    suggestion: z.number().int(),
  }),
  findings: z.array(FindingOut),
  next_offset: z.number().int().nullable(),
  message: z.string().nullable(),
});
export type ReviewOut = z.infer<typeof ReviewOut>;

export const FindingsOut = z.object({
  repo: z.string(),
  pr: z.number().int(),
  response_format: z.enum(['concise', 'detailed']),
  reviews: z.array(ReviewOut),
  message: z.string().nullable(),
});
export type FindingsOut = z.infer<typeof FindingsOut>;

export const AgentOut = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  model: z.string(),
  enabled: z.boolean(),
});
export type AgentOut = z.infer<typeof AgentOut>;

export const ListAgentsOut = z.object({
  agents: z.array(AgentOut),
});
export type ListAgentsOut = z.infer<typeof ListAgentsOut>;

export const ConventionOut = z.object({
  category: z.string(),
  rule: z.string(),
  file: z.string(),
  line: z.number().int().nullable(),
});
export type ConventionOut = z.infer<typeof ConventionOut>;

export const ConventionsOut = z.object({
  repo: z.string(),
  conventions: z.array(ConventionOut),
  total: z.number().int(),
  truncated: z.boolean(),
  message: z.string().nullable(),
});
export type ConventionsOut = z.infer<typeof ConventionsOut>;

export const BlastRadiusOut = z.object({
  status: z.literal('not_implemented'),
  repo: z.string(),
  pr: z.number().int(),
  message: z.string(),
});
export type BlastRadiusOut = z.infer<typeof BlastRadiusOut>;

// ---- Review presentation (shared by runAgentOnPr and getFindings, app/reviews.ts) ----

const SEVERITY_RANK: Record<FindingRecord['severity'], number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

function sortFindings(findings: FindingRecord[]): FindingRecord[] {
  return [...findings].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const byFile = a.file.localeCompare(b.file);
    if (byFile !== 0) return byFile;
    return a.start_line - b.start_line;
  });
}

function countBySeverity(findings: FindingRecord[]): ReviewOut['counts'] {
  const counts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL') counts.critical++;
    else if (f.severity === 'WARNING') counts.warning++;
    else counts.suggestion++;
  }
  return counts;
}

/** Builds a `done` `ReviewOut` from a persisted `ReviewRecord`: counts over every finding,
 * then the requested page (`offset`, capped per `format`) of the CRITICAL>WARNING>SUGGESTION,
 * file, line sort. */
export function presentReview(
  review: ReviewRecord,
  opts: { format: 'concise' | 'detailed'; offset: number },
): ReviewOut {
  const sorted = sortFindings(review.findings);
  const counts = countBySeverity(review.findings);
  const cap = opts.format === 'concise' ? 15 : 20;
  const bodyMax = opts.format === 'concise' ? 200 : 1000;
  const page = sorted.slice(opts.offset, opts.offset + cap);
  const nextOffset = opts.offset + page.length;
  const hasMore = nextOffset < sorted.length;

  return {
    status: 'done',
    run_id: review.run_id,
    agent: review.agent_name ?? review.agent_id ?? 'unknown',
    verdict: review.verdict,
    score: review.score,
    summary: review.summary,
    counts,
    findings: page.map((f) => ({
      severity: f.severity,
      file: f.file,
      line: f.start_line,
      title: truncate(f.title, 120),
      body: truncate(f.rationale, bodyMax),
    })),
    next_offset: hasMore ? nextOffset : null,
    message: null,
  };
}
