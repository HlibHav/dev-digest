import { describe, it, expect } from 'vitest';
import { prAgeLabel, prAgeSortKey } from '../src/modules/pulls/age.js';

const now = Date.UTC(2026, 8, 26, 12, 0, 0);

describe('prAgeLabel', () => {
  it('formats a PR opened a few hours ago', () => {
    const opened = new Date(now - 3 * 3_600_000).toISOString();
    expect(prAgeLabel(opened, now)).toBe('opened 3 hours ago');
  });

  it('formats a PR opened days ago', () => {
    const opened = new Date(now - 2 * 86_400_000).toISOString();
    expect(prAgeLabel(opened, now)).toBe('opened 2 days ago');
  });
});

describe('prAgeSortKey', () => {
  it('orders earlier timestamps first', () => {
    expect(prAgeSortKey('2026-01-01T00:00:00Z')).toBeLessThan(prAgeSortKey('2026-01-02T00:00:00Z'));
  });
});
