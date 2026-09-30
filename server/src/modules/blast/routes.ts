import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadius } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { buildBlastService } from './wiring.js';

/**
 * blast module (homework-5, docs/homework-5/plan.md).
 *   GET /pulls/:id/blast → the changed symbols, their callers (file:line)
 *   and the HTTP endpoints / cron jobs those callers sit behind, read from
 *   the repo-intel index that already exists — no model call, no re-parse.
 *
 * `schema.response[200] = BlastRadius` (AC11): a body that breaks the
 * contract fails `safeParse` in the response serializer and becomes a 500,
 * instead of leaking it (`fastify-type-provider-zod/dist/src/core.js:85-91`).
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = buildBlastService(container, app.log);

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadius } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const radius = await service.getBlastRadius(workspaceId, req.params.id);
      if (!radius) throw new NotFoundError('Pull request not found');
      return radius;
    },
  );
}
