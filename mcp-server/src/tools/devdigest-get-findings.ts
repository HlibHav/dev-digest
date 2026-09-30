import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ServerDeps } from '../ports/api-client.js';
import { getFindings } from '../app/reviews.js';
import { FindingsOut } from '../app/present.js';
import { ToolError } from '../app/errors.js';
import * as fields from './fields.js';

/** Registers `devdigest_get_findings`: parses `{repo, pr, agent?, run_id?, response_format?,
 * offset?}`, calls the use case, maps the result. */
export function register(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'devdigest_get_findings',
    {
      title: 'Get review findings',
      description:
        'Get the verdict and findings of finished DevDigest reviews on a pull request without starting a run. Defaults to the latest review per agent; narrow with agent or run_id. Use response_format "detailed" with agent or run_id for full rationales, and offset to page.',
      inputSchema: z.object({
        repo: fields.repo,
        pr: fields.pr,
        agent: fields.agent.optional(),
        run_id: fields.runId.optional(),
        response_format: fields.responseFormat.optional(),
        offset: fields.offset.optional(),
      }),
      outputSchema: FindingsOut,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ repo, pr, agent, run_id, response_format, offset }) => {
      try {
        const out = await getFindings(deps, { repo, pr, agent, run_id, response_format, offset });
        return { structuredContent: out, content: [{ type: 'text', text: JSON.stringify(out) }] };
      } catch (err) {
        const message = err instanceof ToolError ? err.message : String(err);
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
    },
  );
}
