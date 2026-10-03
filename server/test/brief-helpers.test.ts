/**
 * PR Brief pure helpers (U2) — no I/O, no ports. Red-first: these name
 * `src/modules/brief/{schemas,constants,helpers}.ts`, which do not exist yet.
 *
 * Fixture used by most cases (changed ranges are whole hunk ranges):
 *   src/a.ts       PR file, ranges 10-14
 *   src/multi.ts   PR file, ranges 10-14 and 40-45
 *   src/wide.ts    PR file, range 20-40
 *   assets/logo.png PR file, no ranges (binary / no diff text)
 *   src/caller.ts  blast-only caller file, caller lines 45 then 23 (blast order)
 *   src/sym.ts     blast-only file via changed_symbols
 */
import { describe, it, expect } from 'vitest';
import { PrBrief, type BlastRadius, type Risk } from '@devdigest/shared';
import { PrBriefModelAnswer } from '../src/modules/brief/schemas.js';
import {
  BRIEF_SCHEMA_NAME,
  BRIEF_MAX_RISKS,
  BRIEF_MAX_FOCUS,
  BRIEF_TOKEN_BUDGET,
  BRIEF_DEADLINE_MS,
} from '../src/modules/brief/constants.js';
import {
  parseNewSideRanges,
  buildValidationContext,
  normalizeAnswer,
  computeMissingInputs,
} from '../src/modules/brief/helpers.js';

const BLAST: BlastRadius = {
  changed_symbols: [
    { name: 'limit', file: 'src/a.ts', kind: 'function' },
    { name: 'sym', file: 'src/sym.ts', kind: 'function' },
  ],
  downstream: [
    {
      symbol: 'limit',
      callers: [
        { name: 'routeA', file: 'src/caller.ts', line: 45 },
        { name: 'routeB', file: 'src/caller.ts', line: 23 },
      ],
      endpoints_affected: [],
      crons_affected: [],
    },
  ],
  summary: 'limit is called from one route file.',
};

const FILES = [
  { path: 'src/a.ts', ranges: [{ start: 10, end: 14 }] },
  {
    path: 'src/multi.ts',
    ranges: [
      { start: 10, end: 14 },
      { start: 40, end: 45 },
    ],
  },
  { path: 'src/wide.ts', ranges: [{ start: 20, end: 40 }] },
  { path: 'assets/logo.png', ranges: [] },
];

const ctx = () => buildValidationContext(FILES, BLAST);

type RawRisk = {
  kind: string;
  title: string;
  explanation: string;
  severity: 'high' | 'medium' | 'low';
  file_refs: string[];
  line_refs?: { file: string; start_line: number; end_line: number }[] | null;
};

function risk(over: Partial<RawRisk> = {}): RawRisk {
  return {
    kind: 'correctness',
    title: 'A risk',
    explanation: 'Because.',
    severity: 'medium',
    file_refs: ['src/a.ts'],
    ...over,
  };
}

function answer(over: Partial<{ summary: string; risks: RawRisk[]; review_focus: { file: string; line: number; reason: string }[] }> = {}) {
  return { summary: 'A summary.', risks: [] as RawRisk[], review_focus: [], ...over };
}

function lineRefsOf(r: Risk): { file: string; start_line: number; end_line: number }[] {
  return r.line_refs ?? [];
}

/** Wrap normalised output into a full stored brief to prove the strict contract accepts it. */
function asStoredBrief(n: ReturnType<typeof normalizeAnswer>) {
  return {
    summary: n.summary,
    intent: null,
    blast: null,
    risks: { risks: n.risks },
    review_focus: n.review_focus,
    history: null,
    head_sha: 'bbb',
    generated_at: '2026-10-03T10:00:00.000Z',
    model: 'openai/gpt-4.1-mini',
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    missing_inputs: [],
    truncated_inputs: [],
  };
}

describe('constants', () => {
  it('pins the schema name, caps, token budget and deadline', () => {
    expect(BRIEF_SCHEMA_NAME).toBe('PrBriefModelAnswer');
    expect(BRIEF_MAX_RISKS).toBe(5);
    expect(BRIEF_MAX_FOCUS).toBe(6);
    expect(BRIEF_TOKEN_BUDGET).toBe(8000);
    expect(BRIEF_DEADLINE_MS).toBe(60_000);
  });
});

describe('parseNewSideRanges (AC-11: numbers only)', () => {
  it('reads the new-side start and length of a hunk header: +10,5 -> 10-14', () => {
    expect(parseNewSideRanges('@@ -1,3 +10,5 @@\n context\n+added')).toEqual([{ start: 10, end: 14 }]);
  });

  it('clamps a zero-length hunk (deleted file, +0,0) to line 1', () => {
    expect(parseNewSideRanges('@@ -1,4 +0,0 @@\n-gone')).toEqual([{ start: 1, end: 1 }]);
  });

  it('clamps a zero-length hunk after line c to max(c, 1): +4,0 -> 4-4', () => {
    expect(parseNewSideRanges('@@ -5,2 +4,0 @@\n-gone')).toEqual([{ start: 4, end: 4 }]);
  });

  it('treats an omitted length as 1: +7 -> 7-7', () => {
    expect(parseNewSideRanges('@@ -3 +7 @@\n+one')).toEqual([{ start: 7, end: 7 }]);
  });

  it('returns one range per hunk, in patch order', () => {
    const patch = '@@ -1,2 +1,3 @@\n a\n+b\n c\n@@ -20,2 +40,6 @@\n x\n+y';
    expect(parseNewSideRanges(patch)).toEqual([
      { start: 1, end: 3 },
      { start: 40, end: 45 },
    ]);
  });

  it('returns [] for no patch, an empty patch or a patch with no hunk header', () => {
    expect(parseNewSideRanges(null)).toEqual([]);
    expect(parseNewSideRanges('')).toEqual([]);
    expect(parseNewSideRanges('Binary files a/x.png and b/x.png differ')).toEqual([]);
  });

  it('never returns text: the hunk-header trailing text and the body lines are dropped', () => {
    const patch = '@@ -1,2 +10,5 @@ function leakedName(secretArg) {\n+const SECRET_PATCH_TEXT = 1;\n context';
    const ranges = parseNewSideRanges(patch);
    expect(ranges).toEqual([{ start: 10, end: 14 }]);
    expect(JSON.stringify(ranges)).not.toContain('leakedName');
    expect(JSON.stringify(ranges)).not.toContain('SECRET_PATCH_TEXT');
    for (const r of ranges) {
      expect(Object.keys(r).sort()).toEqual(['end', 'start']);
      expect(typeof r.start).toBe('number');
      expect(typeof r.end).toBe('number');
    }
  });
});

describe('buildValidationContext', () => {
  it('keeps PR file ranges, lists caller lines ascending, and unions blast files', () => {
    const c = ctx();
    expect(c.prFiles.get('src/a.ts')).toEqual([{ start: 10, end: 14 }]);
    expect(c.prFiles.get('assets/logo.png')).toEqual([]);
    expect(c.callerLines.get('src/caller.ts')).toEqual([23, 45]);
    expect([...c.blastFiles].sort()).toEqual(['src/a.ts', 'src/caller.ts', 'src/sym.ts']);
  });

  it('with no blast map: no caller lines and no blast files', () => {
    const c = buildValidationContext(FILES, null);
    expect(c.callerLines.size).toBe(0);
    expect(c.blastFiles.size).toBe(0);
    expect(c.prFiles.has('src/a.ts')).toBe(true);
  });
});

describe('PrBriefModelAnswer vs stored PrBrief (AC-34, model-schema half)', () => {
  const sevenRisks = Array.from({ length: 7 }, (_, i) =>
    risk({
      title: `Risk ${i + 1}`,
      line_refs: i === 0 ? [{ file: 'src/other.ts', start_line: 9, end_line: 3 }] : null,
    }),
  );
  const payload = {
    summary: 's'.repeat(5000),
    risks: sevenRisks,
    review_focus: Array.from({ length: 9 }, () => ({ file: 'src/a.ts', line: 12, reason: 'r'.repeat(900) })),
  };

  it('accepts 7 risks, an inverted line ref, a foreign line_refs file, null line_refs and over-long text', () => {
    expect(PrBriefModelAnswer.safeParse(payload).success).toBe(true);
  });

  it('rejects the same payload as a stored PrBrief', () => {
    const stored = {
      ...asStoredBrief({ summary: payload.summary, risks: payload.risks as unknown as Risk[], review_focus: payload.review_focus, droppedRisks: 0, droppedFocus: 0 }),
    };
    expect(PrBrief.safeParse(stored).success).toBe(false);
  });

  it('accepts a risk with line_refs missing or null', () => {
    const r = PrBriefModelAnswer.safeParse(answer({ risks: [risk(), risk({ line_refs: null })] }));
    expect(r.success).toBe(true);
  });

  it('rejects garbage that is not an answer ({} has no summary, risks or review_focus)', () => {
    expect(PrBriefModelAnswer.safeParse({}).success).toBe(false);
  });
});

describe('normalizeAnswer — risk file refs (AC-20)', () => {
  it('keeps the file refs that are in the PR or the blast map and drops the rest', () => {
    const n = normalizeAnswer(
      answer({ risks: [risk({ file_refs: ['src/ghost.ts', 'src/a.ts', 'src/caller.ts'] })] }),
      ctx(),
    );
    expect(n.risks).toHaveLength(1);
    expect(n.risks[0]!.file_refs).toEqual(['src/a.ts', 'src/caller.ts']);
    expect(n.droppedRisks).toBe(0);
  });

  it('drops a risk none of whose file refs survive, and counts it', () => {
    const n = normalizeAnswer(
      answer({ risks: [risk({ title: 'ghost', file_refs: ['src/ghost.ts', 'src/ghost2.ts'] }), risk({ title: 'real' })] }),
      ctx(),
    );
    expect(n.risks.map((r) => r.title)).toEqual(['real']);
    expect(n.droppedRisks).toBe(1);
  });

  it('a risk with no file refs at all is dropped', () => {
    const n = normalizeAnswer(answer({ risks: [risk({ file_refs: [] })] }), ctx());
    expect(n.risks).toEqual([]);
    expect(n.droppedRisks).toBe(1);
  });

  it('keeps the model order of the surviving risks', () => {
    const n = normalizeAnswer(
      answer({ risks: [risk({ title: 'first', severity: 'low' }), risk({ title: 'second', severity: 'high' })] }),
      ctx(),
    );
    expect(n.risks.map((r) => r.title)).toEqual(['first', 'second']);
  });
});

describe('normalizeAnswer — review focus line snapping (AC-21)', () => {
  const focus = (file: string, line: number) =>
    normalizeAnswer(answer({ review_focus: [{ file, line, reason: 'why' }] }), ctx()).review_focus[0];

  it('PR file: a line inside a changed range is kept (first, middle and last line of a range)', () => {
    expect(focus('src/a.ts', 10)!.line).toBe(10);
    expect(focus('src/a.ts', 12)!.line).toBe(12);
    expect(focus('src/a.ts', 14)!.line).toBe(14);
  });

  it('PR file with two ranges: a line in the second range is kept', () => {
    expect(focus('src/multi.ts', 42)!.line).toBe(42);
  });

  it('PR file: a line outside every range becomes the first changed line of the file', () => {
    expect(focus('src/a.ts', 99)!.line).toBe(10);
    expect(focus('src/a.ts', 15)!.line).toBe(10);
    expect(focus('src/a.ts', 9)!.line).toBe(10);
    expect(focus('src/multi.ts', 30)!.line).toBe(10);
  });

  it('PR file with no changed ranges (no diff text or binary): line 1', () => {
    expect(focus('assets/logo.png', 57)!.line).toBe(1);
    expect(focus('assets/logo.png', 1)!.line).toBe(1);
  });

  it('blast-only file: a caller line is kept, anything else becomes the first (lowest) caller line', () => {
    expect(focus('src/caller.ts', 45)!.line).toBe(45);
    expect(focus('src/caller.ts', 23)!.line).toBe(23);
    expect(focus('src/caller.ts', 30)!.line).toBe(23);
    expect(focus('src/caller.ts', 1)!.line).toBe(23);
  });

  it('keeps file and reason unchanged while snapping only the line', () => {
    expect(focus('src/a.ts', 99)).toEqual({ file: 'src/a.ts', line: 10, reason: 'why' });
  });

  it('drops a focus item whose file is in neither the PR nor the blast map, and counts it', () => {
    const n = normalizeAnswer(
      answer({
        review_focus: [
          { file: 'src/ghost.ts', line: 3, reason: 'ghost' },
          { file: 'src/a.ts', line: 12, reason: 'real' },
        ],
      }),
      ctx(),
    );
    expect(n.review_focus).toEqual([{ file: 'src/a.ts', line: 12, reason: 'real' }]);
    expect(n.droppedFocus).toBe(1);
  });

  it('file in both the PR and the blast: a PR range line and a caller line are both accepted', () => {
    const both = buildValidationContext(
      [{ path: 'src/a.ts', ranges: [{ start: 10, end: 14 }] }],
      {
        changed_symbols: [{ name: 'limit', file: 'src/a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'limit',
            callers: [{ name: 'self', file: 'src/a.ts', line: 90 }],
            endpoints_affected: [],
            crons_affected: [],
          },
        ],
        summary: 's',
      },
    );
    const run = (line: number) =>
      normalizeAnswer(answer({ review_focus: [{ file: 'src/a.ts', line, reason: 'r' }] }), both).review_focus[0]!.line;
    expect(run(12)).toBe(12);
    expect(run(90)).toBe(90);
    expect(run(50)).toBe(10);
  });
});

describe('normalizeAnswer — risk line refs (AC-21a)', () => {
  const ref = (file: string, start_line: number, end_line: number, fileRefs = [file]) =>
    lineRefsOf(
      normalizeAnswer(answer({ risks: [risk({ file_refs: fileRefs, line_refs: [{ file, start_line, end_line }] })] }), ctx())
        .risks[0]!,
    );

  it('PR file: start inside a range is kept and the end is cut to the end of the range (12-30 -> 12-14)', () => {
    expect(ref('src/a.ts', 12, 30)).toEqual([{ file: 'src/a.ts', start_line: 12, end_line: 14 }]);
  });

  it('PR file: a range fully inside the changed range is kept as given (11-13)', () => {
    expect(ref('src/a.ts', 11, 13)).toEqual([{ file: 'src/a.ts', start_line: 11, end_line: 13 }]);
  });

  it('PR file: start outside every range is replaced by the first changed range (99-120 -> 10-14)', () => {
    expect(ref('src/a.ts', 99, 120)).toEqual([{ file: 'src/a.ts', start_line: 10, end_line: 14 }]);
  });

  it('PR file: an end below the start is set equal to the start (13-11 -> 13-13)', () => {
    expect(ref('src/a.ts', 13, 11)).toEqual([{ file: 'src/a.ts', start_line: 13, end_line: 13 }]);
  });

  it('XR-6: start 30, end 25 inside range 20-40 -> 30-30', () => {
    expect(ref('src/wide.ts', 30, 25)).toEqual([{ file: 'src/wide.ts', start_line: 30, end_line: 30 }]);
  });

  it('PR file with no ranges: start and end 1', () => {
    expect(ref('assets/logo.png', 7, 9)).toEqual([{ file: 'assets/logo.png', start_line: 1, end_line: 1 }]);
  });

  it('blast-only file: a caller start line is kept with the end set equal to the start (45-60 -> 45-45)', () => {
    expect(ref('src/caller.ts', 45, 60)).toEqual([{ file: 'src/caller.ts', start_line: 45, end_line: 45 }]);
  });

  it('blast-only file: a non-caller start line is replaced by the first caller line (1-5 -> 23-23)', () => {
    expect(ref('src/caller.ts', 1, 5)).toEqual([{ file: 'src/caller.ts', start_line: 23, end_line: 23 }]);
  });

  it('a line ref whose file is not among the risk surviving file refs is dropped', () => {
    const refs = lineRefsOf(
      normalizeAnswer(
        answer({
          risks: [
            risk({
              file_refs: ['src/a.ts'],
              line_refs: [
                { file: 'src/a.ts', start_line: 12, end_line: 13 },
                { file: 'src/wide.ts', start_line: 30, end_line: 31 },
              ],
            }),
          ],
        }),
        ctx(),
      ).risks[0]!,
    );
    expect(refs).toEqual([{ file: 'src/a.ts', start_line: 12, end_line: 13 }]);
  });

  it('a line ref on a ghost file ref is dropped with the file ref, the risk survives on its other file', () => {
    const n = normalizeAnswer(
      answer({
        risks: [
          risk({
            file_refs: ['src/ghost.ts', 'src/a.ts'],
            line_refs: [{ file: 'src/ghost.ts', start_line: 3, end_line: 4 }],
          }),
        ],
      }),
      ctx(),
    );
    expect(n.risks).toHaveLength(1);
    expect(n.risks[0]!.file_refs).toEqual(['src/a.ts']);
    expect(lineRefsOf(n.risks[0]!)).toEqual([]);
  });

  it('a risk whose line refs all drop is kept with its file refs and no line refs', () => {
    const n = normalizeAnswer(
      answer({
        risks: [
          risk({
            file_refs: ['src/a.ts'],
            line_refs: [{ file: 'src/wide.ts', start_line: 30, end_line: 31 }],
          }),
        ],
      }),
      ctx(),
    );
    expect(n.risks).toHaveLength(1);
    expect(n.risks[0]!.file_refs).toEqual(['src/a.ts']);
    expect(lineRefsOf(n.risks[0]!)).toEqual([]);
  });

  it('null line_refs from the model yield a risk without line refs', () => {
    const n = normalizeAnswer(answer({ risks: [risk({ line_refs: null })] }), ctx());
    expect(lineRefsOf(n.risks[0]!)).toEqual([]);
  });
});

describe('normalizeAnswer — caps and order (AC-22)', () => {
  it('7 risks and 8 focus items -> the first 5 and the first 6, in order, with the dropped counts', () => {
    const n = normalizeAnswer(
      answer({
        risks: Array.from({ length: 7 }, (_, i) => risk({ title: `r${i + 1}` })),
        review_focus: Array.from({ length: 8 }, (_, i) => ({ file: 'src/a.ts', line: 10 + (i % 5), reason: `f${i + 1}` })),
      }),
      ctx(),
    );
    expect(BRIEF_MAX_RISKS).toBe(5);
    expect(BRIEF_MAX_FOCUS).toBe(6);
    expect(n.risks.map((r) => r.title)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(n.review_focus.map((f) => f.reason)).toEqual(['f1', 'f2', 'f3', 'f4', 'f5', 'f6']);
    expect(n.droppedRisks).toBe(2);
    expect(n.droppedFocus).toBe(2);
  });

  it('exactly 5 risks and 6 focus items are all kept (boundary)', () => {
    const n = normalizeAnswer(
      answer({
        risks: Array.from({ length: 5 }, (_, i) => risk({ title: `r${i + 1}` })),
        review_focus: Array.from({ length: 6 }, (_, i) => ({ file: 'src/a.ts', line: 11, reason: `f${i + 1}` })),
      }),
      ctx(),
    );
    expect(n.risks).toHaveLength(5);
    expect(n.review_focus).toHaveLength(6);
    expect(n.droppedRisks).toBe(0);
    expect(n.droppedFocus).toBe(0);
  });

  it('XR-10: 7 risks, the 2nd on a ghost file -> ghost dropped first, then the caps keep risks 1,3,4,5,6', () => {
    const n = normalizeAnswer(
      answer({
        risks: [
          risk({ title: 'r1' }),
          risk({ title: 'r2-ghost', file_refs: ['src/ghost.ts'] }),
          risk({ title: 'r3' }),
          risk({ title: 'r4' }),
          risk({ title: 'r5' }),
          risk({ title: 'r6' }),
          risk({ title: 'r7' }),
        ],
      }),
      ctx(),
    );
    expect(n.risks.map((r) => r.title)).toEqual(['r1', 'r3', 'r4', 'r5', 'r6']);
    expect(n.droppedRisks).toBe(2);
  });

  it('XR-10 for focus: 8 items, the 2nd on a ghost file -> items 1,3,4,5,6,7 survive', () => {
    const n = normalizeAnswer(
      answer({
        review_focus: Array.from({ length: 8 }, (_, i) => ({
          file: i === 1 ? 'src/ghost.ts' : 'src/a.ts',
          line: 12,
          reason: `f${i + 1}`,
        })),
      }),
      ctx(),
    );
    expect(n.review_focus.map((f) => f.reason)).toEqual(['f1', 'f3', 'f4', 'f5', 'f6', 'f7']);
    expect(n.droppedFocus).toBe(2);
  });
});

describe('normalizeAnswer — text cuts (AC-22a)', () => {
  it('cuts summary to 1200, risk title to 160, explanation to 800 and focus reason to 300 without rejecting', () => {
    const n = normalizeAnswer(
      answer({
        summary: 's'.repeat(1500),
        risks: [risk({ title: 't'.repeat(200), explanation: 'e'.repeat(900) })],
        review_focus: [{ file: 'src/a.ts', line: 12, reason: 'r'.repeat(400) }],
      }),
      ctx(),
    );
    expect(n.summary).toBe('s'.repeat(1200));
    expect(n.risks[0]!.title).toBe('t'.repeat(160));
    expect(n.risks[0]!.explanation).toBe('e'.repeat(800));
    expect(n.review_focus[0]!.reason).toBe('r'.repeat(300));
  });

  it('text exactly at the limit is left alone (boundary)', () => {
    const n = normalizeAnswer(
      answer({
        summary: 's'.repeat(1200),
        risks: [risk({ title: 't'.repeat(160), explanation: 'e'.repeat(800) })],
        review_focus: [{ file: 'src/a.ts', line: 12, reason: 'r'.repeat(300) }],
      }),
      ctx(),
    );
    expect(n.summary).toHaveLength(1200);
    expect(n.risks[0]!.title).toHaveLength(160);
    expect(n.risks[0]!.explanation).toHaveLength(800);
    expect(n.review_focus[0]!.reason).toHaveLength(300);
  });

  it('short text passes through unchanged', () => {
    const n = normalizeAnswer(answer({ summary: 'Short.', risks: [risk({ title: 'T', explanation: 'E' })] }), ctx());
    expect(n.summary).toBe('Short.');
    expect(n.risks[0]!.title).toBe('T');
    expect(n.risks[0]!.explanation).toBe('E');
  });
});

describe('normalizeAnswer output is a valid stored brief', () => {
  it('AC-30: an answer with an empty risks list normalises to a valid PrBrief', () => {
    const n = normalizeAnswer(answer({ risks: [] }), ctx());
    expect(n.risks).toEqual([]);
    expect(n.droppedRisks).toBe(0);
    expect(PrBrief.safeParse(asStoredBrief(n)).success).toBe(true);
  });

  it('the worst-case answer (ghosts, inverted refs, over-long text, over the caps) still parses as the strict PrBrief', () => {
    const n = normalizeAnswer(
      answer({
        summary: 's'.repeat(3000),
        risks: [
          ...Array.from({ length: 7 }, (_, i) =>
            risk({
              title: 't'.repeat(300),
              explanation: 'e'.repeat(2000),
              file_refs: i === 1 ? ['src/ghost.ts'] : ['src/a.ts', 'src/caller.ts'],
              line_refs: [
                { file: 'src/a.ts', start_line: 99, end_line: 5 },
                { file: 'src/caller.ts', start_line: 1, end_line: 2 },
                { file: 'src/ghost.ts', start_line: 1, end_line: 2 },
              ],
            }),
          ),
        ],
        review_focus: Array.from({ length: 9 }, (_, i) => ({
          file: i === 0 ? 'src/ghost.ts' : 'src/caller.ts',
          line: 1000,
          reason: 'r'.repeat(999),
        })),
      }),
      ctx(),
    );
    const parsed = PrBrief.safeParse(asStoredBrief(n));
    expect(parsed.success).toBe(true);
    expect(n.risks).toHaveLength(5);
    expect(n.review_focus).toHaveLength(6);
  });
});

describe('computeMissingInputs (AC-28 and the missing-input lists)', () => {
  const full = {
    intent: { intent: 'x' } as unknown,
    blast: BLAST,
    issueFound: true,
    specsRead: 2,
    description: 'A real description.',
  };

  it('nothing missing -> []', () => {
    expect(computeMissingInputs(full)).toEqual([]);
  });

  it('AC-28: an empty description lists pr_description (empty string and null)', () => {
    expect(computeMissingInputs({ ...full, description: '' })).toEqual(['pr_description']);
    expect(computeMissingInputs({ ...full, description: null })).toEqual(['pr_description']);
  });

  it('no stored intent lists intent', () => {
    expect(computeMissingInputs({ ...full, intent: null })).toEqual(['intent']);
  });

  it('a null blast map lists blast', () => {
    expect(computeMissingInputs({ ...full, blast: null })).toEqual(['blast']);
  });

  it('a degraded blast map lists blast even though a snapshot exists; degraded false does not', () => {
    expect(computeMissingInputs({ ...full, blast: { ...BLAST, degraded: true, reason: 'index_partial' } })).toEqual(['blast']);
    expect(computeMissingInputs({ ...full, blast: { ...BLAST, degraded: false } })).toEqual([]);
  });

  it('no linked issue found lists issue', () => {
    expect(computeMissingInputs({ ...full, issueFound: false })).toEqual(['issue']);
  });

  it('no doc read lists specs; one doc read does not', () => {
    expect(computeMissingInputs({ ...full, specsRead: 0 })).toEqual(['specs']);
    expect(computeMissingInputs({ ...full, specsRead: 1 })).toEqual([]);
  });

  it('AC-29: every input except the file list missing lists all five kinds', () => {
    const missing = computeMissingInputs({ intent: null, blast: null, issueFound: false, specsRead: 0, description: null });
    expect([...missing].sort()).toEqual(['blast', 'intent', 'issue', 'pr_description', 'specs']);
  });
});
