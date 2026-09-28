import * as z from 'zod/v4';

/** Zod v4 field schemas shared by the five tools, each carrying the verbatim `.describe()`
 * text from the plan's "Field descriptions" table character for character. */

export const repo = z
  .string()
  .regex(/^[\w.-]+\/[\w.-]+$/)
  .describe('GitHub repo as owner/name, e.g. acme/payments-api');

export const pr = z.number().int().positive().describe('Pull request number, e.g. 42');

export const agent = z
  .string()
  .min(1)
  .describe('Agent id or exact name from devdigest_list_agents');

// `z.guid()`, not `z.uuid()`: the plan's AC12 test uses a syntactically-valid-but-nonstandard
// UUID (bad variant nibble) to prove the rejection is schema validation, not resolution
// failure — `z.uuid()` enforces the RFC4122 variant bits and would reject that fixture too.
export const runId = z
  .guid()
  .describe('Run id from devdigest_run_agent_on_pr; omit for the latest reviews');

export const responseFormat = z
  .enum(['concise', 'detailed'])
  .default('concise')
  .describe(
    'concise (default): top findings, short text; detailed: full rationale, needs agent or run_id',
  );

export const offset = z
  .number()
  .int()
  .min(0)
  .default(0)
  .describe('Findings to skip per review when paging; default 0');

export const conventionStatus = z
  .enum(['accepted', 'pending', 'all'])
  .default('accepted')
  .describe('accepted (default), pending or all');

export const files = z
  .array(z.string())
  .max(200)
  .describe('Optional changed file paths to limit the analysis');
