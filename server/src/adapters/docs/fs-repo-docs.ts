import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, relative, sep, isAbsolute } from 'node:path';
import type { RepoDocs, RepoDocEntry } from '@devdigest/shared';

/**
 * Filesystem adapter for discoverable project docs (`*.md`) inside a clone.
 *
 * Security: the walk uses `lstat` and never descends into a symlinked directory
 * or an excluded folder; a symlinked file is listed only when its `realpath` is
 * a regular file inside `realpath(root)`. `read` applies the same rules, so a
 * path the list would not show cannot be read either.
 */

/** Folder names never walked and never readable (vendored and build output). */
export const EXCLUDED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  'vendor',
  'dist',
  'build',
  'out',
  '.next',
  'coverage',
]);

/** Hidden folders are skipped too, except this one. */
const ALLOWED_HIDDEN_DIR = '.devdigest';

function isExcludedSegment(segment: string): boolean {
  if (EXCLUDED_DIRS.has(segment)) return true;
  return segment.startsWith('.') && segment !== ALLOWED_HIDDEN_DIR;
}

function isInside(rootReal: string, target: string): boolean {
  const rel = relative(rootReal, target);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * A resolved symlink target is a doc only by the same rules as a plain path:
 * relative to the clone root it ends in `.md` and no segment (file name
 * included) is an excluded or hidden name. Blocks `notes.md -> .git/config`.
 */
function isDocTarget(rootReal: string, target: string): boolean {
  if (!isInside(rootReal, target)) return false;
  const segments = relative(rootReal, target).split(sep);
  if (!segments[segments.length - 1]!.toLowerCase().endsWith('.md')) return false;
  return !segments.some(isExcludedSegment);
}

export class FsRepoDocs implements RepoDocs {
  async list(root: string): Promise<RepoDocEntry[]> {
    const rootReal = await realpath(root);
    const out: RepoDocEntry[] = [];
    await this.walk(rootReal, rootReal, out);
    out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return out;
  }

  async read(root: string, path: string): Promise<string | null> {
    if (!path.toLowerCase().endsWith('.md')) return null;
    const segments = path.split('/');
    if (path.startsWith('/') || segments.some((s) => s === '' || s === '.' || s === '..')) return null;
    // Every segment, the file name included, must pass the same rule `list` applies.
    if (segments.some(isExcludedSegment)) return null;
    try {
      const rootReal = await realpath(root);
      const real = await realpath(join(rootReal, ...segments));
      if (!isDocTarget(rootReal, real)) return null;
      const st = await stat(real);
      if (!st.isFile()) return null;
      return await readFile(real, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  /**
   * An entry that cannot be read (EACCES, removed mid-walk) is skipped, so one bad
   * file does not fail the whole listing. The adapter has no logger, so the skip is
   * silent. Only the root itself (resolved in `list`) may still throw.
   */
  private async walk(rootReal: string, dir: string, out: RepoDocEntry[]): Promise<void> {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      try {
        await this.visit(rootReal, dir, name, out);
      } catch {
        continue;
      }
    }
  }

  private async visit(rootReal: string, dir: string, name: string, out: RepoDocEntry[]): Promise<void> {
    const full = join(dir, name);
    const st = await lstat(full);
    if (st.isDirectory()) {
      if (isExcludedSegment(name)) return;
      await this.walk(rootReal, full, out);
      return;
    }
    // Same rule as `read`: a hidden file name is excluded like a hidden directory.
    if (isExcludedSegment(name) || !name.toLowerCase().endsWith('.md')) return;
    let file = full;
    if (st.isSymbolicLink()) {
      file = await realpath(full);
      if (!isDocTarget(rootReal, file)) return;
    } else if (!st.isFile()) {
      return;
    }
    const target = await stat(file);
    if (!target.isFile()) return;
    const content = await readFile(file, 'utf8');
    out.push({
      path: relative(rootReal, full).split(sep).join('/'),
      size: target.size,
      content,
    });
  }
}
