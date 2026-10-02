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
    // The file name itself may not be an excluded name either, only directories matter here.
    if (segments.slice(0, -1).some(isExcludedSegment)) return null;
    try {
      const rootReal = await realpath(root);
      const real = await realpath(join(rootReal, ...segments));
      if (!isInside(rootReal, real)) return null;
      const st = await stat(real);
      if (!st.isFile()) return null;
      return await readFile(real, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  private async walk(rootReal: string, dir: string, out: RepoDocEntry[]): Promise<void> {
    const names = await readdir(dir);
    for (const name of names) {
      const full = join(dir, name);
      const st = await lstat(full);
      if (st.isDirectory()) {
        if (isExcludedSegment(name)) continue;
        await this.walk(rootReal, full, out);
        continue;
      }
      if (!name.toLowerCase().endsWith('.md')) continue;
      let file = full;
      if (st.isSymbolicLink()) {
        try {
          file = await realpath(full);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw err;
        }
        if (!isInside(rootReal, file)) continue;
      } else if (!st.isFile()) {
        continue;
      }
      const target = await stat(file);
      if (!target.isFile()) continue;
      const content = await readFile(file, 'utf8');
      out.push({
        path: relative(rootReal, full).split(sep).join('/'),
        size: target.size,
        content,
      });
    }
  }
}
