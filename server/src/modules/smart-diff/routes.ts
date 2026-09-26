import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SmartDiffService } from './service.js';

/**
 * smart-diff module.
 *   GET /pulls/:id/smart-diff → PR files grouped by role (core, tests,
 *   wiring, docs, boilerplate) with findings mapped onto them. Pure path
 *   classification — no model call, works before the first review runs.
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  // Built once at plugin scope (not per-request) — `container.reviewRepo` is a
  // property access on the already-built container, not a query or an import
  // of another module's file.
  const service = new SmartDiffService(container.reviewRepo);

  app.get('/pulls/:id/smart-diff', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const result = await service.getSmartDiff(workspaceId, req.params.id);
    if (!result) throw new NotFoundError('Pull request not found');
    return result;
  });
}
