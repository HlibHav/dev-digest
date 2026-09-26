import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Smart Diff — role order + classification patterns. Pure data, no HTTP, no DB
 * (importable by lesson L08 as a prompt filter). Two independent orderings
 * live here — do not conflate them:
 *
 *  - `ROLE_ORDER` is the DISPLAY order (also the enum's declared order).
 *  - `CLASSIFY_RULES` is the MATCHING priority order: first match wins.
 *    `core` is the implicit fallback and never appears as a rule row.
 */
export const ROLE_ORDER: SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

export const CLASSIFY_RULES: { role: Exclude<SmartDiffRole, 'core'>; patterns: string[] }[] = [
  {
    role: 'boilerplate',
    patterns: [
      '*.lock',
      'pnpm-lock.yaml',
      'package-lock.json',
      'yarn.lock',
      'dist/**',
      'build/**',
      '**/__snapshots__/**',
      '*.snap',
      '*.generated.*',
      '*.min.js',
    ],
  },
  {
    role: 'tests',
    patterns: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.it.test.ts',
      '**/*.spec.ts',
      '**/test/**',
      '**/tests/**',
      '**/__tests__/**',
      'e2e/**',
    ],
  },
  {
    role: 'wiring',
    patterns: [
      'index.ts',
      'index.js',
      // Deliberate deviation from the plain course rule set: `package.json`
      // (any depth) is configuration, not business logic — without this it
      // would fall into `core` right next to the code it configures.
      'package.json',
      '*.config.*',
      'tsconfig*.json',
      '.eslintrc*',
      '.env*',
      'docker-compose*.yml',
      '.github/**',
      '.claude/**',
    ],
  },
  {
    role: 'docs',
    patterns: ['**/*.md', 'docs/**', 'README*', 'CHANGELOG*', 'LICENSE'],
  },
];
