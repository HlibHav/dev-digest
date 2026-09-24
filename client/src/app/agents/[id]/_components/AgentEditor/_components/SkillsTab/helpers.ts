import type { Skill } from "@devdigest/shared";

/** Move an id from one position to another, returning a new array. */
export function moveSkill(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids;
  const next = ids.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Attach a skill at the end, or detach it. `attached` is the ordered id list. */
export function toggleAttached(attached: string[], skillId: string): string[] {
  return attached.includes(skillId)
    ? attached.filter((id) => id !== skillId)
    : [...attached, skillId];
}

/** Whether a skill matches the filter box. An empty query matches everything. */
export function matchesQuery(skill: Skill, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q);
}

/**
 * The attached skills in prompt order, dropping ids whose skill is gone, and
 * filtered by the search box — the tab shows one list, so the filter has to
 * reach the attached rows too.
 */
export function orderedAttached(skills: Skill[], attached: string[], query = ""): Skill[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  return attached.flatMap((id) => {
    const skill = byId.get(id);
    return skill && matchesQuery(skill, query) ? [skill] : [];
  });
}

/** Everything not attached, filtered by the search box. */
export function availableSkills(skills: Skill[], attached: string[], query: string): Skill[] {
  return skills.filter((s) => !attached.includes(s.id) && matchesQuery(s, query));
}
