import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { buildSmartDiff, latestReviewPerAgent } from '../src/modules/smart-diff/service.js';

describe('buildSmartDiff', () => {
  const files = [
    { path: 'pnpm-lock.yaml', additions: 0, deletions: 200 },
    { path: 'server/src/modules/x/service.ts', additions: 10, deletions: 2 },
    { path: 'server/test/x.test.ts', additions: 5, deletions: 0 },
    { path: 'server/src/modules/x/index.ts', additions: 1, deletions: 1 },
    { path: 'docs/x.md', additions: 3, deletions: 0 },
  ];

  it('groups files by role in display order (core, tests, wiring, docs, boilerplate)', () => {
    const result = buildSmartDiff(files, []);
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
  });

  it('omits empty groups', () => {
    const result = buildSmartDiff(
      [{ path: 'server/src/modules/x/service.ts', additions: 1, deletions: 0 }],
      [],
    );
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.role).toBe('core');
  });

  it('classifies a lock file as boilerplate', () => {
    const result = buildSmartDiff(files, []);
    const boilerplate = result.groups.find((g) => g.role === 'boilerplate');
    expect(boilerplate?.files.map((f) => f.path)).toEqual(['pnpm-lock.yaml']);
  });

  it('finding_lines are the file\'s findings\' start_lines, sorted and deduplicated', () => {
    const result = buildSmartDiff(files, [
      { file: 'server/src/modules/x/service.ts', start_line: 11 },
      { file: 'server/src/modules/x/service.ts', start_line: 3 },
      { file: 'server/src/modules/x/service.ts', start_line: 11 },
      { file: 'docs/x.md', start_line: 1 },
    ]);
    const core = result.groups.find((g) => g.role === 'core');
    expect(core?.files[0]!.finding_lines).toEqual([3, 11]);
    const docs = result.groups.find((g) => g.role === 'docs');
    expect(docs?.files[0]!.finding_lines).toEqual([1]);
    const wiring = result.groups.find((g) => g.role === 'wiring');
    expect(wiring?.files[0]!.finding_lines).toEqual([]);
  });

  it('total_lines is the sum of additions + deletions across all files', () => {
    const result = buildSmartDiff(files, []);
    // 0+200 + 10+2 + 5+0 + 1+1 + 3+0 = 222
    expect(result.split_suggestion.total_lines).toBe(222);
    expect(result.split_suggestion.too_big).toBe(false);
    expect(result.split_suggestion.proposed_splits).toEqual([]);
  });

  it('SmartDiff.parse succeeds on the built result', () => {
    expect(() => SmartDiff.parse(buildSmartDiff(files, []))).not.toThrow();
  });
});

describe('latestReviewPerAgent', () => {
  it('keeps only the newest review per agentId (rows are newest-first)', () => {
    const rows = [
      { review: { agentId: 'a1' }, findings: [{ file: 'x.ts', startLine: 1 }] },
      { review: { agentId: 'a1' }, findings: [{ file: 'x.ts', startLine: 99 }] },
    ];
    expect(latestReviewPerAgent(rows)).toEqual([{ file: 'x.ts', startLine: 1 }]);
  });

  it('treats a null agentId as its own key (still counted once)', () => {
    const rows = [
      { review: { agentId: null }, findings: [{ file: 'a.ts', startLine: 1 }] },
      { review: { agentId: 'a1' }, findings: [{ file: 'b.ts', startLine: 2 }] },
      { review: { agentId: null }, findings: [{ file: 'a.ts', startLine: 999 }] },
    ];
    expect(latestReviewPerAgent(rows)).toEqual([
      { file: 'a.ts', startLine: 1 },
      { file: 'b.ts', startLine: 2 },
    ]);
  });
});
