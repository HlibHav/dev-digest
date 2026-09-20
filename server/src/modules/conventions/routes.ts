/**
 * Conventions HTTP module.
 *
 *   POST /repos/:id/conventions/extract  → 202 + jobId; runs a scan in the background
 *   GET  /repos/:id/conventions          → candidates + latest scan status
 *   GET  /repos/:id/conventions/skill    → the body the create-skill modal opens with
 *   POST /repos/:id/conventions/skill    → assemble accepted candidates into one skill
 *   PATCH /conventions/:id               → accept / reject / edit one candidate
 *
 * Transport only: parses requests, maps status codes, and wires the service's
 * ports to concrete adapters. Job-handler registration happens here at boot,
 * mirroring `repo-intel/routes.ts`.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { ConventionStatus, type FeatureModelChoice } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { SkillsService } from '../skills/service.js';
import { AgentsService } from '../agents/service.js';
import { ConventionsRepository } from './repository.js';
import { ConventionsService, type RepoBasics } from './service.js';
import { CONVENTIONS_JOB_KIND } from './constants.js';

const PatchBody = z
  .object({
    status: ConventionStatus.optional(),
    rule: z.string().min(1).max(500).optional(),
    category: z.string().min(1).max(60).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' });

const CreateSkillBody = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  body: z.string().max(200_000).optional(),
  /** Optionally link the new skill to an agent in the same call. */
  agent_id: z.string().uuid().optional(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const repo = new ConventionsRepository(container.db);
  const skills = new SkillsService(container.skillsRepo);
  const agents = new AgentsService(container);

  const service = new ConventionsService({
    repo,
    sampleFiles: (repoId, n) => container.repoIntel.getConventionSamples(repoId, n),
    getRepoBasics: async (repoId): Promise<RepoBasics | null> => {
      const [row] = await container.db
        .select({
          id: t.repos.id,
          owner: t.repos.owner,
          name: t.repos.name,
          fullName: t.repos.fullName,
          defaultBranch: t.repos.defaultBranch,
          clonePath: t.repos.clonePath,
        })
        .from(t.repos)
        .where(eq(t.repos.id, repoId));
      return row ?? null;
    },
    readRepoFile: (ref, path) => container.git.readFile(ref, path),
    // The first caller of this helper in the codebase: the model is a workspace
    // setting (Settings → Models → Conventions), not a module constant.
    resolveModel: (workspaceId): Promise<FeatureModelChoice> =>
      resolveFeatureModel(container, workspaceId, 'conventions'),
    llm: (provider) => container.llm(provider),
    upsertSkill: (workspaceId, input) => skills.upsertExtracted(workspaceId, input),
    log: (message) => app.log.info(message),
  });

  // A scan interrupted by a restart has no worker to finish it, so clear it at
  // boot rather than leave the page polling forever.
  void repo
    .reapStaleScans()
    .then((n) => {
      if (n > 0) app.log.warn(`conventions: reaped ${n} interrupted scan(s)`);
    })
    .catch((err) => app.log.error({ err }, 'conventions: could not reap stale scans'));

  // Registered once at plugin load, like the index jobs.
  container.jobs.register(CONVENTIONS_JOB_KIND, async (payload, ctx) => {
    const { workspaceId, repoId, scanId } = payload as {
      workspaceId: string;
      repoId: string;
      scanId: string;
    };
    try {
      const written = await service.runScan(workspaceId, repoId, scanId);
      await repo.clearJobError(ctx.jobId);
      app.log.info(`conventions: scan ${scanId} wrote ${written} candidate(s)`);
    } catch (err) {
      // Swallowed on purpose. JobRunner retries a throwing handler twice, and
      // every retry is another paid extraction; the failure is already visible
      // to the user through the job row and the scan's own error text.
      const message = err instanceof Error ? err.message : String(err);
      app.log.error(`conventions: scan ${scanId} failed — ${message}`);
      // Scoped to THIS job. Matching on kind + workspace would rewrite every
      // past scan of the workspace, including ones that succeeded.
      await container.db
        .update(t.jobs)
        .set({ status: 'failed', error: message, finishedAt: new Date() })
        .where(eq(t.jobs.id, ctx.jobId));
    }
  });

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listForRepo(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/extract',
    {
      schema: { params: IdParams },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const scanId = ConventionsService.newScanId();
      const job = await container.jobs.enqueue(workspaceId, CONVENTIONS_JOB_KIND, {
        workspaceId,
        repoId: req.params.id,
        scanId,
      });
      // JobRunner records the failure on the job row and then RETHROWS, so
      // `done` rejects. Nothing awaits it, and an unhandled rejection takes the
      // whole API process down — this catch is what keeps a failed scan a
      // failed scan. The UI reads the outcome from the job row either way.
      void job.done.catch(() => {});
      reply.code(202);
      return { status: 'accepted', job_id: job.id, scan_id: scanId };
    },
  );

  app.get('/repos/:id/conventions/skill', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return { body: await service.previewSkillBody(workspaceId, req.params.id) };
  });

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateSkillBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const skill = await service.createSkill(workspaceId, req.params.id, req.body);
      // Through the agents SERVICE, not the repository: it checks that both the
      // agent and the skill belong to this workspace before writing the link.
      if (req.body.agent_id) {
        await agents.linkSkill(workspaceId, req.body.agent_id, skill.id);
      }
      reply.code(201);
      return skill;
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: PatchBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const updated = await service.patch(workspaceId, req.params.id, req.body);
      if (!updated) throw new NotFoundError('Convention not found');
      return updated;
    },
  );
}
