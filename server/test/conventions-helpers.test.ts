/* Pure-helper tests for convention extraction. No database, no container, no
   model: these cover the two rules the feature stands on — samples are chosen
   by code, and a candidate survives only if its evidence is found in real code. */
import { describe, it, expect } from 'vitest';
import {
  buildSkillBody,
  findSnippetLine,
  matchSample,
  normalizeRule,
  pickConfigPaths,
  renderSamples,
  ruleHash,
  truncateSample,
  verifyCandidates,
  type ConventionRow,
  type RawCandidate,
  type SampleFile,
} from '../src/modules/conventions/helpers.js';
import { SAMPLE_MAX_LINES } from '../src/modules/conventions/constants.js';

const SAMPLES: SampleFile[] = [
  {
    path: 'server/src/modules/skills/service.ts',
    content: [
      "import type { Skill } from '@devdigest/shared';",
      '',
      'export class SkillsService {',
      '  constructor(private repo: SkillsRepository) {}',
      '}',
    ].join('\n'),
  },
  { path: 'tsconfig.json', content: '{\n  "strict": true\n}' },
];

function raw(over: Partial<RawCandidate> = {}): RawCandidate {
  return {
    category: 'architecture',
    rule: 'A service takes the ports it calls, not the container.',
    evidence: {
      path: 'server/src/modules/skills/service.ts',
      line: 4,
      snippet: 'constructor(private repo: SkillsRepository) {}',
    },
    confidence: 0.8,
    ...over,
  };
}

describe('sampling (no model involved)', () => {
  it('keeps only config files the repo actually has, in declared order', () => {
    const picked = pickConfigPaths(['README.md', 'tsconfig.json', '.prettierrc', 'src/a.ts']);
    expect(picked).toEqual(['tsconfig.json', '.prettierrc']);
  });

  it('ignores a config-looking path that is not at the repo root', () => {
    expect(pickConfigPaths(['packages/web/tsconfig.json'])).toEqual([]);
  });

  it('caps a sampled file by line count', () => {
    const long = Array.from({ length: SAMPLE_MAX_LINES + 50 }, (_, i) => `line ${i}`).join('\n');
    expect(truncateSample(long).split('\n')).toHaveLength(SAMPLE_MAX_LINES);
  });

  it('numbers lines so a cited line can be checked', () => {
    expect(renderSamples([{ path: 'a.ts', content: 'const a = 1;\nconst b = 2;' }])).toBe(
      '--- a.ts ---\n1: const a = 1;\n2: const b = 2;',
    );
  });
});

describe('rule hashing', () => {
  it('ignores case and whitespace so a re-scan recognises the same rule', () => {
    expect(normalizeRule('  Use   ZOD  at the edge ')).toBe('use zod at the edge');
    expect(ruleHash('Use zod at the edge')).toBe(ruleHash('  use   ZOD at the edge  '));
  });

  it('separates genuinely different rules', () => {
    expect(ruleHash('Use zod at the edge')).not.toBe(ruleHash('Use zod in the service'));
  });
});

describe('evidence verification', () => {
  it('keeps a candidate whose snippet is in the cited file', () => {
    const [kept] = verifyCandidates([raw()], SAMPLES);
    expect(kept?.evidencePath).toBe('server/src/modules/skills/service.ts');
    expect(kept?.evidenceLine).toBe(4);
  });

  it('CORRECTS a wrong line number rather than dropping the rule', () => {
    const [kept] = verifyCandidates([raw({ evidence: { ...raw().evidence, line: 99 } })], SAMPLES);
    expect(kept).toBeDefined();
    // 4 is where the snippet really is; 99 is what the model claimed.
    expect(kept?.evidenceLine).toBe(4);
  });

  it('drops a candidate citing a file that was never sampled', () => {
    expect(
      verifyCandidates([raw({ evidence: { ...raw().evidence, path: 'src/ghost.ts' } })], SAMPLES),
    ).toEqual([]);
  });

  it('drops a candidate whose snippet is nowhere in the file', () => {
    expect(
      verifyCandidates(
        [raw({ evidence: { ...raw().evidence, snippet: 'const invented = true;' } })],
        SAMPLES,
      ),
    ).toEqual([]);
  });

  it('does not accept a line number on its own as evidence', () => {
    // The file has 5 lines, so "line 2 exists" is true — and must not be enough.
    const out = verifyCandidates(
      [raw({ evidence: { path: 'server/src/modules/skills/service.ts', line: 2, snippet: '' } })],
      SAMPLES,
    );
    expect(out).toEqual([]);
  });

  it('matches a block snippet by its first meaningful line', () => {
    const [kept] = verifyCandidates(
      [raw({ evidence: { ...raw().evidence, snippet: '\n\nexport class SkillsService {\n  ...\n}' } })],
      SAMPLES,
    );
    expect(kept?.evidenceLine).toBe(3);
  });

  it('deduplicates two phrasings of the same rule within one scan', () => {
    const out = verifyCandidates([raw(), raw({ rule: 'a service takes the ports it calls, NOT the container.' })], SAMPLES);
    expect(out).toHaveLength(1);
  });

  it('clamps a confidence the model returned out of range', () => {
    expect(verifyCandidates([raw({ confidence: 4 })], SAMPLES)[0]?.confidence).toBe(1);
    expect(verifyCandidates([raw({ confidence: -2 })], SAMPLES)[0]?.confidence).toBe(0);
  });
});

describe('findSnippetLine', () => {
  it('ignores indentation differences', () => {
    expect(findSnippetLine('function a() {\n      return 1;\n}', 'return 1;')).toBe(2);
  });
  it('returns null for an empty needle', () => {
    expect(findSnippetLine('const a = 1;', '   ')).toBeNull();
  });
});

describe('matchSample', () => {
  it('tolerates a leading ./', () => {
    expect(matchSample(SAMPLES, './tsconfig.json')?.path).toBe('tsconfig.json');
  });
});

describe('skill body assembly', () => {
  const rows: ConventionRow[] = [
    {
      id: '1', category: 'naming', rule: 'Server files are kebab-case.',
      evidencePath: 'server/src/modules/skills/service.ts', evidenceLine: 1,
      evidenceSnippet: 'x', confidence: 0.9, status: 'accepted',
    },
    {
      id: '2', category: 'architecture', rule: 'A service takes ports.',
      evidencePath: 'server/src/modules/skills/service.ts', evidenceLine: 4,
      evidenceSnippet: 'y', confidence: 0.8, status: 'accepted',
    },
  ];

  it('groups by category and carries the evidence path and line', () => {
    const body = buildSkillBody(rows, 'acme/payments-api');
    expect(body).toContain('# Repo conventions — acme/payments-api');
    expect(body).toContain('## architecture');
    expect(body).toContain('## naming');
    expect(body).toContain('`server/src/modules/skills/service.ts:4`');
  });

  it('orders categories deterministically', () => {
    const body = buildSkillBody(rows, 'acme/payments-api');
    expect(body.indexOf('## architecture')).toBeLessThan(body.indexOf('## naming'));
  });
});
