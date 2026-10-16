import { describe, it, expect } from 'vitest';
import {
  DEMO_PR_NUMBER,
  DEMO_PR_TITLE,
  DEMO_RUNS,
  demoFindingIds,
  demoRunTime,
  type DemoRunSpec,
} from '../src/db/seed-agent-performance.js';

const DAY = 24;
const MONTH = 720;
const decisions = (s: DemoRunSpec) => s.findings.accepted + s.findings.dismissed;
const within = (hours: number) => DEMO_RUNS.filter((r) => r.offsetHours < hours);
const distinct = (xs: (string | null)[]) => new Set(xs.filter((x): x is string => x !== null));

describe('Agent Performance demo data (pure)', () => {
  it('DEMO_RUNS covers >=2 agents and >=2 models inside 24h and inside 30d', () => {
    for (const hours of [DAY, MONTH]) {
      const runs = within(hours);
      expect(distinct(runs.map((r) => r.agent)).size).toBeGreaterThanOrEqual(2);
      expect(distinct(runs.map((r) => r.model)).size).toBeGreaterThanOrEqual(2);
    }
  });

  it('has a failed run, an unpriced done run, an agentless run, a modelless run', () => {
    expect(DEMO_RUNS.some((r) => r.status === 'failed')).toBe(true);
    expect(DEMO_RUNS.some((r) => r.status === 'done' && r.costUsd === null)).toBe(true);
    expect(DEMO_RUNS.some((r) => r.agent === null)).toBe(true);
    expect(DEMO_RUNS.some((r) => r.model === null)).toBe(true);
  });

  it('Security has >=10 decisions and General 1-9; Test Quality has no run', () => {
    const total = (agent: string) =>
      DEMO_RUNS.filter((r) => r.agent === agent).reduce((n, r) => n + decisions(r), 0);
    expect(total('Security Reviewer')).toBeGreaterThanOrEqual(10);
    expect(total('General Reviewer')).toBeGreaterThanOrEqual(1);
    expect(total('General Reviewer')).toBeLessThanOrEqual(9);
    expect(DEMO_RUNS.some((r) => r.agent === 'Test Quality Reviewer')).toBe(false);
  });

  it('every offset is >=1h from the 24h and 720h boundaries', () => {
    for (const r of DEMO_RUNS) {
      expect(Math.abs(r.offsetHours - DAY)).toBeGreaterThanOrEqual(1);
      expect(Math.abs(r.offsetHours - MONTH)).toBeGreaterThanOrEqual(1);
    }
  });

  it('demoRunTime(seedNow, spec) = seedNow - offsetHours', () => {
    const now = new Date('2026-10-15T12:00:00Z');
    const s1 = DEMO_RUNS.find((r) => r.key === 'S1')!;
    expect(demoRunTime(now, s1).toISOString()).toBe('2026-10-15T10:00:00.000Z');
  });

  it('uses a PR of its own, unique ids, and never the seed model marker', () => {
    expect(DEMO_PR_NUMBER).toBe(476);
    expect(DEMO_PR_TITLE).not.toContain('Add rate limiting');
    const ids = DEMO_RUNS.flatMap((r) => [r.runId, r.reviewId, ...demoFindingIds(r)]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(DEMO_RUNS.some((r) => r.model === 'seed')).toBe(false);
  });

  it('matches the documented 30-day and 1-day figures', () => {
    const sum = (rs: readonly DemoRunSpec[]) => rs.reduce((n, r) => n + (r.costUsd ?? 0), 0);
    expect(DEMO_RUNS).toHaveLength(8);
    expect(sum(DEMO_RUNS)).toBeCloseTo(0.07, 10);
    expect(within(DAY)).toHaveLength(4);
    expect(sum(within(DAY))).toBeCloseTo(0.04, 10);
    const sec1d = within(DAY).filter((r) => r.agent === 'Security Reviewer');
    expect(sec1d.reduce((n, r) => n + decisions(r), 0)).toBe(11);
  });
});
