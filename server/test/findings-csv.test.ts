import { describe, it, expect } from 'vitest';
import { findingsToCsv } from '../src/modules/reviews/helpers.js';
import type { ReviewDtoFinding } from '../src/modules/reviews/helpers.js';

function finding(over: Partial<ReviewDtoFinding> = {}): ReviewDtoFinding {
  return {
    id: 'f1',
    severity: 'WARNING',
    category: 'bug',
    title: 'Missing null check',
    file: 'src/index.ts',
    start_line: 10,
    end_line: 12,
    rationale: 'Could throw on a null input.',
    suggestion: null,
    confidence: 0.8,
    kind: 'finding',
    trifecta_components: null,
    evidence: null,
    review_id: 'r1',
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

describe('findingsToCsv', () => {
  it('renders the header and one row per finding', () => {
    const csv = findingsToCsv([finding()]);
    const lines = csv.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      'severity,category,title,file,start_line,end_line,confidence,rationale,suggestion,accepted_at,dismissed_at',
    );
    expect(lines[1]).toBe('WARNING,bug,Missing null check,src/index.ts,10,12,0.8,Could throw on a null input.,,,');
  });

  it('returns just the header for an empty list', () => {
    const csv = findingsToCsv([]);
    expect(csv).toBe(
      'severity,category,title,file,start_line,end_line,confidence,rationale,suggestion,accepted_at,dismissed_at\r\n',
    );
  });

  it('quotes a field containing a comma, quote, or newline, and doubles embedded quotes', () => {
    const csv = findingsToCsv([
      finding({
        title: 'Uses "any" here',
        rationale: 'Breaks on:\ncomma, and quotes.',
      }),
    ]);
    expect(csv).toContain('"Uses ""any"" here"');
    expect(csv).toContain('"Breaks on:\ncomma, and quotes."');
  });
});
