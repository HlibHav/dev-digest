import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AgentPerformance, AgentStats } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { buildAgentPerformanceService } from './wiring.js';

/**
 * agent-performance module (read-only, no model call).
 *   GET /agent-performance      → every agent's metrics for a period, plus totals and breakdowns
 *   GET /agents/:id/stats       → one agent's row of the same aggregate
 *
 * The querystring is left permissive on purpose: `resolveWindow` validates the
 * period and answers 400 `invalid_period` (the app maps schema failures to 422).
 * Both declare the shared contract as the response schema.
 */
const AnyQuery = z.record(z.string(), z.unknown());

export default async function agentPerformanceRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = buildAgentPerformanceService(container);

  app.get(
    '/agent-performance',
    { schema: { querystring: AnyQuery, response: { 200: AgentPerformance } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.dashboard(workspaceId, req.query);
    },
  );

  app.get(
    '/agents/:id/stats',
    { schema: { params: IdParams, querystring: AnyQuery, response: { 200: AgentStats } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.agentStats(workspaceId, req.params.id, req.query);
    },
  );
}
