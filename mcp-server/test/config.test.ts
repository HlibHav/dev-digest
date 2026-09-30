import { describe, it, expect } from 'vitest';
// AC25: loadConfig(env) and ConfigError, from the not-yet-created src/config.ts.
import { loadConfig, ConfigError } from '../src/config.js';

describe('loadConfig', () => {
  it('defaults 110000/2000', () => {
    const config = loadConfig({});
    expect(config).toEqual({
      apiUrl: 'http://localhost:3001',
      waitMs: 110000,
      pollMs: 2000,
    });
  });

  it('reads DEVDIGEST_API_URL, DEVDIGEST_MCP_WAIT_MS and DEVDIGEST_MCP_POLL_MS', () => {
    const config = loadConfig({
      DEVDIGEST_API_URL: 'http://localhost:3201',
      DEVDIGEST_MCP_WAIT_MS: '5000',
      DEVDIGEST_MCP_POLL_MS: '1000',
    });
    expect(config).toEqual({
      apiUrl: 'http://localhost:3201',
      waitMs: 5000,
      pollMs: 1000,
    });
  });

  it('rejects invalid values', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'not-a-url' })).toThrow(ConfigError);
    expect(() => loadConfig({ DEVDIGEST_MCP_WAIT_MS: 'abc' })).toThrow(ConfigError);
    expect(() => loadConfig({ DEVDIGEST_MCP_WAIT_MS: '0' })).toThrow(ConfigError);
    expect(() => loadConfig({ DEVDIGEST_MCP_WAIT_MS: '-5' })).toThrow(ConfigError);
    expect(() => loadConfig({ DEVDIGEST_MCP_WAIT_MS: '1.5' })).toThrow(ConfigError);
    // pollMs > waitMs is rejected even when each value is individually valid.
    expect(() =>
      loadConfig({ DEVDIGEST_MCP_WAIT_MS: '1000', DEVDIGEST_MCP_POLL_MS: '2000' }),
    ).toThrow(ConfigError);
  });
});
