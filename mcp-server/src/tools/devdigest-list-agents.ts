import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ServerDeps } from '../ports/api-client.js';
import { listAgents } from '../app/agents.js';
import { ListAgentsOut } from '../app/present.js';
import { ToolError } from '../app/errors.js';

/** Registers `devdigest_list_agents`: parses (no input), calls the use case, maps the
 * result. */
export function register(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'devdigest_list_agents',
    {
      title: 'List review agents',
      description:
        'List the reviewer agents configured in DevDigest: id, name, model and whether each is enabled. Call it first to get a valid agent for devdigest_run_agent_on_pr or devdigest_get_findings.',
      inputSchema: z.object({}),
      outputSchema: ListAgentsOut,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const out = await listAgents(deps);
        return { structuredContent: out, content: [{ type: 'text', text: JSON.stringify(out) }] };
      } catch (err) {
        const message = err instanceof ToolError ? err.message : String(err);
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
    },
  );
}
