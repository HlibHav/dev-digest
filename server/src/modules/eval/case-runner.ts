import { reviewPullRequest } from '@devdigest/reviewer-core';
import type {
  EvalCaseMeta,
  EvalDroppedFinding,
  Finding,
  LLMProvider,
  Provider,
  UnifiedDiff,
} from '@devdigest/shared';
import { EVAL_TASK } from './constants.js';
import { prDescription } from './helpers.js';
import type { EvalAgent, EvalSkill } from './types.js';

export interface CaseRunnerPorts {
  llm(provider: Provider): Promise<LLMProvider>;
  parseDiff(raw: string): UnifiedDiff;
  nowMs(): number;
}

export interface CaseRunInput {
  inputDiff: string;
  meta: EvalCaseMeta;
  agent: EvalAgent;
  skills: readonly EvalSkill[];
}

export interface CaseRunOutput {
  grounded: Finding[];
  dropped: EvalDroppedFinding[];
  costUsd: number | null;
  durationMs: number;
}

/**
 * Run one eval case through the review engine with fixed inputs only: the case
 * diff, the case title and body (as an untrusted PR description), and the
 * agent's prompt, model, strategy and skills. No memory, specs, intent, callers
 * or repo map. A model error is rethrown for the caller to record.
 */
export async function runEvalCase(ports: CaseRunnerPorts, input: CaseRunInput): Promise<CaseRunOutput> {
  const startedAt = ports.nowMs();
  const llm = await ports.llm(input.agent.provider);
  const description = prDescription(input.meta);
  const outcome = await reviewPullRequest({
    systemPrompt: input.agent.systemPrompt,
    model: input.agent.model,
    diff: ports.parseDiff(input.inputDiff),
    llm,
    strategy: input.agent.strategy,
    ...(input.skills.length > 0
      ? { skills: input.skills.map((s) => ({ name: s.name, body: s.body, untrusted: s.untrusted })) }
      : {}),
    ...(description !== undefined ? { prDescription: description } : {}),
    task: EVAL_TASK,
  });
  return {
    grounded: outcome.review.findings,
    dropped: outcome.dropped,
    costUsd: outcome.costUsd,
    durationMs: Math.max(0, ports.nowMs() - startedAt),
  };
}
