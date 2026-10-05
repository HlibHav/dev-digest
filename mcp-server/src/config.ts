/** Edge: reads process env into the typed config the application layer runs on. No shared
 * import here — env parsing is entirely local to mcp-server. */

export type McpConfig = {
  apiUrl: string;
  waitMs: number;
  pollMs: number;
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const DEFAULT_API_URL = 'http://localhost:3001';
const DEFAULT_WAIT_MS = 110000;
const DEFAULT_POLL_MS = 2000;

function parsePositiveInt(raw: string, name: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new ConfigError(`${name} must be a positive integer, got "${raw}".`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ConfigError(`${name} must be a positive integer, got "${raw}".`);
  }
  return value;
}

/** Loads and validates `McpConfig` from `process.env` (or a test double of it). Throws
 * `ConfigError` for a non-URL `DEVDIGEST_API_URL`, a non-positive-integer wait/poll value, or
 * `pollMs > waitMs`. */
export function loadConfig(env: NodeJS.ProcessEnv): McpConfig {
  const apiUrl = env.DEVDIGEST_API_URL ?? DEFAULT_API_URL;
  try {
    new URL(apiUrl);
  } catch {
    throw new ConfigError(`DEVDIGEST_API_URL must be a valid URL, got "${apiUrl}".`);
  }

  const waitMs =
    env.DEVDIGEST_MCP_WAIT_MS !== undefined
      ? parsePositiveInt(env.DEVDIGEST_MCP_WAIT_MS, 'DEVDIGEST_MCP_WAIT_MS')
      : DEFAULT_WAIT_MS;
  const pollMs =
    env.DEVDIGEST_MCP_POLL_MS !== undefined
      ? parsePositiveInt(env.DEVDIGEST_MCP_POLL_MS, 'DEVDIGEST_MCP_POLL_MS')
      : DEFAULT_POLL_MS;

  if (pollMs > waitMs) {
    throw new ConfigError(
      `DEVDIGEST_MCP_POLL_MS (${pollMs}) must not exceed DEVDIGEST_MCP_WAIT_MS (${waitMs}).`,
    );
  }

  return { apiUrl, waitMs, pollMs };
}
