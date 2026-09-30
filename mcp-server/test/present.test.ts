import { describe, it, expect } from 'vitest';
import type { ReviewRecord } from '@devdigest/shared';
import { truncate, presentReview } from '../src/app/present.js';

// From the plan's Step 3 "Test first" (docs/homework-4/plan.md), skipped when present.ts was
// first written.
describe('truncate', () => {
  it('appends … only past the limit', () => {
    expect(truncate('abc', 3)).toBe('abc');
    expect(truncate('abcd', 3)).toBe('ab…');
  });
});

// Regression: the plan's Contracts say `ReviewOut.summary` is `string|null (≤300)`
// (docs/homework-4/plan.md, "Output schemas"), but present.ts:139 passes `review.summary`
// through uncut.
function review(overrides: Partial<ReviewRecord> & { id: string }): ReviewRecord {
  return {
    pr_id: 'pr-1',
    agent_id: 'agent-1',
    run_id: 'run-1',
    agent_name: 'Security Reviewer',
    kind: 'review',
    verdict: 'comment',
    summary: 'A summary.',
    score: 80,
    model: 'openai/gpt-4.1-mini',
    grounding: 'grounded',
    created_at: '2026-09-01T00:00:00.000Z',
    findings: [],
    ...overrides,
  };
}

describe('presentReview summary cap', () => {
  it('cuts a 2,000-char summary to at most 300 chars, ending with …', () => {
    const longSummary = 'S'.repeat(2000);
    const out = presentReview(review({ id: 'r1', summary: longSummary }), { format: 'concise', offset: 0 });

    expect(typeof out.summary).toBe('string');
    expect((out.summary as string).length).toBeLessThanOrEqual(300);
    expect((out.summary as string).endsWith('…')).toBe(true);
  });
});
