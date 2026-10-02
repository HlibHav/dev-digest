import type { AgentContext, ContextDocCategory, ReviewStrategy, SpecFile } from "@devdigest/shared";

/** One line in the context list, already resolved against the repo's docs. */
export type ContextRow = {
  path: string;
  category: ContextDocCategory | null;
  tokens: number;
  present: boolean;
  checked: boolean;
  /** Name of the skill that carries this doc, when the agent doesn't attach it itself. */
  inheritedFrom: string | null;
};

/** Rows whose path contains the query, case-insensitively. A blank query keeps all. */
export function filterDocs<T extends { path: string }>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.path.toLowerCase().includes(q));
}

/** Move a path from one position to another, returning a new array. */
export function moveDoc(paths: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= paths.length || to >= paths.length) return paths;
  const next = paths.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Attach a path at the end, or detach it. `paths` is the ordered own list. */
export function toggleDoc(paths: string[], path: string): string[] {
  return paths.includes(path) ? paths.filter((p) => p !== path) : [...paths, path];
}

/** map-reduce and auto run one call per file, so the doc block repeats per call. */
export function isPerFileStrategy(s: ReviewStrategy | null | undefined): boolean {
  return s === "map-reduce" || s === "auto";
}

/**
 * Rows for the agent tab: its own docs in attached order, then the rest of the
 * repo's docs (inherited ones checked and labelled), then attached or inherited
 * paths that no longer exist in the repo.
 */
export function buildAgentRows(files: SpecFile[], ctx: AgentContext): ContextRow[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const own = [...ctx.attached].sort((a, b) => a.order - b.order);
  const ownPaths = new Set(own.map((a) => a.path));
  const inheritedBy = new Map<string, { skill_name: string; tokens: number; present: boolean }>();
  for (const i of ctx.inherited) {
    if (!ownPaths.has(i.path) && !inheritedBy.has(i.path)) inheritedBy.set(i.path, i);
  }

  const head: ContextRow[] = [];
  const missing: ContextRow[] = [];
  for (const a of own) {
    const f = byPath.get(a.path);
    const row: ContextRow = {
      path: a.path,
      category: f?.category ?? null,
      tokens: a.present ? a.tokens : 0,
      present: a.present,
      checked: true,
      inheritedFrom: null,
    };
    (a.present ? head : missing).push(row);
  }

  const rest: ContextRow[] = [];
  for (const f of files) {
    if (ownPaths.has(f.path)) continue;
    const inh = inheritedBy.get(f.path);
    rest.push({
      path: f.path,
      category: f.category,
      tokens: f.tokens,
      present: true,
      checked: !!inh,
      inheritedFrom: inh?.skill_name ?? null,
    });
  }
  for (const [path, inh] of inheritedBy) {
    if (byPath.has(path)) continue;
    missing.push({
      path,
      category: null,
      tokens: 0,
      present: false,
      checked: true,
      inheritedFrom: inh.skill_name,
    });
  }
  return [...head, ...rest, ...missing];
}

/** Token totals over the unique present docs; own wins over inherited. */
export function contextTotals(ctx: AgentContext): { total: number; inherited: number } {
  const ownPaths = new Set(ctx.attached.map((a) => a.path));
  let total = 0;
  let inherited = 0;
  for (const a of ctx.attached) if (a.present) total += a.tokens;
  const seen = new Set<string>();
  for (const i of ctx.inherited) {
    if (ownPaths.has(i.path) || seen.has(i.path) || !i.present) continue;
    seen.add(i.path);
    total += i.tokens;
    inherited += i.tokens;
  }
  return { total, inherited };
}
