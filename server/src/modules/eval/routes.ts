import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  EvalAgentDashboard,
  EvalCaseCreated,
  EvalCaseResult,
  EvalCaseRunAccepted,
  EvalCaseView,
  EvalCaseWrite,
  EvalCompare,
  EvalRunAllResult,
  EvalSuiteRunAccepted,
  EvalSuiteRunDetail,
  EvalSuiteRunSummary,
  EvalWorkspaceDashboard,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RUN_RATE_LIMIT } from './constants.js';
import { CASE_WRITE_BODY_LIMIT, CompareQuery, OkResponse } from './schemas.js';
import { buildEvalService } from './wiring.js';

/**
 * eval module: regression cases, suite runs, history and dashboards.
 * Every route declares the shared contract as its response schema. The polled
 * reads opt out of rate limiting; the three run POSTs share a 10/min limit.
 */
export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = buildEvalService(container, app.log);
  const ws = async (req: Parameters<typeof getContext>[1]) => (await getContext(container, req)).workspaceId;

  app.post(
    '/findings/:id/eval-case',
    { schema: { params: IdParams, response: { 200: EvalCaseCreated, 201: EvalCaseCreated } } },
    async (req, reply) => {
      const { body, created } = await service.createFromFinding(await ws(req), req.params.id);
      reply.status(created ? 201 : 200);
      return body;
    },
  );

  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalCaseView) } } },
    async (req) => service.listCases(await ws(req), req.params.id),
  );

  app.post(
    '/agents/:id/eval-cases',
    {
      bodyLimit: CASE_WRITE_BODY_LIMIT,
      schema: { params: IdParams, body: EvalCaseWrite, response: { 201: EvalCaseView } },
    },
    async (req, reply) => {
      const created = await service.createCase(await ws(req), req.params.id, req.body);
      reply.status(201);
      return created;
    },
  );

  app.put(
    '/eval-cases/:id',
    {
      bodyLimit: CASE_WRITE_BODY_LIMIT,
      schema: { params: IdParams, body: EvalCaseWrite, response: { 200: EvalCaseView } },
    },
    async (req) => service.updateCase(await ws(req), req.params.id, req.body),
  );

  app.delete(
    '/eval-cases/:id',
    { schema: { params: IdParams, response: { 200: OkResponse } } },
    async (req) => {
      await service.deleteCase(await ws(req), req.params.id);
      return { ok: true as const };
    },
  );

  app.post(
    '/eval-cases/:id/run',
    { schema: { params: IdParams, response: { 202: EvalCaseRunAccepted } }, config: { rateLimit: RUN_RATE_LIMIT } },
    async (req, reply) => {
      const accepted = await service.startCaseRun(await ws(req), req.params.id);
      reply.status(202);
      return accepted;
    },
  );

  app.get(
    '/eval-case-runs/:id',
    { schema: { params: IdParams, response: { 200: EvalCaseResult } }, config: { rateLimit: false } },
    async (req) => service.getCaseRun(await ws(req), req.params.id),
  );

  app.post(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, response: { 202: EvalSuiteRunAccepted } }, config: { rateLimit: RUN_RATE_LIMIT } },
    async (req, reply) => {
      const accepted = await service.startSuite(await ws(req), req.params.id);
      reply.status(202);
      return accepted;
    },
  );

  app.post(
    '/eval-runs/all',
    { schema: { response: { 202: EvalRunAllResult } }, config: { rateLimit: RUN_RATE_LIMIT } },
    async (req, reply) => {
      const result = await service.runAll(await ws(req));
      reply.status(202);
      return result;
    },
  );

  // Registered before `/eval-suite-runs/:id`; find-my-way prefers the static segment anyway.
  app.get(
    '/eval-suite-runs/compare',
    { schema: { querystring: CompareQuery, response: { 200: EvalCompare } } },
    async (req) => service.compare(await ws(req), req.query.base, req.query.head),
  );

  app.get(
    '/eval-suite-runs/:id',
    { schema: { params: IdParams, response: { 200: EvalSuiteRunDetail } }, config: { rateLimit: false } },
    async (req) => service.getSuite(await ws(req), req.params.id),
  );

  app.get(
    '/agents/:id/eval-suite-runs',
    { schema: { params: IdParams, response: { 200: z.array(EvalSuiteRunSummary) } } },
    async (req) => service.history(await ws(req), req.params.id),
  );

  app.get(
    '/agents/:id/eval-dashboard',
    { schema: { params: IdParams, response: { 200: EvalAgentDashboard } } },
    async (req) => service.agentDashboard(await ws(req), req.params.id),
  );

  app.get(
    '/eval/dashboard',
    { schema: { response: { 200: EvalWorkspaceDashboard } } },
    async (req) => service.workspaceDashboard(await ws(req)),
  );
}
