import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// AC27: the root .mcp.json registers the devdigest server. It doesn't exist yet
// (Step 6), so this file fails to read it — red for the right reason.
const MCP_JSON_PATH = fileURLToPath(new URL('../../.mcp.json', import.meta.url));

type McpJson = {
  mcpServers?: Record<
    string,
    {
      type?: string;
      command?: string;
      args?: string[];
      env?: Record<string, string>;
    }
  >;
};

function readMcpJson(): McpJson {
  return JSON.parse(readFileSync(MCP_JSON_PATH, 'utf8')) as McpJson;
}

describe('.mcp.json registration', () => {
  it('registers devdigest over stdio, no script wrapper, no MCP_TOOL_TIMEOUT', () => {
    const config = readMcpJson();
    const server = config.mcpServers?.devdigest;
    expect(server, 'mcpServers.devdigest exists').toBeDefined();
    expect(server!.type).toBe('stdio');

    // The command runs tsx directly on mcp-server/src/main.ts, not a pnpm/npm script.
    expect(server!.command).toBeDefined();
    expect(server!.command).not.toMatch(/^(pnpm|npm|npx)\b/);
    expect(server!.command).toMatch(/tsx/);
    const argsText = (server!.args ?? []).join(' ');
    expect(argsText).toContain('mcp-server/src/main.ts');

    expect(server!.env).toBeDefined();
    expect(server!.env).toHaveProperty('DEVDIGEST_API_URL');

    expect(server!.env).not.toHaveProperty('MCP_TOOL_TIMEOUT');
    expect(server!.env).not.toHaveProperty('MCP_PROTOCOL_NEGOTIATION');
    // Also absent at the server-config top level, not just inside env.
    expect(server).not.toHaveProperty('MCP_TOOL_TIMEOUT');
    expect(server).not.toHaveProperty('MCP_PROTOCOL_NEGOTIATION');
  });
});
