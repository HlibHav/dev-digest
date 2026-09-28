import { createMcpHandler, type McpServer, type McpServerFactory } from '@modelcontextprotocol/server';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

/** A harness for `server.test.ts`: wires an `McpServer` factory straight to a client in one
 * process, over `createMcpHandler`'s web-standard `fetch` — no socket, no child process.
 * Revision 2.1: the transport still needs a URL even though nothing leaves the process, and
 * `handler.fetch` is adapted into the client's `FetchLike` shape (`(url, init) => Response`). */
export async function connectInProcess(factory: () => McpServer): Promise<{
  client: Client;
  instructions: string | undefined;
  close: () => Promise<void>;
}> {
  const handler = createMcpHandler(factory as McpServerFactory);
  const transport = new StreamableHTTPClientTransport(new URL('http://mcp.local/mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client({ name: 'mcp-server-test-harness', version: '0.0.0' });
  await client.connect(transport);
  return {
    client,
    instructions: client.getInstructions(),
    close: async () => {
      await client.close();
      await handler.close();
    },
  };
}
