import { describe, it, expect } from 'vitest';
import { buildPerformance, toIso } from '../src/modules/agent-performance/helpers.js';
import type {
  FindingGroupRow,
  RawAggregate,
  RunGroupRow,
  WindowBounds,
  WorkspaceAgentRow,
} from '../src/modules/agent-performance/types.js';

const W: WindowBounds = {
  period: '1d',
  start: new Date('2026-10-14T12:00:00.000Z'),
  end: new Date('2026-10-15T12:00:00.000Z'),
  startInclusive: false,
  endInclusive: true,
};

function run(p: Partial<RunGroupRow> & { agentId: string | null }): RunGroupRow {
  return {
    model: 'm-1',
    status: 'done',
    runs: 1,
    costSum: null,
    priced: 0,
    durationSum: null,
    durationN: 0,
    lastRunAt: '2026-10-15T10:00:00.000Z',
    ...p,
  };
}

function fin(p: Partial<FindingGroupRow> & { agentId: string | null }): FindingGroupRow {
  return { model: 'm-1', severity: 'WARNING', accepted: 0, dismissed: 0, pending: 0, ...p };
}

function raw(runs: RunGroupRow[], findings: FindingGroupRow[] = []): RawAggregate {
  return { runs, findings, trend: [] };
}

const A: WorkspaceAgentRow = { id: 'a', name: 'Alpha' };
const B: WorkspaceAgentRow = { id: 'b', name: 'Bravo' };

describe('buildPerformance', () => {
  it('avg duration uses done runs with duration only', () => {
    const p = buildPerformance(
      [A],
      raw([
        run({ agentId: 'a', runs: 3, durationSum: 4000, durationN: 2 }),
        run({ agentId: 'a', status: 'failed', durationSum: 0, durationN: 1 }),
      ]),
      W,
    );
    expect(p.agents[0]!.avg_latency_ms).toBe(2000);
  });

  it('avg cost over priced done runs', () => {
    const p = buildPerformance(
      [A],
      raw([
        run({ agentId: 'a', runs: 3, costSum: 0.06, priced: 2 }),
        run({ agentId: 'a', status: 'failed', costSum: 0.5, priced: 1 }),
      ]),
      W,
    );
    const a = p.agents[0]!;
    expect(a.avg_cost_usd).toBeCloseTo(0.03, 12);
    expect(a.total_cost_usd).toBeCloseTo(0.56, 12);
    expect(a.unpriced_runs).toBe(1);
  });

  it('total cost null when nothing priced', () => {
    const p = buildPerformance([A], raw([run({ agentId: 'a', runs: 2 })]), W);
    expect(p.totals.total_cost_usd).toBeNull();
    expect(p.agents[0]!.total_cost_usd).toBeNull();
    expect(p.agents[0]!.avg_cost_usd).toBeNull();
    expect(p.cost_by_model[0]!.total_cost_usd).toBeNull();
  });

  it('accept rate pooled not averaged', () => {
    const p = buildPerformance(
      [A, B],
      raw(
        [run({ agentId: 'a' }), run({ agentId: 'b' })],
        [fin({ agentId: 'a', accepted: 9, dismissed: 1 }), fin({ agentId: 'b', dismissed: 2 })],
      ),
      W,
    );
    expect(p.totals.decisions).toBe(12);
    expect(p.totals.accept_rate).toBeCloseTo(0.75, 12);
    expect(p.agents.find((x) => x.agent_id === 'b')!.accept_rate).toBe(0);
  });

  it('small sample below 10', () => {
    const p = buildPerformance(
      [A, B],
      raw([run({ agentId: 'a' }), run({ agentId: 'b' })], [fin({ agentId: 'a', accepted: 9 }), fin({ agentId: 'b', accepted: 10 })]),
      W,
    );
    expect(p.small_sample_threshold).toBe(10);
    expect(p.agents.find((x) => x.agent_id === 'a')!.small_sample).toBe(true);
    expect(p.agents.find((x) => x.agent_id === 'b')!.small_sample).toBe(false);
    expect(buildPerformance([A], raw([]), W).totals.small_sample).toBe(true);
  });

  it('deleted bucket never most-active', () => {
    const p = buildPerformance([A], raw([run({ agentId: null, runs: 5 }), run({ agentId: 'a', runs: 1 })]), W);
    expect(p.deleted_agents!.runs).toBe(5);
    expect(p.most_active).toMatchObject({ agent_id: 'a', runs: 1 });
    expect(buildPerformance([A], raw([run({ agentId: null, runs: 5 })]), W).most_active).toBeNull();
  });

  it('most-active tie → latest last run → name', () => {
    const z: WorkspaceAgentRow = { id: 'z', name: 'Zulu' };
    const tieOnRuns = buildPerformance(
      [A, z],
      raw([
        run({ agentId: 'a', runs: 2, lastRunAt: '2026-10-15T09:00:00.000Z' }),
        run({ agentId: 'z', runs: 2, lastRunAt: '2026-10-15T11:00:00.000Z' }),
      ]),
      W,
    );
    expect(tieOnRuns.most_active!.agent_id).toBe('z');
    const tieOnLast = buildPerformance(
      [z, B],
      raw([run({ agentId: 'z', runs: 2 }), run({ agentId: 'b', runs: 2 })]),
      W,
    );
    expect(tieOnLast.most_active!.agent_id).toBe('b');
  });

  it('by-agent and by-model sums equal totals within 1e-9', () => {
    const p = buildPerformance(
      [A, B],
      raw([
        run({ agentId: 'a', model: 'm-1', costSum: 0.1, priced: 1 }),
        run({ agentId: 'b', model: 'm-2', costSum: 0.2, priced: 1, runs: 2 }),
        run({ agentId: null, model: null, costSum: 0.000123456789, priced: 1 }),
        run({ agentId: 'a', model: 'm-2', status: 'failed', costSum: 0.07, priced: 1 }),
      ]),
      W,
    );
    const total = p.totals.total_cost_usd!;
    const sum = (xs: { total_cost_usd: number | null }[]) => xs.reduce((s, x) => s + (x.total_cost_usd ?? 0), 0);
    expect(Math.abs(sum(p.cost_by_agent) - total)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(sum(p.cost_by_model) - total)).toBeLessThanOrEqual(1e-9);
    expect(p.cost_by_agent.reduce((s, x) => s + x.runs, 0)).toBe(p.totals.runs);
    expect(p.cost_by_model.reduce((s, x) => s + x.runs, 0)).toBe(p.totals.runs);
    expect(p.cost_by_agent.at(-1)).toMatchObject({ agent_id: null, agent_name: null });
  });

  it('Unknown model bucket has model null', () => {
    const p = buildPerformance(
      [A],
      raw([run({ agentId: 'a', model: null, runs: 2 }), run({ agentId: 'a', model: null, status: 'failed' })]),
      W,
    );
    expect(p.cost_by_model).toEqual([{ model: null, runs: 3, total_cost_usd: null }]);
    expect(p.agents[0]!.by_model.map((m) => [m.model, m.runs])).toEqual([[null, 3]]);
  });

  it('unknown agent id lands in deleted_agents', () => {
    const p = buildPerformance(
      [A],
      raw([run({ agentId: 'ghost', runs: 2 })], [fin({ agentId: 'ghost', accepted: 1 })]),
      W,
    );
    expect(p.agents.map((x) => x.agent_id)).toEqual(['a']);
    expect(p.deleted_agents).toMatchObject({ runs: 2, accepted: 1 });
    expect(p.totals.accepted).toBe(1);
  });

  it('unknown severity counted, not in findings_by_severity', () => {
    const p = buildPerformance(
      [A],
      raw([run({ agentId: 'a' })], [fin({ agentId: 'a', severity: 'NIT', accepted: 1, pending: 1 }), fin({ agentId: 'a', severity: 'CRITICAL', dismissed: 1 })]),
      W,
    );
    const a = p.agents[0]!;
    expect(a.findings_total).toBe(3);
    expect(a.decisions).toBe(2);
    expect(a.findings_by_severity).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
  });

  it('trend has one point per UTC day oldest→newest', () => {
    const p = buildPerformance([A], { runs: [run({ agentId: 'a', runs: 3 })], findings: [], trend: [{ agentId: 'a', day: '2026-10-15', runs: 3 }] }, W);
    expect(p.agents[0]!.trend).toEqual([
      { label: '2026-10-14', value: 0 },
      { label: '2026-10-15', value: 3 },
    ]);
    const custom: WindowBounds = {
      period: 'custom',
      start: new Date('2026-10-01T00:00:00.000Z'),
      end: new Date('2026-10-04T00:00:00.000Z'),
      startInclusive: true,
      endInclusive: false,
    };
    expect(buildPerformance([A], raw([]), custom).agents[0]!.trend.map((t) => t.label)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
  });

  it('window carries only period, start, end as ISO strings', () => {
    expect(buildPerformance([A], raw([]), W).window).toEqual({
      period: '1d',
      start: '2026-10-14T12:00:00.000Z',
      end: '2026-10-15T12:00:00.000Z',
    });
  });

  it('agents ordered by name A→Z, idle agents get null metrics', () => {
    const p = buildPerformance([B, A], raw([]), W);
    expect(p.agents.map((x) => x.agent_name)).toEqual(['Alpha', 'Bravo']);
    expect(p.agents[0]).toMatchObject({ runs: 0, last_run_at: null, accept_rate: null, avg_latency_ms: null });
    expect(p.deleted_agents).toBeNull();
  });
});

describe('toIso', () => {
  it('toIso normalises Date and string', () => {
    expect(toIso(new Date('2026-10-15T10:00:00.000Z'))).toBe('2026-10-15T10:00:00.000Z');
    expect(toIso('2026-10-15 10:00:00.123+00')).toBe('2026-10-15T10:00:00.123Z');
    expect(toIso(null)).toBeNull();
  });
});
