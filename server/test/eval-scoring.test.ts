import { describe, it, expect } from 'vitest';
import {
  findingMatches,
  scoreCase,
  aggregateSuite,
  suiteCost,
  regressionDrops,
  REGRESSION_POINTS,
  type Range,
} from '../src/modules/eval/scoring.js';
import type { EvalExpectation } from '../src/vendor/shared/contracts/eval-pipeline.js';

const must = (file: string, s: number, e = s): EvalExpectation => ({ type: 'must_find', file, start_line: s, end_line: e });
const not = (file: string, s: number, e = s): EvalExpectation => ({ type: 'must_not_flag', file, start_line: s, end_line: e });
const g = (file: string, s: number, e = s): Range => ({ file, start_line: s, end_line: e });

describe('findingMatches full-file findings', () => {
  const must: EvalExpectation = { type: 'must_find', file: 'a.ts', start_line: 1, end_line: 1 };
  const not: EvalExpectation = { type: 'must_not_flag', file: 'a.ts', start_line: 40, end_line: 50 };
  const g = (file: string, s: number, e: number): Range => ({ file, start_line: s, end_line: e });

  it('a 0..0 finding matches a 1..1 expectation on the same file', () => {
    expect(findingMatches(g('a.ts', 0, 0), must)).toBe(true);
  });
  it('a 0..0 finding hits a must_not_flag on the same file', () => {
    expect(scoreCase([not], [g('a.ts', 0, 0)], 0).noiseFindings).toBe(1);
  });
  it('a 0..0 finding does not match another file', () => {
    expect(findingMatches(g('b.ts', 0, 0), must)).toBe(false);
  });
});

describe('findingMatches', () => {
  it('AC-16 same file and intersecting inclusive range match; severity/title are not compared', () => {
    const e = must('a.ts', 10, 12);
    expect(findingMatches(g('a.ts', 12, 20), e)).toBe(true); // touches the end
    expect(findingMatches(g('a.ts', 1, 10), e)).toBe(true); // touches the start
    expect(findingMatches(g('a.ts', 11, 11), e)).toBe(true); // inside
    expect(findingMatches(g('a.ts', 1, 20), e)).toBe(true); // covers
    expect(findingMatches(g('a.ts', 13, 20), e)).toBe(false);
    expect(findingMatches(g('a.ts', 1, 9), e)).toBe(false);
    expect(findingMatches(g('b.ts', 10, 12), e)).toBe(false);
    const withMeta = { ...e, severity: 'high', title: 'x' } as EvalExpectation;
    expect(findingMatches(g('a.ts', 11), withMeta)).toBe(true);
  });
  it('reversed finding range still matches', () => {
    expect(findingMatches(g('a.ts', 15, 12), must('a.ts', 12, 12))).toBe(true);
    expect(findingMatches(g('a.ts', 15, 13), must('a.ts', 12, 12))).toBe(false);
  });
});

describe('scoreCase', () => {
  it('AC-17 counts matched must_find per expectation', () => {
    const s = scoreCase([must('a.ts', 1), must('b.ts', 5), must('c.ts', 9)], [g('a.ts', 1), g('b.ts', 5)], 0);
    expect(s.matchedMustFind).toBe(2);
    expect(s.mustFindTotal).toBe(3);
    expect(s.matchedFindings).toBe(2);
    expect(s.noiseFindings).toBe(0);
    expect(s.passed).toBe(false);
  });

  it('AC-18 a finding matching must_not_flag is noise; every finding in an expect-clean case is noise', () => {
    const a = scoreCase([not('a.ts', 4, 6)], [g('a.ts', 5)], 0);
    expect(a.noiseFindings).toBe(1);
    expect(a.passed).toBe(false);
    const clean = scoreCase([], [g('a.ts', 1), g('z.ts', 9)], 0);
    expect(clean.noiseFindings).toBe(2);
    expect(clean.passed).toBe(false);
  });

  it('AC-18 matching both must_find and must_not_flag is noise, not a match', () => {
    const s = scoreCase([must('a.ts', 5), not('a.ts', 5)], [g('a.ts', 5)], 0);
    expect(s.noiseFindings).toBe(1);
    expect(s.matchedFindings).toBe(0);
    expect(s.matchedMustFind).toBe(0);
    expect(s.passed).toBe(false);
  });

  it('AC-19 a finding outside a must_not_flag range is neutral', () => {
    const s = scoreCase([not('a.ts', 4, 6)], [g('a.ts', 50)], 0);
    expect(s.noiseFindings).toBe(0);
    expect(s.matchedFindings).toBe(0);
    expect(s.grounded).toBe(1);
    expect(s.passed).toBe(true);
  });

  it('AC-21 passes when all must_find matched and no noise; clean/must_not_flag with zero findings passes', () => {
    expect(scoreCase([must('a.ts', 1)], [g('a.ts', 1)], 0).passed).toBe(true);
    expect(scoreCase([must('a.ts', 1)], [g('a.ts', 1), g('q.ts', 3)], 0).passed).toBe(true); // neutral extra
    expect(scoreCase([must('a.ts', 1)], [], 0).passed).toBe(false);
    expect(scoreCase([], [], 0).passed).toBe(true);
    expect(scoreCase([not('a.ts', 1)], [], 0).passed).toBe(true);
  });

  it('carries grounded and dropped counts', () => {
    const s = scoreCase([], [], 3);
    expect(s.grounded).toBe(0);
    expect(s.dropped).toBe(3);
  });
});

describe('aggregateSuite', () => {
  it('AC-17 recall pools must_find across cases (2 of 3 = 0.667); null with zero must_find', () => {
    const c1 = scoreCase([must('a.ts', 1), must('b.ts', 1)], [g('a.ts', 1)], 0);
    const c2 = scoreCase([must('c.ts', 1)], [g('c.ts', 1)], 0);
    const m = aggregateSuite([c1, c2]);
    expect(m.recall).toBeCloseTo(0.667, 3);
    expect(m.cases_passed).toBe(1);
    expect(aggregateSuite([scoreCase([], [], 0)]).recall).toBeNull();
  });

  it('AC-19 precision = matched / (matched + noise) pooled: 3 matched, 1 noise = 0.75', () => {
    const c1 = scoreCase([must('a.ts', 1), must('b.ts', 1), must('c.ts', 1)], [g('a.ts', 1), g('b.ts', 1), g('c.ts', 1)], 0);
    const c2 = scoreCase([not('d.ts', 1)], [g('d.ts', 1)], 0);
    expect(aggregateSuite([c1, c2]).precision).toBe(0.75);
  });

  it('AC-19 precision is null with zero matched and zero noise', () => {
    expect(aggregateSuite([scoreCase([not('a.ts', 1)], [g('z.ts', 9)], 0)]).precision).toBeNull();
  });

  it('AC-20 citation accuracy = grounded / (grounded + dropped): 9 of 10 = 0.9; null with zero findings', () => {
    const grounded = Array.from({ length: 9 }, (_, i) => g('a.ts', i + 1));
    expect(aggregateSuite([scoreCase([], grounded, 1)]).citation_accuracy).toBe(0.9);
    expect(aggregateSuite([scoreCase([], [], 0)]).citation_accuracy).toBeNull();
  });

  it('zero scores gives all null and 0 passed', () => {
    expect(aggregateSuite([])).toEqual({ recall: null, precision: null, citation_accuracy: null, cases_passed: 0 });
  });
});

describe('suiteCost', () => {
  it('AC-24 sums known costs and flags partial when one is missing (0.03 partial)', () => {
    const c = suiteCost([0.01, 0.02, null]);
    expect(c.cost_usd).toBeCloseTo(0.03, 10);
    expect(c.cost_partial).toBe(true);
  });
  it('AC-24 all known is not partial; none known is null and not partial', () => {
    expect(suiteCost([0.5, 0.25])).toEqual({ cost_usd: 0.75, cost_partial: false });
    expect(suiteCost([null, null])).toEqual({ cost_usd: null, cost_partial: false });
    expect(suiteCost([])).toEqual({ cost_usd: null, cost_partial: false });
  });
});

describe('regressionDrops', () => {
  const m = (recall: number | null, precision: number | null, citation_accuracy: number | null) => ({
    recall,
    precision,
    citation_accuracy,
  });
  it('AC-56 0.93 -> 0.91 on precision is 2 points; 0.01 drop gives none', () => {
    expect(regressionDrops(m(0.8, 0.93, 0.9), m(0.8, 0.91, 0.9))).toEqual([{ metric: 'precision', points: 2 }]);
    expect(regressionDrops(m(0.8, 0.93, 0.9), m(0.8, 0.92, 0.9))).toEqual([]);
  });
  it('AC-56 boundary in integer points (0.89 -> 0.87 alerts, 0.90 -> 0.89 does not)', () => {
    expect(REGRESSION_POINTS).toBe(2);
    expect(regressionDrops(m(0.89, null, null), m(0.87, null, null))).toEqual([{ metric: 'recall', points: 2 }]);
    expect(regressionDrops(m(0.9, null, null), m(0.89, null, null))).toEqual([]);
  });
  it('AC-56 a null on either side never alerts; improvements never alert; order is recall, precision, citation', () => {
    expect(regressionDrops(m(null, 0.9, 0.9), m(0.1, null, 0.1))).toEqual([{ metric: 'citation_accuracy', points: 80 }]);
    expect(regressionDrops(m(0.5, 0.5, 0.5), m(0.9, 0.9, 0.9))).toEqual([]);
    expect(regressionDrops(m(0.9, 0.9, 0.9), m(0.5, 0.5, 0.5)).map((d) => d.metric)).toEqual([
      'recall',
      'precision',
      'citation_accuracy',
    ]);
  });
});
