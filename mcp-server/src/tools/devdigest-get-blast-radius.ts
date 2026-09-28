import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ServerDeps } from '../ports/api-client.js';
import { getBlastRadius } from '../app/blast-radius.js';
import { BlastRadiusOut } from '../app/present.js';
import * as fields from './fields.js';

/** Registers `devdigest_get_blast_radius`: parses `{repo, pr, files?}`, calls the (stub) use
 * case — no `deps` needed, so AC17's "zero API calls" is structural. */
export function register(server: McpServer, _deps: ServerDeps): void {
  server.registerTool(
    'devdigest_get_blast_radius',
    {
      title: 'Get blast radius',
      description:
        'Not implemented yet: always returns status "not_implemented". Planned to show which symbols and callers a pull request\'s changes affect. Do not rely on it; use devdigest_get_findings for review results.',
      inputSchema: z.object({
        repo: fields.repo,
        pr: fields.pr,
        files: fields.files.optional(),
      }),
      outputSchema: BlastRadiusOut,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ repo, pr, files }) => {
      const out = getBlastRadius({ repo, pr, files });
      return { structuredContent: out, content: [{ type: 'text', text: JSON.stringify(out) }] };
    },
  );
}
