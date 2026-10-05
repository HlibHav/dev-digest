import type { Container } from '../../platform/container.js';
import { renderPrompt } from '../../platform/prompts.js';
import { withTimeout } from '../../platform/resilience.js';
import { EXCLUDED_DIRS, SUPPORTED_EXT } from '../repo-intel/constants.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { OnboardingRepository } from './repository.js';
import { OnboardingService, type OnboardingLog, type OnboardingPorts } from './service.js';

const README_MAX_CHARS = 16_000;

/**
 * Composition for the onboarding module. Wires the repo-intel facade, the clone
 * scanner, the git client and the LLM registry into `OnboardingPorts`. Wiring
 * adapters into a service's ports is composition, not a route calling an
 * adapter (onion-architecture step 2); this is the only file that reaches
 * `repo-intel/constants`, `settings/feature-models` and `platform/resilience`.
 *
 * `opts` lets a test replace the clock-like ports (deadline, background, now).
 */
export function buildOnboardingService(
  container: Container,
  log: OnboardingLog,
  opts: Partial<Pick<OnboardingPorts, 'deadline' | 'background' | 'now'>> = {},
): OnboardingService {
  const intel = container.repoIntel;
  const ports: OnboardingPorts = {
    repo: new OnboardingRepository(container.db),
    index: {
      enabled: container.config.repoIntelEnabled,
      state: (repoId) => intel.getIndexState(repoId),
      ranked: (repoId) => intel.getRankedFiles(repoId),
      chains: (repoId) => intel.getCriticalPaths(repoId),
      routes: (repoId, limit) => intel.getRoutes(repoId, limit),
    },
    clone: container.cloneScanner,
    cloneOpts: { sourceExtensions: SUPPORTED_EXT, excludedDirs: EXCLUDED_DIRS, readmeMaxChars: README_MAX_CHARS },
    headSha: (ref) => container.git.currentHead(ref),
    resolveModel: (workspaceId) => resolveFeatureModel(container, workspaceId, 'onboarding'),
    llm: (provider) => container.llm(provider),
    systemPrompt: () => renderPrompt('onboarding.system.md', {}),
    deadline: opts.deadline ?? withTimeout,
    background:
      opts.background ??
      ((task) => {
        void task().catch((e) => log.error(`onboarding: background task failed — ${e instanceof Error ? e.message : String(e)}`));
      }),
    now: opts.now ?? (() => new Date()),
    log,
  };
  return new OnboardingService(ports);
}
