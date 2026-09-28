import { McpServer } from '@modelcontextprotocol/server';
import type { ServerDeps } from './ports/api-client.js';
import { register as registerListAgents } from './tools/devdigest-list-agents.js';
import { register as registerRunAgentOnPr } from './tools/devdigest-run-agent-on-pr.js';
import { register as registerGetFindings } from './tools/devdigest-get-findings.js';
import { register as registerGetConventions } from './tools/devdigest-get-conventions.js';
import { register as registerGetBlastRadius } from './tools/devdigest-get-blast-radius.js';

/** Builds the `McpServer` and registers the five DevDigest tools. No `instructions` (AC20):
 * the tool descriptions carry the whole token budget. */
export function createServer(deps: ServerDeps): McpServer {
  const server = new McpServer({ name: 'devdigest', version: '0.0.0' });
  registerListAgents(server, deps);
  registerRunAgentOnPr(server, deps);
  registerGetFindings(server, deps);
  registerGetConventions(server, deps);
  registerGetBlastRadius(server, deps);
  return server;
}
