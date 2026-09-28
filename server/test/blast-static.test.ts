import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Red-first for homework-5 (docs/homework-5/plan.md) AC12 and AC14. Static
 * text scan over `server/src/modules/blast/` — the module doesn't exist yet,
 * so `readdirSync` throws ENOENT until the implementer creates it.
 */

const BLAST_DIR = fileURLToPath(new URL('../src/modules/blast/', import.meta.url));

/** AC12: no LLM, no indexer on the main path. */
const FORBIDDEN_MENTIONS = ['llm', 'resolveFeatureModel', 'indexRepo', 'refreshIndex', 'codeIndex'];

function blastSourceFiles(): string[] {
  return readdirSync(BLAST_DIR).filter((f) => f.endsWith('.ts'));
}

describe('blast module calls no LLM and no indexer', () => {
  it('blast module calls no LLM and no indexer', () => {
    const files = blastSourceFiles();
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(BLAST_DIR + file, 'utf8');
      for (const word of FORBIDDEN_MENTIONS) {
        if (content.includes(word)) offenders.push(`${file}: mentions "${word}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the per-symbol caller cap comes from repo-intel constants', () => {
  it('wiring takes the cap from repo-intel constants', () => {
    const wiring = readFileSync(BLAST_DIR + 'wiring.ts', 'utf8');
    expect(wiring).toContain('MAX_CALLERS_PER_SYMBOL');
    expect(wiring).toContain('repo-intel/constants.js');

    // The cap is a parameter of the mapper — helpers.ts and service.ts must
    // not import (or hardcode) the constant themselves.
    for (const file of ['helpers.ts', 'service.ts']) {
      const content = readFileSync(BLAST_DIR + file, 'utf8');
      expect(content).not.toContain('MAX_CALLERS_PER_SYMBOL');
    }
  });
});
