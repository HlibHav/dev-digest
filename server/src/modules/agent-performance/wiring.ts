import type { Container } from '../../platform/container.js';
import { AgentPerformanceRepository } from './repository.js';
import { AgentPerformanceService, type AgentPerformancePorts } from './service.js';

/**
 * Composition for the agent-performance module: the repository behind the
 * service's ports, plus the clock (injectable so tests pin the request instant).
 */
export function buildAgentPerformanceService(
  container: Container,
  opts: { now?: () => Date } = {},
): AgentPerformanceService {
  const repo = new AgentPerformanceRepository(container.db);
  const ports: AgentPerformancePorts = {
    now: opts.now ?? (() => new Date()),
    workspaceAgents: (ws) => repo.workspaceAgents(ws),
    agentInWorkspace: (ws, agentId) => repo.agentInWorkspace(ws, agentId),
    aggregate: (ws, w) => repo.aggregate(ws, w),
  };
  return new AgentPerformanceService(ports);
}
