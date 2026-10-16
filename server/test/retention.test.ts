import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RETENTION,
  shouldSweep,
  type RunSummary,
} from '../src/modules/_shared/retention.js';

const NOW = new Date('2026-09-20T00:00:00Z');

function run(over: Partial<RunSummary> = {}): RunSummary {
  return { finishedAt: new Date('2026-01-01T00:00:00Z'), blockers: 0, ...over };
}

describe('shouldSweep', () => {
  it('sweeps a finished run that is older than the retention window', () => {
    expect(shouldSweep(run(), DEFAULT_RETENTION, NOW)).toBe(true);
  });
});
