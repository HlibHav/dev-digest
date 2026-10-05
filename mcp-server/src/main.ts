import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { loadConfig, ConfigError } from './config.js';
import { HttpApiClient } from './adapters/http-api-client.js';
import { createServer } from './server.js';
import { log } from './log.js';
import type { Clock, ServerDeps } from './ports/api-client.js';

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

function main(): void {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      log.error('invalid configuration', { message: err.message });
      process.exit(1);
    }
    throw err;
  }

  const deps: ServerDeps = {
    api: new HttpApiClient(config.apiUrl),
    clock: realClock,
    waitMs: config.waitMs,
    pollMs: config.pollMs,
    apiUrl: config.apiUrl,
  };

  serveStdio(() => createServer(deps), {
    onerror: (error) => log.error('stdio transport error', { message: error.message }),
  });
}

main();
