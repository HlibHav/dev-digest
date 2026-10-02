import type { ContextDocCategory, SpecDocOrigin } from '@devdigest/shared';

/**
 * Pure helpers for the project-context module.
 */

/** Precedence: specs > insights > docs > other. Decided by path segments only. */
export function categorizeDocPath(path: string): ContextDocCategory {
  const segments = path.split('/');
  const dirs = segments.slice(0, -1).map((s) => s.toLowerCase());
  const base = (segments[segments.length - 1] ?? '').toLowerCase();
  if (dirs.includes('specs')) return 'specs';
  if (base === 'insights.md' || dirs.includes('insights')) return 'insights';
  if (dirs.includes('docs')) return 'docs';
  return 'other';
}

export type EffectiveDoc = {
  path: string;
  origin: SpecDocOrigin;
  skillId: string | null;
  skillName: string | null;
};

/**
 * The docs one agent run injects: the agent's own paths first, then each
 * enabled skill's, de-duplicated by path. The first occurrence wins, so a path
 * attached to the agent keeps the `agent` origin.
 */
export function buildEffectiveDocList(
  own: readonly string[],
  skills: readonly { skillId: string; skillName: string; paths: readonly string[] }[],
): EffectiveDoc[] {
  const seen = new Set<string>();
  const out: EffectiveDoc[] = [];
  for (const path of own) {
    if (seen.has(path)) continue;
    seen.add(path);
    out.push({ path, origin: 'agent', skillId: null, skillName: null });
  }
  for (const skill of skills) {
    for (const path of skill.paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({ path, origin: 'skill', skillId: skill.skillId, skillName: skill.skillName });
    }
  }
  return out;
}
