import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { OnboardingGenerateAccepted, OnboardingView } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { buildOnboardingService } from './wiring.js';

/**
 * onboarding module: a five-part guided tour of a cloned repo.
 *   GET  /repos/:id/onboarding           → the stored tour, or "none"
 *   POST /repos/:id/onboarding/generate  → 202, generation runs in the background
 * Both responses are declared, so a body that breaks the contract becomes a 500
 * instead of leaking.
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = buildOnboardingService(container, {
    info: (line) => app.log.info(line),
    error: (line) => app.log.error(line),
  });

  app.get(
    '/repos/:id/onboarding',
    { schema: { params: IdParams, response: { 200: OnboardingView } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.read(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/onboarding/generate',
    {
      schema: { params: IdParams, response: { 202: OnboardingGenerateAccepted } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const accepted = await service.start(workspaceId, req.params.id);
      return reply.code(202).send(accepted);
    },
  );
}
