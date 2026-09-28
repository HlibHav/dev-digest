import { describe, it, expect } from 'vitest';
import { BlastService, BLAST_LOG_MESSAGE } from '../src/modules/blast/service.js';
import type { BlastPorts, BlastStorePort, BlastLogFields } from '../src/modules/blast/service.js';
import type { BlastFacadeResult, BlastIndexStatus } from '../src/modules/blast/helpers.js';

/**
 * Red-first for homework-5 (docs/homework-5/plan.md), AC10 and AC20 plus
 * "unknown PR returns undefined". `BlastService`, `BLAST_LOG_MESSAGE`,
 * `BlastPorts` and `BlastStorePort` don't exist yet
 * (server/src/modules/blast/service.ts is new).
 */

interface BuildPortsOpts {
  pull?: { id: string; repoId: string } | undefined;
  prFiles?: { path: string }[];
  refreshedFiles?: string[];
  blastResult?: BlastFacadeResult;
  indexStatus?: BlastIndexStatus;
}

function buildPorts(opts: BuildPortsOpts) {
  const pull = 'pull' in opts ? opts.pull : { id: 'pr-1', repoId: 'repo-1' };
  const prFiles = opts.prFiles ?? [{ path: 'a.ts' }];
  const refreshedFiles = opts.refreshedFiles ?? [];
  const blastResult: BlastFacadeResult = opts.blastResult ?? {
    changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }],
    callers: [{ file: 'c1.ts', symbol: 'caller', viaSymbol: 'foo', line: 1, rank: 1 }],
  };
  const indexStatus: BlastIndexStatus = opts.indexStatus ?? 'full';

  const blastArgs: { repoId: string; changedFiles: string[] }[] = [];
  const indexStatusArgs: string[] = [];
  const refreshFilesArgs: { workspaceId: string; prId: string }[] = [];
  const logs: { fields: BlastLogFields; message: string }[] = [];

  const store: BlastStorePort = {
    async getPull(_workspaceId: string, _prId: string) {
      return pull;
    },
    async getPrFiles(_prId: string) {
      return prFiles;
    },
  };

  const ports: BlastPorts = {
    store,
    async blast(repoId: string, changedFiles: string[]) {
      blastArgs.push({ repoId, changedFiles });
      return blastResult;
    },
    async indexStatus(repoId: string) {
      indexStatusArgs.push(repoId);
      return { status: indexStatus };
    },
    async refreshFiles(workspaceId: string, prId: string) {
      refreshFilesArgs.push({ workspaceId, prId });
      return refreshedFiles;
    },
    log(fields: BlastLogFields, message: string) {
      logs.push({ fields, message });
    },
    limits: { maxCallersPerSymbol: 10 },
  };

  return { ports, blastArgs, indexStatusArgs, refreshFilesArgs, logs };
}

describe('BlastService: one read, one log line', () => {
  it('one facade read, one index-state read, one log line with source index', async () => {
    const { ports, blastArgs, indexStatusArgs, refreshFilesArgs, logs } = buildPorts({});
    const service = new BlastService(ports);

    const radius = await service.getBlastRadius('ws-1', 'pr-1');

    expect(radius).toBeDefined();
    expect(blastArgs).toHaveLength(1);
    expect(indexStatusArgs).toHaveLength(1);
    expect(refreshFilesArgs).toHaveLength(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.message).toBe(BLAST_LOG_MESSAGE);
    expect(logs[0]!.fields).toMatchObject({
      prId: 'pr-1',
      repoId: 'repo-1',
      source: 'index',
      degraded: false,
      reason: null,
      symbols: 1,
      callers: 1,
    });
  });
});

describe('BlastService: file refresh', () => {
  it('refreshes files only when pr_files is empty', async () => {
    // Empty pr_files -> refresh runs once, and the facade reads the refreshed paths.
    const empty = buildPorts({ prFiles: [], refreshedFiles: ['refreshed.ts'] });
    const serviceEmpty = new BlastService(empty.ports);
    await serviceEmpty.getBlastRadius('ws-1', 'pr-1');

    expect(empty.refreshFilesArgs).toEqual([{ workspaceId: 'ws-1', prId: 'pr-1' }]);
    expect(empty.blastArgs).toEqual([{ repoId: 'repo-1', changedFiles: ['refreshed.ts'] }]);

    // Non-empty pr_files -> never refreshed.
    const filled = buildPorts({ prFiles: [{ path: 'a.ts' }] });
    const serviceFilled = new BlastService(filled.ports);
    await serviceFilled.getBlastRadius('ws-1', 'pr-1');

    expect(filled.refreshFilesArgs).toEqual([]);
    expect(filled.blastArgs).toEqual([{ repoId: 'repo-1', changedFiles: ['a.ts'] }]);
  });

  it('no files after refresh: no facade call', async () => {
    const { ports, blastArgs, refreshFilesArgs } = buildPorts({
      prFiles: [],
      refreshedFiles: [],
      indexStatus: 'full',
    });
    const service = new BlastService(ports);

    const radius = await service.getBlastRadius('ws-1', 'pr-1');

    expect(refreshFilesArgs).toEqual([{ workspaceId: 'ws-1', prId: 'pr-1' }]);
    expect(blastArgs).toEqual([]);
    expect(radius).toBeDefined();
    // degraded follows the index status only — no false 'no_data'.
    expect(radius!.degraded).toBe(false);
    expect(radius!.reason).toBeNull();
  });
});

describe('BlastService: unknown PR', () => {
  it('unknown PR returns undefined', async () => {
    const { ports, blastArgs, indexStatusArgs, refreshFilesArgs } = buildPorts({ pull: undefined });
    const service = new BlastService(ports);

    const radius = await service.getBlastRadius('ws-1', 'missing-pr');

    expect(radius).toBeUndefined();
    expect(blastArgs).toEqual([]);
    expect(indexStatusArgs).toEqual([]);
    expect(refreshFilesArgs).toEqual([]);
  });
});
