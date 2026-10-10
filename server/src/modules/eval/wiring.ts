import type { FastifyBaseLogger } from 'fastify';
import { isSkillUntrusted, type FindingCategory, type Severity } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { runEvalCase } from './case-runner.js';
import { redactSecrets } from './helpers.js';
import { EvalRepository } from './repository.js';
import { EvalService, type EvalPorts } from './service.js';
import type { EvalAgent } from './types.js';

/**
 * Composition for the eval module. Hands the container's repositories and the
 * LLM registry to `EvalPorts`. Wiring, not a route call (onion-architecture
 * step 2). `opts` overrides single ports, for tests.
 */
export function buildEvalService(
  container: Container,
  log: FastifyBaseLogger,
  opts: Partial<EvalPorts> = {},
): EvalService {
  const { agentsRepo, reviewRepo } = container;

  const toAgent = (a: Awaited<ReturnType<typeof agentsRepo.getById>> & object): EvalAgent => ({
    id: a.id,
    name: a.name,
    model: a.model,
    provider: a.provider,
    strategy: a.strategy,
    systemPrompt: a.systemPrompt,
    version: a.version,
    enabled: a.enabled,
  });

  const ports: EvalPorts = {
    store: new EvalRepository(container.db),
    getAgent: async (workspaceId, agentId) => {
      const row = await agentsRepo.getById(workspaceId, agentId);
      return row ? toAgent(row) : undefined;
    },
    listAgents: async (workspaceId) => (await agentsRepo.list(workspaceId)).map(toAgent),
    resolveSkills: async (workspaceId, agentId) =>
      (await agentsRepo.enabledSkillsForAgent(workspaceId, agentId)).map(({ skill }) => ({
        id: skill.id,
        name: skill.name,
        version: skill.version,
        body: skill.body,
        untrusted: isSkillUntrusted(skill.source),
      })),
    findingContext: async (findingId) => {
      const ctx = await reviewRepo.findingContext(findingId);
      if (!ctx) return undefined;
      const { finding, review, pull } = ctx;
      return {
        finding: {
          id: finding.id,
          file: finding.file,
          start_line: finding.startLine,
          end_line: finding.endLine,
          severity: finding.severity as Severity,
          category: finding.category as FindingCategory,
          title: finding.title,
          accepted: !!finding.acceptedAt,
          dismissed: !!finding.dismissedAt,
        },
        agentId: review.agentId ?? null,
        pull: {
          id: pull.id,
          workspaceId: pull.workspaceId,
          repoId: pull.repoId,
          number: pull.number,
          title: pull.title,
          body: pull.body ?? null,
        },
      };
    },
    prFilePatch: async (prId, path) => {
      const files = await reviewRepo.getPrFiles(prId);
      return files.find((f) => f.path === path)?.patch ?? null;
    },
    runCase: (input) =>
      runEvalCase(
        { llm: async (provider) => container.llm(provider), parseDiff: (raw) => container.parseDiff(raw), nowMs: Date.now },
        input,
      ),
    background: (task) => {
      void task().catch((err: unknown) =>
        log.error({ err: redactSecrets(String(err)) }, 'eval: background task failed'),
      );
    },
    now: () => new Date(),
    log: (fields, message) => log.info(fields, message),
    ...opts,
  };

  return new EvalService(ports);
}
