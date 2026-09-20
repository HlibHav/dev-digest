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

/** The attached skills in prompt order, dropping ids whose skill is gone. */
export function orderedAttached(skills: Skill[], attached: string[]): Skill[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  return attached.flatMap((id) => {
    const skill = byId.get(id);
    return skill ? [skill] : [];
  });
}

/** Everything not attached, filtered by the search box. */
export function availableSkills(skills: Skill[], attached: string[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  return skills
    .filter((s) => !attached.includes(s.id))
    .filter((s) => !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
}
