import { describe, it, expect } from 'vitest';
import { AppError } from '../src/platform/errors.js';
import { resolveWindow } from '../src/modules/agent-performance/window.js';

const NOW = new Date('2026-10-15T12:00:00.000Z');
const HOUR = 3_600_000;

function rejects(query: unknown): AppError {
  try {
    resolveWindow(query, NOW);
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error(`expected ${JSON.stringify(query)} to be rejected`);
}

describe('resolveWindow', () => {
  it('1d → start now−24h exclusive, end now inclusive', () => {
    const w = resolveWindow({ period: '1d' }, NOW);
    expect(w).toEqual({
      period: '1d',
      start: new Date(NOW.getTime() - 24 * HOUR),
      end: NOW,
      startInclusive: false,
      endInclusive: true,
    });
  });

  it('30d → start now−720h', () => {
    const w = resolveWindow({ period: '30d' }, NOW);
    expect(w.period).toBe('30d');
    expect(w.start).toEqual(new Date(NOW.getTime() - 720 * HOUR));
    expect(w.end).toEqual(NOW);
    expect([w.startInclusive, w.endInclusive]).toEqual([false, true]);
  });

  it('missing period → 30d', () => {
    expect(resolveWindow({}, NOW).period).toBe('30d');
    expect(resolveWindow(undefined, NOW).period).toBe('30d');
  });

  it('1d and 30d ignore from/to', () => {
    const w = resolveWindow({ period: '1d', from: 'junk', to: '2999-01-01' }, NOW);
    expect(w.period).toBe('1d');
  });

  it('custom → [from 00:00Z, to+1 00:00Z)', () => {
    const w = resolveWindow({ period: 'custom', from: '2026-10-01', to: '2026-10-07' }, NOW);
    expect(w).toEqual({
      period: 'custom',
      start: new Date('2026-10-01T00:00:00.000Z'),
      end: new Date('2026-10-08T00:00:00.000Z'),
      startInclusive: true,
      endInclusive: false,
    });
  });

  it('custom to = today is valid', () => {
    const w = resolveWindow({ period: 'custom', from: '2026-10-15', to: '2026-10-15' }, NOW);
    expect(w.end).toEqual(new Date('2026-10-16T00:00:00.000Z'));
  });

  it('a 366-day inclusive span is valid', () => {
    const w = resolveWindow({ period: 'custom', from: '2025-01-01', to: '2026-01-01' }, NOW);
    expect(w.start).toEqual(new Date('2025-01-01T00:00:00.000Z'));
  });

  it.each([
    ['period=week', { period: 'week' }],
    ['malformed date', { period: 'custom', from: '2026-1-01', to: '2026-10-07' }],
    ['impossible date', { period: 'custom', from: '2026-02-30', to: '2026-03-02' }],
    ['missing to', { period: 'custom', from: '2026-10-01' }],
    ['missing from', { period: 'custom', to: '2026-10-07' }],
    ['from>to', { period: 'custom', from: '2026-10-07', to: '2026-10-01' }],
    ['to>today', { period: 'custom', from: '2026-10-01', to: '2026-10-16' }],
    ['367-day span', { period: 'custom', from: '2025-01-01', to: '2026-01-02' }],
    ['repeated period', { period: ['1d', '30d'] }],
  ])('throws AppError 400 invalid_period for: %s', (_name, query) => {
    const err = rejects(query);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('invalid_period');
    expect(err.message).toBe('Invalid period');
    expect(err.details).toBeUndefined();
  });
});
