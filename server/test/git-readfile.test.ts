/**
 * `SimpleGitClient.readFile` reads a path named in untrusted PR text (a linked
 * plan doc) from the clone. A clone checks symlinks out as symlinks, so the
 * read must stay inside the clone after resolving links (2026-09-26 security
 * review of PR #22, finding 1).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';

const REPO = { owner: 'acme', name: 'app' };
let base: string;
let git: SimpleGitClient;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'git-readfile-'));
  const clone = join(base, 'clones', 'acme', 'app');
  await mkdir(join(clone, 'docs'), { recursive: true });
  await writeFile(join(clone, 'docs', 'plan.md'), '# Plan');
  await writeFile(join(base, 'secret.json'), '{"token":"s3cret"}');
  await symlink(join(base, 'secret.json'), join(clone, 'docs', 'escape.md'));
  await symlink(join(clone, 'docs', 'plan.md'), join(clone, 'docs', 'alias.md'));
  git = new SimpleGitClient(join(base, 'clones'));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('SimpleGitClient.readFile containment', () => {
  it('reads a regular file inside the clone', async () => {
    expect(await git.readFile(REPO, 'docs/plan.md')).toBe('# Plan');
  });

  it('follows a symlink that stays inside the clone', async () => {
    expect(await git.readFile(REPO, 'docs/alias.md')).toBe('# Plan');
  });

  it('refuses a symlink that points outside the clone', async () => {
    await expect(git.readFile(REPO, 'docs/escape.md')).rejects.toThrow(/outside the clone/);
  });

  it('refuses a `..` path that leaves the clone', async () => {
    await expect(git.readFile(REPO, '../../../secret.json')).rejects.toThrow(/outside the clone/);
  });

  it('refuses a directory', async () => {
    await expect(git.readFile(REPO, 'docs')).rejects.toThrow(/not a regular file/);
  });
});
