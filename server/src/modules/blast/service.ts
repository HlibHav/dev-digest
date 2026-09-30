import type { BlastRadius, BlastDegradedReason } from '@devdigest/shared';
import { toBlastRadius, type BlastFacadeResult, type BlastIndexStatus } from './helpers.js';

/**
 * blast module — service (homework-5, docs/homework-5/plan.md AC10, AC20).
 * Reads the repo-intel index that is already built: exactly one `blast` call
 * and one `indexStatus` call per request, no indexing method on its ports
 * (onion: application code takes ports, not `Container` — step 5).
 */

export const BLAST_LOG_MESSAGE = 'blast: read repo-intel index';

export interface BlastStorePort {
  getPull(workspaceId: string, prId: string): Promise<{ id: string; repoId: string } | undefined>;
  getPrFiles(prId: string): Promise<{ path: string }[]>;
}

export interface BlastLogFields {
  prId: string;
  repoId: string;
  source: 'index' | 'fallback';
  degraded: boolean;
  reason: BlastDegradedReason | null;
  symbols: number;
  callers: number;
}

export interface BlastPorts {
  store: BlastStorePort;
  blast(repoId: string, changedFiles: string[]): Promise<BlastFacadeResult>;
  indexStatus(repoId: string): Promise<{ status: BlastIndexStatus }>;
  /** Only `GET /pulls/:id` fills `pr_files` (server/INSIGHTS.md:15) — a PR
   *  that was never opened needs this before the facade can read anything. */
  refreshFiles(workspaceId: string, prId: string): Promise<string[]>;
  log?(fields: BlastLogFields, message: string): void;
  limits: { maxCallersPerSymbol: number };
}

export class BlastService {
  constructor(private ports: BlastPorts) {}

  async getBlastRadius(workspaceId: string, prId: string): Promise<BlastRadius | undefined> {
    const pull = await this.ports.store.getPull(workspaceId, prId);
    if (!pull) return undefined;

    const prFiles = await this.ports.store.getPrFiles(prId);
    let changedFiles = prFiles.map((f) => f.path);
    if (changedFiles.length === 0) {
      changedFiles = await this.ports.refreshFiles(workspaceId, prId);
    }

    const indexState = await this.ports.indexStatus(pull.repoId);

    // Still no files after the refresh: don't call the facade at all — it
    // would report a false `no_data` for a PR that simply has no files
    // (AC20). `degraded` then follows the index status only.
    const facadeResult: BlastFacadeResult =
      changedFiles.length === 0
        ? { changedSymbols: [], callers: [] }
        : await this.ports.blast(pull.repoId, changedFiles);

    const radius = toBlastRadius(facadeResult, indexState.status, this.ports.limits);

    // Count rules: callers = distinct file:line pairs across all downstream
    // callers, not the sum of each group's length (a caller can repeat
    // across groups when it reaches more than one changed symbol).
    const callerPairs = new Set<string>();
    for (const group of radius.downstream) {
      for (const caller of group.callers) callerPairs.add(`${caller.file}:${caller.line}`);
    }
    this.ports.log?.(
      {
        prId,
        repoId: pull.repoId,
        source: facadeResult.degraded ? 'fallback' : 'index',
        degraded: radius.degraded ?? false,
        reason: radius.reason ?? null,
        symbols: radius.changed_symbols.length,
        callers: callerPairs.size,
      },
      BLAST_LOG_MESSAGE,
    );

    return radius;
  }
}
