import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsRepoDocs } from '../src/adapters/docs/fs-repo-docs.js';

/** Real-filesystem checks for the FsRepoDocs walk (CR-1, CR-3). */
describe('FsRepoDocs.list', () => {
  let root: string;
  const locked: string[] = [];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'fsdocs-'));
  });

  afterEach(async () => {
    for (const p of locked.splice(0)) await chmod(p, 0o755).catch(() => {});
    await rm(root, { recursive: true, force: true });
  });

  it('CR-1: a hidden .md file is not listed, matching what read refuses', async () => {
    await mkdir(join(root, 'notes'), { recursive: true });
    await writeFile(join(root, '.draft.md'), 'x');
    await writeFile(join(root, 'notes', '.x.md'), 'x');
    await writeFile(join(root, 'notes', 'ok.md'), 'ok');
    const docs = new FsRepoDocs();
    expect((await docs.list(root)).map((e) => e.path)).toEqual(['notes/ok.md']);
    expect(await docs.read(root, 'notes/.x.md')).toBeNull();
  });

  it.skipIf(process.getuid?.() === 0)('CR-3: an unreadable subdirectory is skipped, not fatal', async () => {
    await mkdir(join(root, 'locked'), { recursive: true });
    await writeFile(join(root, 'locked', 'secret.md'), 's');
    await writeFile(join(root, 'ok.md'), 'ok');
    await chmod(join(root, 'locked'), 0o000);
    locked.push(join(root, 'locked'));
    expect((await new FsRepoDocs().list(root)).map((e) => e.path)).toEqual(['ok.md']);
  });
});
