import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/platform/config.js';

/**
 * OpenRouter provider routing is configuration: three env vars become the
 * `routing` option the container hands to OpenRouterProvider.
 */
describe('loadConfig — OpenRouter provider routing', () => {
  it('parses slugs and the fallback flag', () => {
    const config = loadConfig({
      OPENROUTER_PROVIDER_ORDER: 'parasail, atlas-cloud',
      OPENROUTER_PROVIDER_IGNORE: 'open-inference,,',
      OPENROUTER_ALLOW_FALLBACKS: 'true',
    });
    expect(config.openrouterRouting).toEqual({
      order: ['parasail', 'atlas-cloud'],
      ignore: ['open-inference'],
      allowFallbacks: true,
    });
  });

  it('reads only the literal "false" as disabling fallbacks', () => {
    expect(loadConfig({ OPENROUTER_ALLOW_FALLBACKS: 'false' }).openrouterRouting).toEqual({
      allowFallbacks: false,
    });
    expect(loadConfig({ OPENROUTER_ALLOW_FALLBACKS: 'yes' }).openrouterRouting).toEqual({
      allowFallbacks: true,
    });
  });

  it('leaves routing unset when the vars are absent or blank', () => {
    expect(loadConfig({}).openrouterRouting).toBeUndefined();
    expect(
      loadConfig({
        OPENROUTER_PROVIDER_ORDER: '',
        OPENROUTER_PROVIDER_IGNORE: ' , ',
        OPENROUTER_ALLOW_FALLBACKS: '',
      }).openrouterRouting,
    ).toBeUndefined();
  });
});
