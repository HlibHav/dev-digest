import { describe, it, expect } from 'vitest';
import { lineDiff, configChanges, caseSetChange, metricDeltas } from '../src/modules/eval/compare.js';
import type {
  EvalAgentSnapshot,
  EvalScoredCase,
  EvalSuiteRunSummary,
} from '../src/vendor/shared/contracts/eval-pipeline.js';

const snap = (over: Partial<EvalAgentSnapshot> = {}): EvalAgentSnapshot => ({
  system_prompt: 'p',
  model: 'm1',
  provider: 'openai',
  strategy: 'auto',
  skills: [],
  ...over,
});
const sc = (id: string): EvalScoredCase => ({ case_id: id, case_name: id, status: 'passed' });
const run = (over: Partial<EvalSuiteRunSummary> = {}): EvalSuiteRunSummary => ({
  id: 'r',
  agent_id: 'a',
  run_number: 1,
  agent_version: 1,
  status: 'done',
  error: null,
  started_at: '2026-01-01T00:00:00Z',
  finished_at: null,
  cases_total: 1,
  cases_done: 1,
  cases_passed: 1,
  cases_errored: 0,
  recall: 0.5,
  precision: 0.5,
  citation_accuracy: 0.5,
  cost_usd: 1,
  cost_partial: false,
  duration_ms: 1,
  scored_cases: [],
  ...over,
});

describe('lineDiff', () => {
  it('one changed line', () => {
    const d = lineDiff('a\nb\nc', 'a\nB\nc');
    expect(d.map((l) => l.op)).toEqual(['equal', 'remove', 'add', 'equal']);
    expect(d.map((l) => l.text)).toEqual(['a', 'b', 'B', 'c']);
  });
  it('identical text is all equal; empty to text is all add', () => {
    expect(lineDiff('x\ny', 'x\ny').every((l) => l.op === 'equal')).toBe(true);
    expect(lineDiff('', 'x').map((l) => l.op)).toEqual(['add']);
  });
  it('never truncates', () => {
    const a = Array.from({ length: 2000 }, (_, i) => `l${i}`).join('\n');
    const b = Array.from({ length: 2000 }, (_, i) => (i === 1000 ? 'changed' : `l${i}`)).join('\n');
    const d = lineDiff(a, b);
    expect(d.length).toBe(2001);
    expect(d.filter((l) => l.op === 'equal').length).toBe(1999);
  });
});

describe('configChanges', () => {
  it('no change gives an empty list', () => {
    expect(configChanges(snap(), snap())).toEqual([]);
  });
  it('model, provider and strategy changes', () => {
    const out = configChanges(snap(), snap({ model: 'm2', provider: 'anthropic', strategy: 'map-reduce' }));
    expect(out).toEqual([
      { kind: 'model', name: null, from: 'm1', to: 'm2' },
      { kind: 'provider', name: null, from: 'openai', to: 'anthropic' },
      { kind: 'strategy', name: null, from: 'auto', to: 'map-reduce' },
    ]);
  });
  it('lists a skill version bump, added and removed skills', () => {
    const s = (id: string, name: string, version: number) => ({ id, name, version, body: '' });
    const out = configChanges(
      snap({ skills: [s('1', 'sec', 1), s('2', 'gone', 1)] }),
      snap({ skills: [s('1', 'sec', 2), s('3', 'new', 1)] }),
    );
    expect(out).toContainEqual({ kind: 'skill_version', name: 'sec', from: '1', to: '2' });
    expect(out).toContainEqual({ kind: 'skill_removed', name: 'gone', from: '1', to: null });
    expect(out).toContainEqual({ kind: 'skill_added', name: 'new', from: null, to: '1' });
    expect(out).toHaveLength(3);
  });
});

describe('caseSetChange', () => {
  it('{a,b,c} -> {b,c,d,e} = added 2, removed 1', () => {
    expect(caseSetChange([sc('a'), sc('b'), sc('c')], [sc('b'), sc('c'), sc('d'), sc('e')])).toEqual({
      added: 2,
      removed: 1,
    });
  });
  it('same set is 0/0', () => {
    expect(caseSetChange([sc('a')], [sc('a')])).toEqual({ added: 0, removed: 0 });
  });
});

describe('metricDeltas', () => {
  it('head minus base; null when either side is null; cost signed', () => {
    const d = metricDeltas(
      run({ recall: 0.5, precision: null, citation_accuracy: 0.9, cost_usd: 0.5 }),
      run({ recall: 0.75, precision: 0.8, citation_accuracy: null, cost_usd: 0.25 }),
    );
    expect(d.recall).toBeCloseTo(0.25, 10);
    expect(d.precision).toBeNull();
    expect(d.citation_accuracy).toBeNull();
    expect(d.cost_usd).toBeCloseTo(-0.25, 10);
  });
  it('null cost on one side gives a null cost delta', () => {
    expect(metricDeltas(run({ cost_usd: null }), run({ cost_usd: 1 })).cost_usd).toBeNull();
  });
});
