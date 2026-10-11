import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// Mutation run (stryker.config.json): only the pure eval unit tests, never the Docker suites.
// Spread, not mergeConfig: mergeConfig concatenates `include` arrays instead of replacing them.
export default defineConfig({
  ...base,
  test: { ...base.test, include: ['test/eval-scoring.test.ts', 'test/eval-compare.test.ts'] },
});
