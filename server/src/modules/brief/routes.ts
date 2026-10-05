import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBriefGenerateResponse, PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { buildBriefService } from './wiring.js';

/**
 * brief module.
 *   GET  /pulls/:id/brief → the stored brief with `stale`, or `{ brief: null }`; no model call
 *   POST /pulls/:id/brief → generate and store a fresh brief (10 per minute per caller)
 *
 * Both declare the shared contract as the response schema, so a body that
 * breaks it becomes a 500 instead of leaking.
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = buildBriefService(container, app.log);

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefResponse } }, config: { rateLimit: false } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return { brief: await service.get(workspaceId, req.params.id) };
    },
  );

  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 200: PrBriefGenerateResponse } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return { brief: await service.generate(workspaceId, req.params.id) };
    },
  );
}
