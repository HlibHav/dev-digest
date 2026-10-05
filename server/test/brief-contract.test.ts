import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PrBrief, PrBriefResult, PrBriefResponse, PrBriefGenerateResponse } from '../src/vendor/shared/contracts/brief.js';
import { FEATURE_MODELS } from '../src/vendor/shared/contracts/platform.js';

const BASE = {
  summary: 'Adds a limiter.',
  intent: { intent: 'Add limiter', in_scope: ['api'], out_of_scope: [] },
  blast: { changed_symbols: [], downstream: [], summary: 'none' },
  risks: {
    risks: [
      { kind: 'logic', title: 'Race', explanation: 'May race.', severity: 'high' as const, file_refs: ['a.ts', 'b.ts'] },
    ],
  },
  review_focus: [{ file: 'a.ts', line: 3, reason: 'core change' }],
  history: { history: [] },
  head_sha: 'abc1234',
  generated_at: '2026-10-03T00:00:00.000Z',
  model: 'openai/gpt-4.1-mini',
  tokens_in: 10,
  tokens_out: 5,
  cost_usd: 0.001,
  missing_inputs: [],
  truncated_inputs: [],
};

const risk = (over: Record<string, unknown> = {}) => ({
  kind: 'logic',
  title: 't',
  explanation: 'e',
  severity: 'low' as const,
  file_refs: ['a.ts'],
  ...over,
});
const withRisks = (risks: unknown[]) => ({ ...BASE, risks: { risks } });

describe('PrBrief contract (server copy)', () => {
  it('parses a full brief and a brief with null intent, blast, history', () => {
    expect(PrBrief.safeParse(BASE).success).toBe(true);
    expect(PrBrief.safeParse({ ...BASE, intent: null, blast: null, history: null, cost_usd: null }).success).toBe(true);
  });

  it('parses a risk with and without line_refs', () => {
    expect(PrBrief.safeParse(withRisks([risk()])).success).toBe(true);
    const lr = [{ file: 'a.ts', start_line: 2, end_line: 4 }];
    expect(PrBrief.safeParse(withRisks([risk({ line_refs: lr })])).success).toBe(true);
  });

  it('stored PrBrief rejects 6 risks', () => {
    expect(PrBrief.safeParse(withRisks(Array.from({ length: 6 }, () => risk()))).success).toBe(false);
  });

  it('stored PrBrief rejects an end_line below start_line', () => {
    const lr = [{ file: 'a.ts', start_line: 5, end_line: 4 }];
    expect(PrBrief.safeParse(withRisks([risk({ line_refs: lr })])).success).toBe(false);
  });

  it('stored PrBrief rejects a line_refs file outside file_refs', () => {
    const lr = [{ file: 'zzz.ts', start_line: 1, end_line: 2 }];
    expect(PrBrief.safeParse(withRisks([risk({ line_refs: lr })])).success).toBe(false);
  });

  it('stored PrBrief rejects a 1201-char summary and a risk with empty file_refs', () => {
    expect(PrBrief.safeParse({ ...BASE, summary: 'x'.repeat(1201) }).success).toBe(false);
    expect(PrBrief.safeParse(withRisks([risk({ file_refs: [] })])).success).toBe(false);
  });

  it('PrBriefResult adds stale and keeps the cross-checks; responses wrap it', () => {
    expect(PrBriefResult.safeParse({ ...BASE, stale: false }).success).toBe(true);
    expect(PrBriefResult.safeParse(BASE).success).toBe(false);
    expect(PrBriefResponse.safeParse({ brief: null }).success).toBe(true);
    expect(PrBriefGenerateResponse.safeParse({ brief: null }).success).toBe(false);
    expect(PrBriefGenerateResponse.safeParse({ brief: { ...BASE, stale: true } }).success).toBe(true);
  });

  it('copies are text-identical for the PrBrief/Risk section', () => {
    const marker = '// ---- Risks ----';
    const tail = (p: string) => {
      const src = readFileSync(new URL(p, import.meta.url), 'utf8');
      return src.slice(src.indexOf(marker));
    };
    const server = tail('../src/vendor/shared/contracts/brief.ts');
    const client = tail('../../client/src/vendor/shared/contracts/brief.ts');
    expect(server.length).toBeGreaterThan(0);
    expect(client).toBe(server);
  });
});

describe('risk_brief registry default (AC-7)', () => {
  it('server FEATURE_MODELS risk_brief is openrouter/openai/gpt-4.1-mini', () => {
    const f = FEATURE_MODELS.find((x) => x.id === 'risk_brief');
    expect([f?.defaultProvider, f?.defaultModel]).toEqual(['openrouter', 'openai/gpt-4.1-mini']);
  });

  it('client platform.ts copy declares the same (fs read of the risk_brief block)', () => {
    const src = readFileSync(new URL('../../client/src/vendor/shared/contracts/platform.ts', import.meta.url), 'utf8');
    const block = src.slice(src.indexOf("id: 'risk_brief'"));
    const end = block.indexOf('},');
    const b = block.slice(0, end);
    expect(b).toContain("defaultProvider: 'openrouter'");
    expect(b).toContain("defaultModel: 'openai/gpt-4.1-mini'");
  });
});
