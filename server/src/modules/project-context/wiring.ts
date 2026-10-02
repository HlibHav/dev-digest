import type { Container } from '../../platform/container.js';
import { ProjectContextRepository } from './repository.js';
import { ProjectContextService } from './service.js';

/**
 * Composition for the project-context module: hands the repository, the docs
 * adapter and the tokenizer to the service's ports. Wiring, not a route call
 * (onion-architecture step 2). One factory so the routes and the run executor
 * build the service the same way.
 */
export function buildProjectContextService(container: Container): ProjectContextService {
  return new ProjectContextService({
    repo: new ProjectContextRepository(container.db),
    docs: container.repoDocs,
    tokenizer: container.tokenizer,
    now: () => new Date(),
  });
}
