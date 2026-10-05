import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ServerDeps } from '../ports/api-client.js';
import { runAgentOnPr } from '../app/reviews.js';
import { ReviewOut } from '../app/present.js';
import { ToolError } from '../app/errors.js';
import * as fields from './fields.js';

/** Registers `devdigest_run_agent_on_pr`: parses `{repo, pr, agent}`, calls the use case,
 * maps the result. The only non-read-only, non-idempotent tool. */
export function register(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'devdigest_run_agent_on_pr',
    {
      title: 'Run agent on PR',
      description:
        'Run one DevDigest reviewer agent on a pull request, wait up to about 2 minutes and return its verdict and findings. Spends LLM credits (max 10 runs/min), so for existing results use devdigest_get_findings. On timeout returns status "running" with a run_id for devdigest_get_findings.',
      inputSchema: z.object({
        repo: fields.repo,
        pr: fields.pr,
        agent: fields.agent,
      }),
      outputSchema: ReviewOut,
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ repo, pr, agent }) => {
      try {
        const out = await runAgentOnPr(deps, { repo, pr, agent });
        return { structuredContent: out, content: [{ type: 'text', text: JSON.stringify(out) }] };
      } catch (err) {
        const message = err instanceof ToolError ? err.message : String(err);
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
    },
  );
}
