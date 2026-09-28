import { describe, it, expect } from 'vitest';
import { toBlastRadius, blastSummary } from '../src/modules/blast/helpers.js';
import type { BlastFacadeResult } from '../src/modules/blast/helpers.js';

/**
 * Red-first for homework-5 (docs/homework-5/plan.md), AC4, AC13, AC14, AC15,
 * AC24 and the "summary string follows the count rules" spec under
 * "Contracts & data". `toBlastRadius` and `blastSummary` don't exist yet
 * (server/src/modules/blast/helpers.ts is new) — this whole file is red on
 * the missing module until the implementer writes it.
 */

describe('toBlastRadius: groups flat callers by viaSymbol', () => {
  it('groups flat callers by viaSymbol', () => {
    const result: BlastFacadeResult = {
      changedSymbols: [
        { file: 'a.ts', name: 'foo', kind: 'function' },
        { file: 'a.ts', name: 'bar', kind: 'function' },
      ],
      callers: [
        { file: 'c1.ts', symbol: 'callerA', viaSymbol: 'foo', line: 1, rank: 1 },
        { file: 'c2.ts', symbol: 'callerB', viaSymbol: 'bar', line: 2, rank: 1 },
        { file: 'c3.ts', symbol: 'callerC', viaSymbol: 'foo', line: 3, rank: 1 },
      ],
    };

    const radius = toBlastRadius(result, 'full', { maxCallersPerSymbol: 10 });

    expect(radius.downstream.map((d) => d.symbol).sort()).toEqual(['bar', 'foo']);

    const foo = radius.downstream.find((d) => d.symbol === 'foo')!;
    expect(foo.callers.map((c) => ({ name: c.name, file: c.file }))).toEqual([
      { name: 'callerA', file: 'c1.ts' },
      { name: 'callerC', file: 'c3.ts' },
    ]);

    const bar = radius.downstream.find((d) => d.symbol === 'bar')!;
    expect(bar.callers.map((c) => ({ name: c.name, file: c.file }))).toEqual([
      { name: 'callerB', file: 'c2.ts' },
    ]);
  });
});

describe('toBlastRadius: endpoints/crons from factsByFile', () => {
  it('attributes endpoints and crons from factsByFile, deduplicated', () => {
    const result: BlastFacadeResult = {
      changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }],
      callers: [
        { file: 'f1.ts', symbol: 'callerA', viaSymbol: 'foo', line: 1, rank: 1 },
        { file: 'f2.ts', symbol: 'callerB', viaSymbol: 'foo', line: 2, rank: 1 },
      ],
      factsByFile: {
        'f1.ts': { endpoints: ['GET /a', 'GET /b'], crons: ['cronA'] },
        'f2.ts': { endpoints: ['GET /b', 'GET /c'], crons: ['cronA', 'cronB'] },
      },
    };

    const radius = toBlastRadius(result, 'full', { maxCallersPerSymbol: 10 });
    const foo = radius.downstream.find((d) => d.symbol === 'foo')!;

    // Union, deduplicated, in first-seen caller order (f1 before f2).
    expect(foo.endpoints_affected).toEqual(['GET /a', 'GET /b', 'GET /c']);
    expect(foo.crons_affected).toEqual(['cronA', 'cronB']);
  });

  it('no factsByFile gives empty endpoints and crons', () => {
    const result: BlastFacadeResult = {
      changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }],
      callers: [{ file: 'c1.ts', symbol: 'callerA', viaSymbol: 'foo', line: 1, rank: 1 }],
      // factsByFile intentionally absent — the fallback (ripgrep) path.
    };

    const radius = toBlastRadius(result, 'degraded', { maxCallersPerSymbol: 10 });
    const foo = radius.downstream.find((d) => d.symbol === 'foo')!;

    expect(foo.endpoints_affected).toEqual([]);
    expect(foo.crons_affected).toEqual([]);
  });
});

describe('toBlastRadius: self-exclusion', () => {
  it("drops callers in the symbol's own declaring file", () => {
    // Two changed files both declare a symbol named 'foo' (Review focus:
    // "the same symbol name declared in two changed files" — self-exclusion
    // must check every declaring file, not just one).
    const result: BlastFacadeResult = {
      changedSymbols: [
        { file: 'a.ts', name: 'foo', kind: 'function' },
        { file: 'b.ts', name: 'foo', kind: 'function' },
      ],
      callers: [
        // 'a.ts' declares 'foo' itself — this caller must be dropped even
        // though the declaring row that matters here is 'b.ts'.
        { file: 'a.ts', symbol: 'inner', viaSymbol: 'foo', line: 5, rank: 1 },
        { file: 'c.ts', symbol: 'outer', viaSymbol: 'foo', line: 10, rank: 2 },
      ],
    };

    const radius = toBlastRadius(result, 'full', { maxCallersPerSymbol: 10 });
    const foo = radius.downstream.find((d) => d.symbol === 'foo')!;

    expect(foo.callers.map((c) => c.file)).toEqual(['c.ts']);
  });
});

describe('toBlastRadius: per-symbol cap', () => {
  it('caps callers per symbol at the limit passed in', () => {
    const result: BlastFacadeResult = {
      changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }],
      callers: [
        { file: 'c1.ts', symbol: 'callerA', viaSymbol: 'foo', line: 1, rank: 5 },
        { file: 'c2.ts', symbol: 'callerB', viaSymbol: 'foo', line: 2, rank: 3 },
        { file: 'c3.ts', symbol: 'callerC', viaSymbol: 'foo', line: 3, rank: 1 },
        { file: 'c4.ts', symbol: 'callerD', viaSymbol: 'foo', line: 4, rank: 4 },
      ],
    };

    const radius = toBlastRadius(result, 'full', { maxCallersPerSymbol: 2 });
    const foo = radius.downstream.find((d) => d.symbol === 'foo')!;

    expect(foo.callers).toHaveLength(2);
    // Ranks 5 and 4 are the two highest — the cap keeps the top-ranked callers.
    expect(foo.callers.map((c) => c.file)).toEqual(['c1.ts', 'c4.ts']);
  });
});

describe('toBlastRadius: degraded/reason pass-through', () => {
  it('degraded/reason pass-through, partial -> index_partial, full -> clean', () => {
    // (a) facade degraded with an explicit reason: passed through as-is.
    const a = toBlastRadius(
      { changedSymbols: [], callers: [], degraded: true, reason: 'repo_too_large' },
      'full',
      { maxCallersPerSymbol: 10 },
    );
    expect(a.degraded).toBe(true);
    expect(a.reason).toBe('repo_too_large');

    // (b) facade degraded with no reason given -> defaults to no_data.
    const b = toBlastRadius({ changedSymbols: [], callers: [], degraded: true }, 'full', {
      maxCallersPerSymbol: 10,
    });
    expect(b.degraded).toBe(true);
    expect(b.reason).toBe('no_data');

    // (c) facade clean, but the index status is partial -> degraded, index_partial.
    const c = toBlastRadius({ changedSymbols: [], callers: [], degraded: false }, 'partial', {
      maxCallersPerSymbol: 10,
    });
    expect(c.degraded).toBe(true);
    expect(c.reason).toBe('index_partial');

    // (d) facade clean, index full -> clean.
    const d = toBlastRadius({ changedSymbols: [], callers: [], degraded: false }, 'full', {
      maxCallersPerSymbol: 10,
    });
    expect(d.degraded).toBe(false);
    expect(d.reason).toBeNull();
  });
});

describe('toBlastRadius: deterministic ordering', () => {
  it('orders symbols and callers by rank with deterministic ties', () => {
    const result: BlastFacadeResult = {
      changedSymbols: [
        { file: 'm.ts', name: 'zeta', kind: 'function' },
        { file: 'm.ts', name: 'alpha', kind: 'function' },
        { file: 'm.ts', name: 'beta', kind: 'function' },
      ],
      callers: [
        { file: 'z1.ts', symbol: 'callerZ', viaSymbol: 'zeta', line: 1, rank: 10 },
        // alpha and beta both top out at rank 5 -> tie broken by symbol name asc.
        { file: 'b.ts', symbol: 'callerAlpha2', viaSymbol: 'alpha', line: 20, rank: 5 },
        { file: 'a.ts', symbol: 'callerAlpha1', viaSymbol: 'alpha', line: 5, rank: 5 },
        { file: 'c.ts', symbol: 'callerBeta', viaSymbol: 'beta', line: 1, rank: 5 },
      ],
    };

    const radius = toBlastRadius(result, 'full', { maxCallersPerSymbol: 10 });

    // Groups: zeta (max rank 10) first, then alpha before beta (tie at 5, 'alpha' < 'beta').
    expect(radius.downstream.map((d) => d.symbol)).toEqual(['zeta', 'alpha', 'beta']);

    // Callers within the alpha group: same rank -> file ascending ('a.ts' before 'b.ts').
    const alpha = radius.downstream.find((d) => d.symbol === 'alpha')!;
    expect(alpha.callers.map((c) => c.file)).toEqual(['a.ts', 'b.ts']);
  });
});

describe('blastSummary: count rules', () => {
  it('summary string follows the count rules', () => {
    const radius = {
      changed_symbols: [
        { name: 'foo', file: 'a.ts', kind: 'function' },
        { name: 'bar', file: 'a.ts', kind: 'function' },
      ],
      downstream: [
        {
          symbol: 'foo',
          callers: [
            { name: 'c1', file: 'x.ts', line: 1 },
            { name: 'c2', file: 'x.ts', line: 2 },
          ],
          endpoints_affected: ['GET /a'],
          crons_affected: ['cronA'],
        },
        {
          symbol: 'bar',
          // 'x.ts:1' repeats a caller pair already counted above — must not
          // be double-counted (distinct file:line pairs, Count rules).
          callers: [
            { name: 'c3', file: 'y.ts', line: 1 },
            { name: 'c1', file: 'x.ts', line: 1 },
          ],
          endpoints_affected: ['GET /b'],
          crons_affected: [],
        },
      ],
      degraded: false,
      reason: null,
    };

    expect(blastSummary(radius)).toBe(
      '2 changed symbol(s) · 3 caller(s) · 2 endpoint(s) · 1 cron/job(s)',
    );
    expect(blastSummary({ ...radius, degraded: true, reason: 'index_partial' })).toBe(
      '2 changed symbol(s) · 3 caller(s) · 2 endpoint(s) · 1 cron/job(s) · index incomplete (index_partial)',
    );
  });
});
