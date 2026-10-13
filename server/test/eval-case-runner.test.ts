/**
 * runEvalCase against MockLLMProvider: only the fixed inputs reach the model,
 * dropped findings are kept, a model error is rethrown.
 */
import { describe, it, expect } from 'vitest';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { runEvalCase, type CaseRunnerPorts } from '../src/modules/eval/case-runner.js';
import type { EvalAgent } from '../src/modules/eval/types.js';

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,3 @@',
  ' const a = 1;',
  '+const unsafe = eval(input);',
  ' export {};',
  '',
].join('\n');

const AGENT: EvalAgent = {
  id: 'ag-1',
  name: 'Reviewer',
  model: 'gpt-4.1',
  provider: 'openai',
  strategy: 'single-pass',
  systemPrompt: 'You are a strict reviewer.',
  version: 3,
  enabled: true,
};

function finding(id: string, file: string, line: number) {
  return {
    id,
    severity: 'CRITICAL',
    category: 'security',
    title: `Issue ${id}`,
    file,
    start_line: line,
    end_line: line,
    rationale: 'because',
    confidence: 0.9,
  };
}

function review(findings: unknown[]) {
  return { verdict: 'comment', summary: 'ok', score: 70, findings };
}

function ports(llm: MockLLMProvider): CaseRunnerPorts {
  let t = 1000;
  return {
    llm: async () => llm,
    parseDiff: parseUnifiedDiff,
    nowMs: () => (t += 250),
  };
}

describe('runEvalCase', () => {
  it('passes only diff, PR meta, prompt, model, strategy and skills', async () => {
    const llm = new MockLLMProvider('openai', { structured: review([finding('f1', 'src/a.ts', 2)]) });
    const out = await runEvalCase(ports(llm), {
      inputDiff: DIFF,
      meta: { title: 'Add eval hook', body: 'Body text' },
      agent: AGENT,
      skills: [{ id: 's1', name: 'sec-skill', version: 1, body: 'SKILL BODY', untrusted: false }],
    });
    const call = llm.calls.find((c) => c.method === 'completeStructured')!;
    const req = call.req as { model: string; messages: { content: string }[] };
    const text = req.messages.map((m) => m.content).join('\n');
    expect(req.model).toBe('gpt-4.1');
    expect(text).toContain('const unsafe = eval(input);');
    expect(text).toContain('Add eval hook');
    expect(text).toContain('SKILL BODY');
    expect(text).toContain('You are a strict reviewer.');
    for (const banned of ['Project context', 'Intent', 'Callers', 'Repo skeleton']) {
      expect(text).not.toContain(banned);
    }
    expect(out.grounded.map((f) => f.id)).toEqual(['f1']);
    expect(out.durationMs).toBe(250);
  });

  it('keeps dropped findings', async () => {
    const llm = new MockLLMProvider('openai', {
      structured: review([finding('in', 'src/a.ts', 2), finding('out', 'src/a.ts', 99)]),
    });
    const out = await runEvalCase(ports(llm), {
      inputDiff: DIFF,
      meta: { title: '', body: '' },
      agent: AGENT,
      skills: [],
    });
    expect(out.grounded.map((f) => f.id)).toEqual(['in']);
    expect(out.dropped.map((d) => d.finding.id)).toEqual(['out']);
    expect(out.dropped[0]!.reason).toEqual(expect.any(String));
  });

  it('rethrows a model error', async () => {
    const llm = new MockLLMProvider('openai');
    llm.completeStructured = async () => {
      throw new Error('provider down');
    };
    await expect(
      runEvalCase(ports(llm), { inputDiff: DIFF, meta: { title: 't', body: '' }, agent: AGENT, skills: [] }),
    ).rejects.toThrow('provider down');
  });
});
