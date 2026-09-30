import type { FastifyBaseLogger } from 'fastify';
import type { Container } from '../../platform/container.js';
import { MAX_CALLERS_PER_SYMBOL } from '../repo-intel/constants.js';
import { buildPullsService } from '../pulls/wiring.js';
import { BlastService, type BlastPorts, type BlastStorePort } from './service.js';

/**
 * Composition for the blast module (homework-5, AC14). Wires the repo-intel
 * facade, the pulls service's file refresh (server/INSIGHTS.md:15 — only
 * `GET /pulls/:id` fills `pr_files`) and `container.reviewRepo` as the store
 * into `BlastPorts`. This is wiring adapters into a service's ports at
 * composition time, like `pulls/wiring.ts` — not a route calling an adapter
 * (onion-architecture step 2) — so `wiring.ts` is exempt from the
 * application-no-cross-module rule (`.dependency-cruiser.cjs:13-23`) and this
 * is the only file in the module that imports the cap from repo-intel
 * constants (AC14: `helpers.ts`/`service.ts` take it as a parameter).
 */
export function buildBlastService(container: Container, log: FastifyBaseLogger): BlastService {
  const pullsService = buildPullsService(container, (message) => log.warn(message));

  const store: BlastStorePort = container.reviewRepo;

  const ports: BlastPorts = {
    store,
    blast: (repoId, changedFiles) => container.repoIntel.getBlastRadius(repoId, changedFiles),
    indexStatus: (repoId) => container.repoIntel.getIndexState(repoId),
    refreshFiles: async (workspaceId, prId) => {
      const detail = await pullsService.refreshPullDetail(workspaceId, prId);
      return detail.files.map((f) => f.path);
    },
    log: (fields, message) => log.info(fields, message),
    limits: { maxCallersPerSymbol: MAX_CALLERS_PER_SYMBOL },
  };

  return new BlastService(ports);
}
