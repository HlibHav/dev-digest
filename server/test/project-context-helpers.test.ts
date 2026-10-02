import { describe, it, expect } from 'vitest';
import { categorizeDocPath, buildEffectiveDocList } from '../src/modules/project-context/helpers.js';

describe('categorizeDocPath applies specs > insights > docs > other', () => {
  it('puts anything under a specs folder in specs, even inside docs', () => {
    expect(categorizeDocPath('specs/a.md')).toBe('specs');
    expect(categorizeDocPath('server/specs/a.md')).toBe('specs');
    expect(categorizeDocPath('docs/specs/a.md')).toBe('specs');
  });
  it('treats INSIGHTS.md as insights, ahead of docs', () => {
    expect(categorizeDocPath('server/INSIGHTS.md')).toBe('insights');
    expect(categorizeDocPath('docs/INSIGHTS.md')).toBe('insights');
  });
  it('puts files under a docs folder in docs', () => {
    expect(categorizeDocPath('docs/plans/x.md')).toBe('docs');
    expect(categorizeDocPath('client/docs/x.md')).toBe('docs');
  });
  it('falls back to other', () => {
    expect(categorizeDocPath('README.md')).toBe('other');
    expect(categorizeDocPath('server/CLAUDE.md')).toBe('other');
  });
});

describe('buildEffectiveDocList', () => {
  const skill = (id: string, paths: string[]) => ({ skillId: id, skillName: `skill-${id}`, paths });

  it('[a,b]+[b,c]+[d,a] -> [a,b,c,d], first occurrence wins', () => {
    const list = buildEffectiveDocList(['a', 'b'], [skill('1', ['b', 'c']), skill('2', ['d', 'a'])]);
    expect(list.map((d) => d.path)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps the agent origin for a path that is also in a skill', () => {
    const list = buildEffectiveDocList(['a'], [skill('1', ['a'])]);
    expect(list).toEqual([{ path: 'a', origin: 'agent', skillId: null, skillName: null }]);
  });

  it('marks skill docs with the skill that brought them', () => {
    const list = buildEffectiveDocList([], [skill('1', ['c'])]);
    expect(list).toEqual([{ path: 'c', origin: 'skill', skillId: '1', skillName: 'skill-1' }]);
  });
});
