/**
 * PR-list COST (`modules/pulls/cost.ts`) — the pure rollup that turns a PR's
 * completed runs into the cost of its latest review request (one batch = the
 * runs created by one POST /pulls/:id/review).
 */
import { describe, it, expect } from 'vitest';
import { latestBatchCostByPr } from '../src/modules/pulls/cost.js';

describe('latestBatchCostByPr', () => {
  it('sums the runs of the latest batch and ignores older batches', () => {
    const costs = latestBatchCostByPr([
      { prId: 'pr1', batchId: 'b2', costUsd: 0.0013 },
      { prId: 'pr1', batchId: 'b2', costUsd: 0.0014 },
      { prId: 'pr1', batchId: 'b1', costUsd: 0.5 },
    ]);
    expect(costs.get('pr1')).toBeCloseTo(0.0027, 10);
  });

  it('keeps PRs apart', () => {
    const costs = latestBatchCostByPr([
      { prId: 'pr1', batchId: 'b1', costUsd: 0.01 },
      { prId: 'pr2', batchId: 'b9', costUsd: 0.02 },
      { prId: 'pr1', batchId: 'b1', costUsd: 0.03 },
    ]);
    expect(costs.get('pr1')).toBeCloseTo(0.04, 10);
    expect(costs.get('pr2')).toBeCloseTo(0.02, 10);
  });

  it('skips unpriced runs inside the batch', () => {
    const costs = latestBatchCostByPr([
      { prId: 'pr1', batchId: 'b1', costUsd: null },
      { prId: 'pr1', batchId: 'b1', costUsd: 0.003 },
    ]);
    expect(costs.get('pr1')).toBeCloseTo(0.003, 10);
  });

  it('is null when no run of the latest batch is priced', () => {
    const costs = latestBatchCostByPr([
      { prId: 'pr1', batchId: 'b2', costUsd: null },
      { prId: 'pr1', batchId: 'b1', costUsd: 0.5 },
    ]);
    expect(costs.has('pr1')).toBe(true);
    expect(costs.get('pr1')).toBeNull();
  });

  it('treats a legacy run without a batch as a batch of its own', () => {
    const costs = latestBatchCostByPr([
      { prId: 'pr1', batchId: null, costUsd: null },
      { prId: 'pr1', batchId: null, costUsd: 0.5 },
    ]);
    expect(costs.get('pr1')).toBeNull();
  });

  it('keeps a real zero cost as data, not as missing', () => {
    const costs = latestBatchCostByPr([{ prId: 'pr1', batchId: 'b1', costUsd: 0 }]);
    expect(costs.get('pr1')).toBe(0);
  });

  it('has no entry for a PR without completed runs', () => {
    expect(latestBatchCostByPr([]).has('pr1')).toBe(false);
  });
});
