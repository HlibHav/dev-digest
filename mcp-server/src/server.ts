import { McpServer } from '@modelcontextprotocol/server';
import type { ServerDeps } from './ports/api-client.js';

/** Step 0 stub: an `McpServer` with no tools registered. Step 5 fills it with the five tool
 * `register(server, deps)` calls. */
export function createServer(_deps: ServerDeps): McpServer {
  return new McpServer({ name: 'devdigest', version: '0.0.0' });
}
