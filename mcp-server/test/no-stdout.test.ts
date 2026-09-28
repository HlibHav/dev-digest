import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// AC24: only src/log.ts touches console, and only via console.error; no file uses
// process.stdout. This is a static scan of mcp-server/src.

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));

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

describe('stdout discipline', () => {
  it('only log.ts touches console, via console.error', () => {
    const files = listTsFiles(SRC_DIR);
    // Non-vacuity guard: the scan must actually find files, including log.ts.
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.endsWith('/log.ts'))).toBe(true);

    const offenders: string[] = [];
    let logTsUsesOnlyConsoleError = true;
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const consoleUses = text.match(/console\.\w+/g) ?? [];
      if (file.endsWith('/log.ts')) {
        if (consoleUses.some((u) => u !== 'console.error')) {
          logTsUsesOnlyConsoleError = false;
        }
        continue;
      }
      if (consoleUses.length > 0) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
    expect(logTsUsesOnlyConsoleError).toBe(true);
  });

  it('no file contains process.stdout', () => {
    const files = listTsFiles(SRC_DIR);
    const offenders = files.filter((f) => readFileSync(f, 'utf8').includes('process.stdout'));
    expect(offenders).toEqual([]);
  });
});
