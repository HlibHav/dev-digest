import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AgentContext,
  ContextAttachmentsInput,
  ContextDocContent,
  ContextDocList,
  ContextDocQuery,
  ContextRepoQuery,
  IndexStatus,
  SkillContext,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { buildProjectContextService } from './wiring.js';

/**
 * project-context module.
 *   GET  /repos/:id/context          docs found in the repo's clone
 *   GET  /repos/:id/context/file     one doc's text (?path=)
 *   POST /repos/:id/context/reindex  rescan the clone (no git call)
 *   GET/PUT /agents/:id/context      docs attached to an agent (+ inherited)
 *   GET/PUT /skills/:id/context      docs attached to a skill (+ preview)
 * Every route parses, calls the service and returns; each response is
 * serialized through its contract schema.
 */
export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = buildProjectContextService(container);

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: ContextDocList } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listDocs(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: ContextDocQuery, response: { 200: ContextDocContent } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.readDoc(workspaceId, req.params.id, req.query.path);
    },
  );

  app.post(
    '/repos/:id/context/reindex',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { params: IdParams, response: { 200: IndexStatus } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.rescan(workspaceId, req.params.id);
    },
  );

  app.get(
    '/agents/:id/context',
    { schema: { params: IdParams, querystring: ContextRepoQuery, response: { 200: AgentContext } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getAgentContext(workspaceId, req.params.id, req.query.repo_id);
    },
  );

  app.put(
    '/agents/:id/context',
    { schema: { params: IdParams, body: ContextAttachmentsInput, response: { 200: ContextAttachmentsInput } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.setAgentPaths(workspaceId, req.params.id, req.body.paths);
    },
  );

  app.get(
    '/skills/:id/context',
    { schema: { params: IdParams, querystring: ContextRepoQuery, response: { 200: SkillContext } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getSkillContext(workspaceId, req.params.id, req.query.repo_id);
    },
  );

  app.put(
    '/skills/:id/context',
    { schema: { params: IdParams, body: ContextAttachmentsInput, response: { 200: ContextAttachmentsInput } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.setSkillPaths(workspaceId, req.params.id, req.body.paths);
    },
  );
}
