import { z } from 'zod';
import { Finding, Severity, FindingCategory } from './findings.js';
import { EvalCase, Provider, ReviewStrategy } from './knowledge.js';

/**
 * Eval pipeline contracts: regression cases built from findings, suite runs,
 * code-only scoring and dashboards. Additive: the existing `EvalCase`,
 * `EvalRun` and eval-ci shapes are unchanged; nullable metrics live here.
 * Metric fields are `null` when undefined (e.g. no must_find expectation).
 */

// ---- Expectations ----
export const EvalExpectationType = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectationType = z.infer<typeof EvalExpectationType>;

export const EvalExpectation = z
  .object({
    type: EvalExpectationType,
    file: z.string().min(1),
    start_line: z.number().int().min(1),
    end_line: z.number().int().min(1),
    severity: Severity.optional(),
    category: FindingCategory.optional(),
    title: z.string().optional(),
  })
  .refine((e) => e.end_line >= e.start_line, {
    message: 'end_line must be >= start_line',
    path: ['end_line'],
  });
export type EvalExpectation = z.infer<typeof EvalExpectation>;

/** An empty list means "expect clean". */
export const EvalExpectedOutput = z.array(EvalExpectation);
export type EvalExpectedOutput = z.infer<typeof EvalExpectedOutput>;

// ---- Cases ----
export const EvalCaseMeta = z.object({ title: z.string(), body: z.string() });
export type EvalCaseMeta = z.infer<typeof EvalCaseMeta>;

export const EvalCaseSource = z.object({
  repo_id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int(),
});
export type EvalCaseSource = z.infer<typeof EvalCaseSource>;

export const EvalCaseResultStatus = z.enum(['running', 'passed', 'failed', 'errored']);
export type EvalCaseResultStatus = z.infer<typeof EvalCaseResultStatus>;

export const EvalCaseLastResult = z.object({
  status: z.enum(['passed', 'failed', 'errored']),
  matched: z.number().int(),
  expected: z.number().int(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  ran_at: z.string(),
});
export type EvalCaseLastResult = z.infer<typeof EvalCaseLastResult>;

export const EvalCaseView = EvalCase.extend({
  agent_id: z.string(),
  input_meta: EvalCaseMeta,
  expected_output: EvalExpectedOutput,
  source_finding_id: z.string().nullable(),
  source: EvalCaseSource.nullable(),
  last_result: EvalCaseLastResult.nullable(),
});
export type EvalCaseView = z.infer<typeof EvalCaseView>;

export const EvalCaseWrite = z.object({
  name: z.string().min(1),
  input_diff: z.string().min(1),
  input_meta: EvalCaseMeta,
  expected_output: EvalExpectedOutput,
  notes: z.string().nullable().optional(),
});
export type EvalCaseWrite = z.infer<typeof EvalCaseWrite>;

export const EvalCaseCreated = z.object({
  case: EvalCaseView,
  agent: z.object({ id: z.string(), name: z.string() }),
});
export type EvalCaseCreated = z.infer<typeof EvalCaseCreated>;

// ---- Case results ----
export const EvalDroppedFinding = z.object({ finding: Finding, reason: z.string() });
export type EvalDroppedFinding = z.infer<typeof EvalDroppedFinding>;

export const EvalCaseResult = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string(),
  suite_run_id: z.string().nullable(),
  ran_at: z.string(),
  status: EvalCaseResultStatus,
  error: z.string().nullable(),
  grounded_findings: z.array(Finding),
  dropped_findings: z.array(EvalDroppedFinding),
  matched_must_find: z.number().int(),
  must_find_total: z.number().int(),
  noise_count: z.number().int(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalCaseResult = z.infer<typeof EvalCaseResult>;

// ---- Suite runs ----
export const EvalSuiteStatus = z.enum(['running', 'done', 'partial', 'failed']);
export type EvalSuiteStatus = z.infer<typeof EvalSuiteStatus>;

export const EvalScoredCase = z.object({
  case_id: z.string(),
  case_name: z.string(),
  status: z.enum(['passed', 'failed', 'errored']),
});
export type EvalScoredCase = z.infer<typeof EvalScoredCase>;

export const EvalSnapshotSkill = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int(),
  body: z.string(),
});
export type EvalSnapshotSkill = z.infer<typeof EvalSnapshotSkill>;

export const EvalAgentSnapshot = z.object({
  system_prompt: z.string(),
  model: z.string(),
  provider: Provider,
  strategy: ReviewStrategy,
  skills: z.array(EvalSnapshotSkill),
});
export type EvalAgentSnapshot = z.infer<typeof EvalAgentSnapshot>;

export const EvalSuiteRunSummary = z.object({
  id: z.string(),
  agent_id: z.string(),
  run_number: z.number().int(),
  agent_version: z.number().int(),
  status: EvalSuiteStatus,
  error: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  cases_total: z.number().int(),
  cases_done: z.number().int(),
  cases_passed: z.number().int(),
  cases_errored: z.number().int(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  cost_usd: z.number().nullable(),
  cost_partial: z.boolean(),
  duration_ms: z.number().int().nullable(),
  scored_cases: z.array(EvalScoredCase),
});
export type EvalSuiteRunSummary = z.infer<typeof EvalSuiteRunSummary>;

export const EvalSuiteRun = EvalSuiteRunSummary.extend({ snapshot: EvalAgentSnapshot });
export type EvalSuiteRun = z.infer<typeof EvalSuiteRun>;

export const EvalSuiteRunDetail = EvalSuiteRun.extend({ case_results: z.array(EvalCaseResult) });
export type EvalSuiteRunDetail = z.infer<typeof EvalSuiteRunDetail>;

export const EvalSuiteRunAccepted = z.object({
  suite_run_id: z.string(),
  status: z.literal('running'),
  run_number: z.number().int(),
  cases_total: z.number().int(),
});
export type EvalSuiteRunAccepted = z.infer<typeof EvalSuiteRunAccepted>;

export const EvalCaseRunAccepted = z.object({
  case_run_id: z.string(),
  status: z.literal('running'),
});
export type EvalCaseRunAccepted = z.infer<typeof EvalCaseRunAccepted>;

export const EvalSkipReason = z.enum(['disabled', 'no cases', 'too many cases', 'already running']);
export type EvalSkipReason = z.infer<typeof EvalSkipReason>;

export const EvalRunAllResult = z.object({
  started: z.array(z.object({ agent_id: z.string(), suite_run_id: z.string() })),
  skipped: z.array(z.object({ agent_id: z.string(), reason: EvalSkipReason })),
});
export type EvalRunAllResult = z.infer<typeof EvalRunAllResult>;

// ---- Compare ----
export const EvalMetricName = z.enum(['recall', 'precision', 'citation_accuracy']);
export type EvalMetricName = z.infer<typeof EvalMetricName>;

export const EvalMetricDeltas = z.object({
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalMetricDeltas = z.infer<typeof EvalMetricDeltas>;

export const EvalPromptDiffLine = z.object({
  op: z.enum(['equal', 'add', 'remove']),
  text: z.string(),
});
export type EvalPromptDiffLine = z.infer<typeof EvalPromptDiffLine>;

export const EvalConfigChange = z.object({
  kind: z.enum(['model', 'provider', 'strategy', 'skill_added', 'skill_removed', 'skill_version']),
  name: z.string().nullable(),
  from: z.string().nullable(),
  to: z.string().nullable(),
});
export type EvalConfigChange = z.infer<typeof EvalConfigChange>;

export const EvalCompare = z.object({
  base: EvalSuiteRunSummary,
  head: EvalSuiteRunSummary,
  deltas: EvalMetricDeltas,
  prompt_diff: z.array(EvalPromptDiffLine),
  config_changes: z.array(EvalConfigChange),
  case_set: z.object({ added: z.number().int(), removed: z.number().int() }),
});
export type EvalCompare = z.infer<typeof EvalCompare>;

// ---- Dashboards ----
export const EvalRegressionAlert = z.object({
  run_number: z.number().int(),
  agent_version: z.number().int(),
  drops: z.array(z.object({ metric: EvalMetricName, points: z.number().int() })),
});
export type EvalRegressionAlert = z.infer<typeof EvalRegressionAlert>;

export const EvalTrendRunPoint = z.object({
  suite_run_id: z.string(),
  run_number: z.number().int(),
  agent_version: z.number().int(),
  started_at: z.string(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendRunPoint = z.infer<typeof EvalTrendRunPoint>;

export const EvalAgentDashboard = z.object({
  agent: z.object({ id: z.string(), name: z.string(), model: z.string() }),
  cases_total: z.number().int(),
  latest: EvalSuiteRunSummary.nullable(),
  previous: EvalSuiteRunSummary.nullable(),
  deltas: EvalMetricDeltas,
  trend: z.array(EvalTrendRunPoint),
  history: z.array(EvalSuiteRunSummary),
  alert: EvalRegressionAlert.nullable(),
});
export type EvalAgentDashboard = z.infer<typeof EvalAgentDashboard>;

export const EvalWorkspaceAgentRow = z.object({
  agent_id: z.string(),
  name: z.string(),
  model: z.string(),
  cases_total: z.number().int(),
  latest: EvalSuiteRunSummary.nullable(),
  recall_trend: z.array(z.number().nullable()),
});
export type EvalWorkspaceAgentRow = z.infer<typeof EvalWorkspaceAgentRow>;

export const EvalRecentRun = EvalSuiteRunSummary.extend({ agent_name: z.string() });
export type EvalRecentRun = z.infer<typeof EvalRecentRun>;

export const EvalWorkspaceDashboard = z.object({
  agents: z.array(EvalWorkspaceAgentRow),
  recent_runs: z.array(EvalRecentRun),
});
export type EvalWorkspaceDashboard = z.infer<typeof EvalWorkspaceDashboard>;
