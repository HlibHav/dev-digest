import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ServerDeps } from '../ports/api-client.js';
import { getBlastRadius } from '../app/blast-radius.js';
import { BlastRadiusOut } from '../app/present.js';
import { ToolError } from '../app/errors.js';
import * as fields from './fields.js';

/** Registers `devdigest_get_blast_radius`: parses `{repo, pr, files?}`, calls the use case,
 * maps the result. Description text is verbatim from `docs/homework-5/plan.md`'s Revision
 * 5.1 (194 chars, 2 sentences), which supersedes that plan's own earlier 247-char text (and,
 * through it, the hw4 stub text per `docs/homework-4/plan.md`'s "Superseded by homework-5"
 * section). */
export function register(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'devdigest_get_blast_radius',
    {
      title: 'Get blast radius',
      description:
        "Get a pull request's blast radius from DevDigest's code index: each changed symbol, its callers as file:line and the HTTP endpoints and cron jobs they reach. Call it before reviewing or merging.",
      inputSchema: z.object({
        repo: fields.repo,
        pr: fields.pr,
        files: fields.files.optional(),
      }),
      outputSchema: BlastRadiusOut,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ repo, pr, files }) => {
      try {
        const out = await getBlastRadius(deps, { repo, pr, files });
        return { structuredContent: out, content: [{ type: 'text', text: JSON.stringify(out) }] };
      } catch (err) {
        const message = err instanceof ToolError ? err.message : String(err);
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
    },
  );
}
