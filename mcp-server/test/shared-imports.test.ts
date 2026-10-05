import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// AC28: no file in mcp-server/src imports from @devdigest/shared except through
// `import type` (top-level), and tsconfig.json sets verbatimModuleSyntax: true.

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));
const TSCONFIG_PATH = fileURLToPath(new URL('../tsconfig.json', import.meta.url));

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

// A statement is a static import/export "from '@devdigest/shared...'". Only a
// TOP-LEVEL `import type` / `export type` is safe under verbatimModuleSyntax — an
// inline `import { type X } from '...'` still leaves a runtime `import {}` because the
// statement itself isn't `import type`.
const STATEMENT_RE = /\b(import|export)\s+(type\s+)?([^;]*?)\s+from\s+['"]@devdigest\/shared(\/[^'"]*)?['"]/gs;
const DYNAMIC_IMPORT_RE = /import\(\s*['"]@devdigest\/shared(\/[^'"]*)?['"]\s*\)/g;

describe('shared-imports discipline', () => {
  it('src imports @devdigest/shared only with import type', () => {
    const files = listTsFiles(SRC_DIR);
    // Non-vacuity guard: the scan must find files and at least one shared import to check.
    expect(files.length).toBeGreaterThan(0);
    const allText = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(allText.includes('@devdigest/shared')).toBe(true);

    const violations: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(STATEMENT_RE)) {
        const isTypeOnly = match[2] !== undefined; // top-level "type " right after import/export
        if (!isTypeOnly) {
          violations.push(`${file}: ${match[0].slice(0, 60)}`);
        }
      }
      for (const match of text.matchAll(DYNAMIC_IMPORT_RE)) {
        violations.push(`${file}: ${match[0]}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('tsconfig.json sets verbatimModuleSyntax: true', () => {
    const tsconfig = JSON.parse(readFileSync(TSCONFIG_PATH, 'utf8')) as {
      compilerOptions?: { verbatimModuleSyntax?: boolean };
    };
    expect(tsconfig.compilerOptions?.verbatimModuleSyntax).toBe(true);
  });

  it('flags a value-shaped import that this scanner must not silently accept', () => {
    // Guards the guard: a mixed import like `import { type X } from '@devdigest/shared'`
    // (no top-level `type`) must be counted as a violation by STATEMENT_RE.
    const sample = "import { type Repo } from '@devdigest/shared';\n";
    const matches = [...sample.matchAll(STATEMENT_RE)];
    expect(matches).toHaveLength(1);
    expect(matches[0]![2]).toBeUndefined();
  });
});
