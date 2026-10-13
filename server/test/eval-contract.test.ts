import { describe, it, expect } from 'vitest';
import { EvalExpectedOutput } from '../src/vendor/shared/contracts/eval-pipeline.js';

const GOOD = { type: 'must_find', file: 'src/a.ts', start_line: 3, end_line: 5 };

describe('AC-1 expectation shape', () => {
  it('both types and an empty list parse; missing type, missing file or start_line > end_line fail with a field path', () => {
    expect(EvalExpectedOutput.safeParse([]).success).toBe(true);
    expect(EvalExpectedOutput.safeParse([GOOD]).success).toBe(true);
    expect(EvalExpectedOutput.safeParse([{ ...GOOD, type: 'must_not_flag' }]).success).toBe(true);

    const noType = EvalExpectedOutput.safeParse([{ file: 'a.ts', start_line: 1, end_line: 1 }]);
    expect(noType.success).toBe(false);
    if (!noType.success) expect(noType.error.issues[0]!.path).toEqual([0, 'type']);

    const noFile = EvalExpectedOutput.safeParse([{ type: 'must_find', start_line: 1, end_line: 1 }]);
    expect(noFile.success).toBe(false);
    if (!noFile.success) expect(noFile.error.issues[0]!.path).toEqual([0, 'file']);

    const reversed = EvalExpectedOutput.safeParse([{ ...GOOD, start_line: 9, end_line: 2 }]);
    expect(reversed.success).toBe(false);
    if (!reversed.success) expect(reversed.error.issues[0]!.path).toEqual([0, 'end_line']);
  });

  it('strips unknown keys', () => {
    const r = EvalExpectedOutput.parse([{ ...GOOD, extra: 'x' }]);
    expect(r[0]).not.toHaveProperty('extra');
  });
});
