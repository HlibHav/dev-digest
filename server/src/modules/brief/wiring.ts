import type { FastifyBaseLogger } from 'fastify';
import type { Container } from '../../platform/container.js';
import { buildBlastService } from '../blast/wiring.js';
import { buildProjectContextService } from '../project-context/wiring.js';
import { buildPullsService } from '../pulls/wiring.js';
import { parseLinkedIssues, sanitizeSourceText } from '../reviews/intent-helpers.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { classifyFile } from '../smart-diff/classify.js';
import { BRIEF_DEADLINE_MS } from './constants.js';
import { BriefRepository } from './repository.js';
import { BriefService, type BriefPorts } from './service.js';

/**
 * Composition for the brief module. Hands other modules' functions and the
 * container's adapters to `BriefPorts`. Wiring, not a route call
 * (onion-architecture step 2).
 */
export function buildBriefService(container: Container, log: FastifyBaseLogger): BriefService {
  const pullsService = buildPullsService(container, (message) => log.warn(message));
  const blastService = buildBlastService(container, log);
  const projectContext = buildProjectContextService(container);
  const briefRepo = new BriefRepository(container.db);
  const reviewRepo = container.reviewRepo;

  const ports: BriefPorts = {
    getPull: async (workspaceId, prId) => {
      const row = await reviewRepo.getPull(workspaceId, prId);
      return row ? { id: row.id, repoId: row.repoId, headSha: row.headSha } : undefined;
    },
    getRepo: async (repoId) => {
      const row = await reviewRepo.getRepo(repoId);
      return row ? { owner: row.owner, name: row.name, clonePath: row.clonePath ?? null } : undefined;
    },
    refreshPullDetail: (workspaceId, prId) => pullsService.refreshPullDetail(workspaceId, prId),
    getStored: (prId) => briefRepo.get(prId),
    save: (prId, brief) => briefRepo.save(prId, brief),
    getIntent: (prId) => reviewRepo.getIntent(prId),
    getBlast: (workspaceId, prId) => blastService.getBlastRadius(workspaceId, prId),
    getIssue: async (ref, n) => (await container.github()).getIssue(ref, n),
    agentIds: (workspaceId) => briefRepo.agentIdsInOrder(workspaceId),
    resolveAgentDocs: async (input, onLog) => {
      const docs = await projectContext.resolveForRun({ ...input, changedPaths: [] }, onLog);
      return docs.flatMap((d) => (d.status === 'injected' && d.text != null ? [{ path: d.path, text: d.text }] : []));
    },
    resolveModel: (workspaceId) => resolveFeatureModel(container, workspaceId, 'risk_brief'),
    llm: (provider) => container.llm(provider),
    count: (text) => container.boundedTokenizer.count(text),
    classifyFile,
    parseLinkedIssues,
    sanitize: sanitizeSourceText,
    now: () => new Date(),
    log: (fields, message) => log.info(fields, message),
    limits: { deadlineMs: BRIEF_DEADLINE_MS },
  };

  return new BriefService(ports);
}
