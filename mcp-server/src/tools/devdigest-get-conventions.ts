import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ServerDeps } from '../ports/api-client.js';
import { getConventions } from '../app/conventions.js';
import { ConventionsOut } from '../app/present.js';
import { ToolError } from '../app/errors.js';
import * as fields from './fields.js';

/** Registers `devdigest_get_conventions`: parses `{repo, status?}`, calls the use case, maps
 * the result. */
export function register(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'devdigest_get_conventions',
    {
      title: 'Get repo conventions',
      description:
        "Get the coding conventions DevDigest extracted for a repo, accepted ones by default, each with the file and line that evidences it. Use them to check code against the team's house rules.",
      inputSchema: z.object({
        repo: fields.repo,
        status: fields.conventionStatus.optional(),
      }),
      outputSchema: ConventionsOut,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ repo, status }) => {
      try {
        const out = await getConventions(deps, { repo, status });
        return { structuredContent: out, content: [{ type: 'text', text: JSON.stringify(out) }] };
      } catch (err) {
        const message = err instanceof ToolError ? err.message : String(err);
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
    },
  );
}
