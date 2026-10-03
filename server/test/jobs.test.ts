import { describe, it, expect } from 'vitest';
import type { Db } from '../src/db/client.js';
import { JobRunner } from '../src/platform/jobs.js';

/**
 * JobRunner failure handling. `enqueue` marks the `jobs` row failed and then
 * re-throws, so `done` rejects; every call site drops `done` and nothing
 * registers `unhandledRejection`, which made an ordinary failed clone (private
 * repo, typo'd URL) terminate the API process. No Postgres — the db handle is
 * faked down to the two chains enqueue actually uses.
 */

interface UpdateRecord {
  status?: string;
  error?: string | null;
}

function fakeDb(): { db: Db; updates: UpdateRecord[] } {
  const updates: UpdateRecord[] = [];
  const db = {
    insert: () => ({
      values: () => ({ returning: async () => [{ id: 'job-1' }] }),
    }),
    update: () => ({
      set: (values: UpdateRecord) => ({
        where: async () => {
          updates.push(values);
        },
      }),
    }),
  } as unknown as Db;
  return { db, updates };
}

/** Let the microtask queue drain so a genuinely unhandled rejection surfaces. */
async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
}

describe('JobRunner.enqueue — a failing handler', () => {
  it('marks the row failed without producing an unhandled rejection', async () => {
    const { db, updates } = fakeDb();
    const runner = new JobRunner(db, { retries: 0, timeoutMs: 5_000 });
    runner.register('clone', async () => {
      throw new Error('repository not found');
    });

    const unhandled: unknown[] = [];
    const onUnhandled = (err: unknown) => unhandled.push(err);
    process.on('unhandledRejection', onUnhandled);
    try {
      // Deliberately DROP `done`, exactly as every production call site does.
      await runner.enqueue('ws-1', 'clone', { url: 'https://github.com/a/b' });
      await runner.onIdle();
      await settle();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    expect(updates.map((u) => u.status)).toEqual(['running', 'failed']);
    expect(updates.at(-1)?.error).toBe('repository not found');
    expect(unhandled).toEqual([]);
  });

  it('still rejects `done` for a caller that awaits it', async () => {
    const { db } = fakeDb();
    const runner = new JobRunner(db, { retries: 0, timeoutMs: 5_000 });
    runner.register('clone', async () => {
      throw new Error('repository not found');
    });
    const { done } = await runner.enqueue('ws-1', 'clone', {});
    await expect(done).rejects.toThrow('repository not found');
  });
});
