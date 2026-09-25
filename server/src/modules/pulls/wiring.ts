import type { Container } from '../../platform/container.js';
import { PullsRepository } from './repository.js';
import { PullsService } from './service.js';

/**
 * F7 — the one place `PullsService` is constructed. `pulls/routes.ts` and
 * `reviews/routes.ts` both need `refreshPullDetail` ([D6]); before this they
 * each built their own `new PullsService({...})` with identical ports. This
 * factory is wiring (adapters → ports at composition time), like a route
 * plugin's own wiring block — not a route calling an adapter
 * (onion-architecture skill, step 2) — so it lives beside the module it
 * wires, not inside a route file.
 */
export function buildPullsService(container: Container, log?: (message: string) => void): PullsService {
  return new PullsService({
    repo: new PullsRepository(container.db),
    github: () => container.github(),
    log,
  });
}
