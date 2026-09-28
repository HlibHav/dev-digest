import type { ServerDeps } from '../ports/api-client.js';
import { toToolError, ToolError } from './errors.js';
import { truncate, sanitizeUntrusted, type ListAgentsOut } from './present.js';

const MAX_DESCRIPTION = 160;

/** `devdigest_list_agents`: every configured agent, compacted for the token budget — no
 * `system_prompt`, `description` cut to 160 chars. */
export async function listAgents(deps: ServerDeps): Promise<ListAgentsOut> {
  try {
    const agents = await deps.api.listAgents();
    return {
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        description: truncate(sanitizeUntrusted(a.description), MAX_DESCRIPTION),
        model: a.model,
        enabled: a.enabled,
      })),
    };
  } catch (err) {
    if (err instanceof ToolError) throw err;
    throw toToolError(err, deps.apiUrl);
  }
}
