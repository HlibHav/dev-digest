import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSectionKind = z.enum([
  'architecture',
  'critical_paths',
  'run_locally',
  'reading_path',
  'first_tasks',
]);
export type OnboardingSectionKind = z.infer<typeof OnboardingSectionKind>;

export const OnboardingItem = z.object({
  path: z.string().nullish(),
  title: z.string().nullish(),
  reason: z.string().nullish(),
  command: z.string().nullish(),
  note: z.string().nullish(),
  reason_source: z.enum(['llm', 'deterministic']),
});
export type OnboardingItem = z.infer<typeof OnboardingItem>;

export const OnboardingSection = z.object({
  kind: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
  items: z.array(OnboardingItem).nullish(),
  notice: z.string().nullish(),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
});
export type Onboarding = z.infer<typeof Onboarding>;

export const OnboardingTourSection = OnboardingSection.extend({ kind: OnboardingSectionKind });
export type OnboardingTourSection = z.infer<typeof OnboardingTourSection>;

export const OnboardingIndexStatus = z.enum(['full', 'partial', 'unavailable', 'unsupported_languages']);
export type OnboardingIndexStatus = z.infer<typeof OnboardingIndexStatus>;

export const OnboardingSkeletonReason = z.enum(['llm_failed', 'timed_out', 'index_unavailable', 'error']);
export type OnboardingSkeletonReason = z.infer<typeof OnboardingSkeletonReason>;

export const OnboardingFailureReason = OnboardingSkeletonReason;
export type OnboardingFailureReason = z.infer<typeof OnboardingFailureReason>;

export const OnboardingLlmMeta = z.object({
  calls: z.number().int().min(0).max(1),
  provider: z.string().nullish(),
  model: z.string().nullish(),
  tokens_in: z.number().int().nullish(),
  tokens_out: z.number().int().nullish(),
  cost_usd: z.number().nullish(),
  duration_ms: z.number().int().nullish(),
});
export type OnboardingLlmMeta = z.infer<typeof OnboardingLlmMeta>;

export const OnboardingLastFailure = z.object({
  reason: OnboardingFailureReason,
  at: z.string(),
  llm: OnboardingLlmMeta,
});
export type OnboardingLastFailure = z.infer<typeof OnboardingLastFailure>;

export const OnboardingTour = z.object({
  generated_at: z.string(),
  commit_sha: z.string(),
  source: z.enum(['llm', 'skeleton']),
  skeleton_reason: OnboardingSkeletonReason.nullable(),
  index: z.object({
    status: OnboardingIndexStatus,
    files_indexed: z.number().int(),
    files_total: z.number().int(),
  }),
  llm: OnboardingLlmMeta,
  last_failure: OnboardingLastFailure.nullish(),
  sections: z.array(OnboardingTourSection).length(5),
});
export type OnboardingTour = z.infer<typeof OnboardingTour>;

export const OnboardingState = z.enum(['none', 'generating', 'ready']);
export type OnboardingState = z.infer<typeof OnboardingState>;

export const OnboardingView = z.object({
  cloned: z.boolean(),
  state: OnboardingState,
  repo_full_name: z.string(),
  index_commit_sha: z.string().nullable(),
  tour: OnboardingTour.nullable(),
});
export type OnboardingView = z.infer<typeof OnboardingView>;

export const OnboardingGenerateAccepted = z.object({ state: z.literal('generating') });
export type OnboardingGenerateAccepted = z.infer<typeof OnboardingGenerateAccepted>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum(['manual', 'imported_url', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

/**
 * Sources whose body is third-party text: an imported or community skill is
 * someone else's instructions arriving inside an agent's prompt. The server
 * delimiter-wraps those bodies (`renderSkillsBlock`) and the client badges them
 * as needing vetting, so the rule lives here rather than in either of them.
 */
export const UNTRUSTED_SKILL_SOURCES: readonly SkillSource[] = ['imported_url', 'community'];

export function isSkillUntrusted(source: string): boolean {
  return (UNTRUSTED_SKILL_SOURCES as readonly string[]).includes(source);
}

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
  /** How many agents link this skill. Read-only, computed on list/read. */
  agent_count: z.number().int().nullish(),
});
export type Skill = z.infer<typeof Skill>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions ----
// A candidate is a rule the extractor derived from sampled repo files, kept only
// when its snippet was found in the named file. `evidence_line` is the VERIFIED
// line, which is what the GitHub deep link points at.
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

export const ConventionCandidate = z.object({
  id: z.string(),
  category: z.string(),
  rule: z.string(),
  evidence_path: z.string(),
  evidence_line: z.number().int().positive().nullable(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

/** Status of the latest extract job for a repo, read from the `jobs` table. */
export const ConventionScan = z.object({
  job_id: z.string(),
  status: z.enum(['queued', 'running', 'done', 'failed']),
  error: z.string().nullable(),
  finished_at: z.string().nullable(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

export const ConventionsPage = z.object({
  candidates: z.array(ConventionCandidate),
  scan: ConventionScan.nullable(),
});
export type ConventionsPage = z.infer<typeof ConventionsPage>;

// ---- Agents ----
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a CI review should BLOCK (REQUEST_CHANGES + fail the
// check) vs just comment. Deterministic from severities; acted on ONLY in CI.
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
  // Receive the derived PR intent ("Stated intent (author's claim)") in this
  // agent's review prompt. Default OFF — security/correctness agents must opt
  // in deliberately; intent is context for scope only and never lowers a
  // finding's severity (enforced in the prompt, not here).
  uses_intent: z.boolean().default(false),
  // How many skills are linked to this agent. Filled by the list endpoint for
  // the agent tiles; absent where the count is not computed.
  skill_count: z.number().int().nullish(),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;
