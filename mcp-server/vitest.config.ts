import { defineConfig } from 'vitest/config';

// No '@devdigest/shared' alias here: mcp-server imports the shared contracts
// only as types (see tsconfig.json paths, verbatimModuleSyntax and AC28), so
// no runtime module load of that package ever happens. Adding an alias would
// let a stray value import resolve silently instead of failing loudly.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
