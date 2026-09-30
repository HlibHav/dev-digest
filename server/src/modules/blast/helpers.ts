import type { BlastRadius, BlastDegradedReason } from '@devdigest/shared';

/**
 * blast module — pure mapper (homework-5, docs/homework-5/plan.md).
 *
 * `toBlastRadius` turns the repo-intel facade's flat `BlastResult` into the
 * `BlastRadius` contract: one group per `viaSymbol`, callers ordered and
 * capped, endpoints/crons attributed from `factsByFile`, degraded/reason
 * passed through. No `fastify`, `drizzle-orm`, `src/db/**` or adapter import
 * — and no cross-module import, not even a type: `BlastFacadeResult` below
 * is a local structural type, not `repo-intel/types.ts`'s `BlastResult`
 * (Design conflict 1). `wiring.ts` is the only file that touches the facade.
 */

/** Structurally identical to `repo-intel/types.ts`'s `IndexStatus`. */
export type BlastIndexStatus = 'full' | 'partial' | 'degraded' | 'failed';

/** Structurally identical to `repo-intel/types.ts`'s `BlastResult`, kept
 *  local so this file imports no other module (Design conflict 1). */
export interface BlastFacadeResult {
  changedSymbols: { file: string; name: string; kind: string }[];
  callers: { file: string; symbol: string; viaSymbol: string; line: number; rank: number }[];
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  degraded?: boolean;
  reason?: BlastDegradedReason;
}

type FacadeCaller = BlastFacadeResult['callers'][number];

/** Rank descending, then file ascending, then line ascending (AC24). */
function compareCallers(a: FacadeCaller, b: FacadeCaller): number {
  if (a.rank !== b.rank) return b.rank - a.rank;
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  return a.line - b.line;
}

/**
 * One `downstream` group in progress, with its sort key (`maxRank`, the
 * capped group's highest caller rank) still attached — sorted by rank desc /
 * symbol name asc (AC24), then stripped before the final `BlastRadius`.
 */
interface GroupWithRank {
  symbol: string;
  callers: { name: string; file: string; line: number; rank: number }[];
  endpoints_affected: string[];
  crons_affected: string[];
  maxRank: number;
}

export function toBlastRadius(
  result: BlastFacadeResult,
  indexStatus: BlastIndexStatus,
  limits: { maxCallersPerSymbol: number },
): BlastRadius {
  const changed_symbols = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  // A caller never appears under a symbol whose own declaring file it lives
  // in (AC13) — any changed-file entry that declares a symbol of that name,
  // not just the first one (Review focus: two declaring files).
  const declaringFilesByName = new Map<string, Set<string>>();
  for (const s of result.changedSymbols) {
    const set = declaringFilesByName.get(s.name) ?? new Set<string>();
    set.add(s.file);
    declaringFilesByName.set(s.name, set);
  }

  const byViaSymbol = new Map<string, FacadeCaller[]>();
  for (const caller of result.callers) {
    const list = byViaSymbol.get(caller.viaSymbol) ?? [];
    list.push(caller);
    byViaSymbol.set(caller.viaSymbol, list);
  }

  const groups: GroupWithRank[] = [];
  for (const [symbol, callers] of byViaSymbol) {
    const declaringFiles = declaringFilesByName.get(symbol);
    const kept = callers.filter((c) => !declaringFiles?.has(c.file));
    if (kept.length === 0) continue;

    kept.sort(compareCallers);
    const capped = kept.slice(0, limits.maxCallersPerSymbol);

    const endpoints_affected: string[] = [];
    const crons_affected: string[] = [];
    const seenEndpoints = new Set<string>();
    const seenCrons = new Set<string>();
    for (const caller of capped) {
      const facts = result.factsByFile?.[caller.file];
      if (!facts) continue;
      for (const e of facts.endpoints) {
        if (seenEndpoints.has(e)) continue;
        seenEndpoints.add(e);
        endpoints_affected.push(e);
      }
      for (const c of facts.crons) {
        if (seenCrons.has(c)) continue;
        seenCrons.add(c);
        crons_affected.push(c);
      }
    }

    groups.push({
      symbol,
      callers: capped.map((c) => ({ name: c.symbol, file: c.file, line: c.line, rank: c.rank })),
      endpoints_affected,
      crons_affected,
      maxRank: capped[0]!.rank,
    });
  }

  // Groups sorted by highest caller rank desc, ties broken by symbol name asc (AC24).
  groups.sort((a, b) => {
    if (a.maxRank !== b.maxRank) return b.maxRank - a.maxRank;
    return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
  });
  const downstream = groups.map(({ maxRank: _maxRank, ...group }) => group);

  const { degraded, reason } = resolveDegraded(result, indexStatus);
  const summary = blastSummary({ changed_symbols, downstream, degraded, reason });

  return { changed_symbols, downstream, summary, degraded, reason };
}

function resolveDegraded(
  result: BlastFacadeResult,
  indexStatus: BlastIndexStatus,
): { degraded: boolean; reason: BlastDegradedReason | null } {
  if (result.degraded) return { degraded: true, reason: result.reason ?? 'no_data' };
  if (indexStatus === 'partial') return { degraded: true, reason: 'index_partial' };
  return { degraded: false, reason: null };
}

/**
 * The summary string (Count rules, docs/homework-5/plan.md "Contracts &
 * data"): counts are distinct `file:line` pairs / distinct strings across
 * ALL groups, not summed per group.
 */
export function blastSummary(
  radius: Pick<BlastRadius, 'changed_symbols' | 'downstream' | 'degraded' | 'reason'>,
): string {
  const symbols = radius.changed_symbols.length;

  const callerPairs = new Set<string>();
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  for (const group of radius.downstream) {
    for (const caller of group.callers) callerPairs.add(`${caller.file}:${caller.line}`);
    for (const e of group.endpoints_affected) endpoints.add(e);
    for (const c of group.crons_affected) crons.add(c);
  }

  let summary =
    `${symbols} changed symbol(s) · ${callerPairs.size} caller(s) · ` +
    `${endpoints.size} endpoint(s) · ${crons.size} cron/job(s)`;
  if (radius.degraded) summary += ` · index incomplete (${radius.reason})`;
  return summary;
}
