import { describe, it, expect } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

// AC23: spawns src/main.ts through tsx and speaks the legacy MCP handshake over stdio.
// main.ts doesn't exist yet (Step 5), so tsx exits non-zero / never answers — red for
// the right reason.

const MCP_SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));

type JsonRpcMessage = { id?: number; method?: string; result?: unknown; error?: unknown };

function send(child: ChildProcessWithoutNullStreams, message: Record<string, unknown>): void {
  child.stdin.write(JSON.stringify(message) + '\n');
}

describe('stdio entry', () => {
  it(
    'legacy handshake over stdio; stdout is only JSON-RPC',
    async () => {
      const child = spawn('node_modules/.bin/tsx', ['src/main.ts'], {
        cwd: MCP_SERVER_DIR,
        env: { ...process.env, DEVDIGEST_API_URL: 'http://127.0.0.1:9' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      const stdoutLines: string[] = [];
      const messages: JsonRpcMessage[] = [];
      const rl = createInterface({ input: child.stdout });
      rl.on('line', (line) => {
        if (line.trim() === '') return;
        stdoutLines.push(line);
        try {
          messages.push(JSON.parse(line) as JsonRpcMessage);
        } catch {
          // Recorded in stdoutLines; the "every line parses as JSON-RPC" assertion below
          // will catch this without throwing here.
        }
      });

      function waitForMessage(predicate: (m: JsonRpcMessage) => boolean, timeoutMs: number): Promise<JsonRpcMessage> {
        return new Promise((resolve, reject) => {
          const deadline = Date.now() + timeoutMs;
          const check = () => {
            const found = messages.find(predicate);
            if (found) return resolve(found);
            if (Date.now() > deadline) {
              return reject(new Error(`Timed out waiting for a message. stderr so far:\n${stderr}`));
            }
            setTimeout(check, 100);
          };
          check();
        });
      }

      try {
        send(child, {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'stdio-test', version: '0.0.0' },
          },
        });

        const initResponse = await waitForMessage((m) => m.id === 1, 30000);
        expect(initResponse.result, `initialize failed: ${JSON.stringify(initResponse.error)}. stderr:\n${stderr}`).toBeDefined();

        send(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

        send(child, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
        const listResponse = await waitForMessage((m) => m.id === 2, 30000);
        expect(listResponse.result, `tools/list failed: ${JSON.stringify(listResponse.error)}. stderr:\n${stderr}`).toBeDefined();

        for (const line of stdoutLines) {
          const parsed = JSON.parse(line) as { jsonrpc?: string };
          expect(parsed.jsonrpc).toBe('2.0');
        }

        const tools = (listResponse.result as { tools: { name: string }[] }).tools;
        expect(tools.map((t) => t.name).sort()).toEqual([
          'devdigest_get_blast_radius',
          'devdigest_get_conventions',
          'devdigest_get_findings',
          'devdigest_list_agents',
          'devdigest_run_agent_on_pr',
        ]);
      } finally {
        child.kill();
      }
    },
    35000,
  );
});
