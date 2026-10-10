import type { EvalExpectation, EvalMetricName } from '@devdigest/shared';

/** A drop of this many whole points (or more) between two runs is a regression. */
export const REGRESSION_POINTS = 2;

export type Range = { file: string; start_line: number; end_line: number };

export interface CaseScore {
  matchedMustFind: number;
  mustFindTotal: number;
  matchedFindings: number;
  noiseFindings: number;
  grounded: number;
  dropped: number;
  passed: boolean;
}

export interface SuiteMetrics {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  cases_passed: number;
}

type MetricTriple = Pick<SuiteMetrics, 'recall' | 'precision' | 'citation_accuracy'>;

/**
 * Same file and intersecting inclusive line ranges; a reversed range is normalised.
 * A finding with start_line 0 covers the whole file (grounding treats it so), so it
 * intersects any expectation on that file.
 */
export function findingMatches(f: Range, e: EvalExpectation): boolean {
  if (f.file !== e.file) return false;
  if (f.start_line === 0) return true;
  const fLo = Math.min(f.start_line, f.end_line);
  const fHi = Math.max(f.start_line, f.end_line);
  const eLo = Math.min(e.start_line, e.end_line);
  const eHi = Math.max(e.start_line, e.end_line);
  return fLo <= eHi && eLo <= fHi;
}

export function scoreCase(
  expectations: readonly EvalExpectation[],
  grounded: readonly Range[],
  droppedCount: number,
): CaseScore {
  const mustFind = expectations.filter((e) => e.type === 'must_find');
  const mustNot = expectations.filter((e) => e.type === 'must_not_flag');
  const expectClean = expectations.length === 0;
  const matchedExpectations = new Set<EvalExpectation>();
  let matchedFindings = 0;
  let noiseFindings = 0;

  for (const f of grounded) {
    const isNoise = expectClean || mustNot.some((e) => findingMatches(f, e));
    if (isNoise) {
      noiseFindings += 1;
      continue;
    }
    const hits = mustFind.filter((e) => findingMatches(f, e));
    if (hits.length > 0) {
      matchedFindings += 1;
      for (const e of hits) matchedExpectations.add(e);
    }
  }

  const matchedMustFind = matchedExpectations.size;
  return {
    matchedMustFind,
    mustFindTotal: mustFind.length,
    matchedFindings,
    noiseFindings,
    grounded: grounded.length,
    dropped: droppedCount,
    passed: matchedMustFind === mustFind.length && noiseFindings === 0,
  };
}

export function ratio(num: number, den: number): number | null {
  return den === 0 ? null : num / den;
}

/** Pool the counts of every scored case; errored cases are never passed in. */
export function aggregateSuite(scores: readonly CaseScore[]): SuiteMetrics {
  let matched = 0;
  let total = 0;
  let matchedFindings = 0;
  let noise = 0;
  let grounded = 0;
  let dropped = 0;
  let passed = 0;
  for (const s of scores) {
    matched += s.matchedMustFind;
    total += s.mustFindTotal;
    matchedFindings += s.matchedFindings;
    noise += s.noiseFindings;
    grounded += s.grounded;
    dropped += s.dropped;
    if (s.passed) passed += 1;
  }
  return {
    recall: ratio(matched, total),
    precision: ratio(matchedFindings, matchedFindings + noise),
    citation_accuracy: ratio(grounded, grounded + dropped),
    cases_passed: passed,
  };
}

export function suiteCost(costs: readonly (number | null)[]): { cost_usd: number | null; cost_partial: boolean } {
  let sum = 0;
  let known = 0;
  for (const c of costs) {
    if (c !== null) {
      sum += c;
      known += 1;
    }
  }
  if (known === 0) return { cost_usd: null, cost_partial: false };
  return { cost_usd: sum, cost_partial: known < costs.length };
}

const METRICS: readonly EvalMetricName[] = ['recall', 'precision', 'citation_accuracy'];

export function regressionDrops(
  previous: MetricTriple,
  latest: MetricTriple,
): { metric: EvalMetricName; points: number }[] {
  const out: { metric: EvalMetricName; points: number }[] = [];
  for (const metric of METRICS) {
    const prev = previous[metric];
    const last = latest[metric];
    if (prev === null || last === null) continue;
    const points = Math.round(prev * 100) - Math.round(last * 100);
    if (points >= REGRESSION_POINTS) out.push({ metric, points });
  }
  return out;
}
