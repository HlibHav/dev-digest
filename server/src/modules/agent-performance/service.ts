import type { AgentPerformance, AgentStats } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { buildPerformance } from './helpers.js';
import type { RawAggregate, WindowBounds, WorkspaceAgentRow } from './types.js';
import { resolveWindow } from './window.js';

export interface AgentPerformancePorts {
  now(): Date;
  workspaceAgents(ws: string): Promise<WorkspaceAgentRow[]>;
  agentInWorkspace(ws: string, agentId: string): Promise<boolean>;
  aggregate(ws: string, w: WindowBounds): Promise<RawAggregate>;
}

/**
 * Agent Performance dashboard and per-agent Stats. Read-only: no write, no
 * model call. Both endpoints go through `build`, so an agent's Stats equal its
 * dashboard row for the same period and instant.
 */
export class AgentPerformanceService {
  constructor(private readonly ports: AgentPerformancePorts) {}

  async dashboard(ws: string, query: unknown): Promise<AgentPerformance> {
    return this.build(ws, resolveWindow(query, this.ports.now()));
  }

  /** Period first (400), then the agent (404), then the shared aggregate. */
  async agentStats(ws: string, agentId: string, query: unknown): Promise<AgentStats> {
    const w = resolveWindow(query, this.ports.now());
    if (!(await this.ports.agentInWorkspace(ws, agentId))) throw new NotFoundError('Agent not found');
    const row = (await this.build(ws, w)).agents.find((a) => a.agent_id === agentId);
    if (!row) throw new NotFoundError('Agent not found');
    return row;
  }

  private async build(ws: string, w: WindowBounds): Promise<AgentPerformance> {
    const [agents, raw] = await Promise.all([this.ports.workspaceAgents(ws), this.ports.aggregate(ws, w)]);
    return buildPerformance(agents, raw, w);
  }
}
