import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { extname, isAbsolute, join, relative, sep } from 'node:path';
import type {
  CloneScan,
  CloneScanOptions,
  CloneScanner,
  CloneTopLevelEntry,
} from '@devdigest/shared';

/**
 * Read-only filesystem scan of a clone for the onboarding tour.
 *
 * Security: the walk uses `readdir({ withFileTypes })` and never follows a
 * symlink (a symlinked dir or file is skipped, not counted). `exists` accepts
 * only a relative path without `..` that resolves to a regular file inside
 * `realpath(root)`.
 */

const README_NAMES = ['README.md', 'readme.md', 'README'] as const;

interface Counters {
  total: number;
  extensionCounts: Record<string, number>;
}

async function countDir(
  dir: string,
  excluded: ReadonlySet<string>,
  sources: ReadonlySet<string>,
  acc: Counters,
): Promise<number> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let count = 0;
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (excluded.has(entry.name)) continue;
      count += await countDir(join(dir, entry.name), excluded, sources, acc);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (!sources.has(ext)) continue;
      count += 1;
      acc.total += 1;
      acc.extensionCounts[ext] = (acc.extensionCounts[ext] ?? 0) + 1;
    }
  }
  return count;
}

async function readPackageScripts(root: string): Promise<Record<string, string> | null> {
  let raw: string;
  try {
    raw = await readFile(join(root, 'package.json'), 'utf8');
  } catch {
    return null;
  }
  try {
    const scripts = (JSON.parse(raw) as { scripts?: unknown }).scripts;
    if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return null;
    const out: Record<string, string> = {};
    for (const [name, cmd] of Object.entries(scripts)) {
      if (typeof cmd === 'string') out[name] = cmd;
    }
    return out;
  } catch {
    return null;
  }
}

async function readReadme(
  root: string,
  rootFiles: readonly string[],
  max: number,
): Promise<string | null> {
  for (const name of README_NAMES) {
    if (!rootFiles.includes(name)) continue;
    try {
      return (await readFile(join(root, name), 'utf8')).slice(0, max);
    } catch {
      return null;
    }
  }
  return null;
}

export class FsCloneScanner implements CloneScanner {
  async scan(root: string, opts: CloneScanOptions): Promise<CloneScan> {
    const excluded: ReadonlySet<string> = new Set(opts.excludedDirs);
    const sources: ReadonlySet<string> = new Set(opts.sourceExtensions);
    const acc: Counters = { total: 0, extensionCounts: {} };
    const topLevel: CloneTopLevelEntry[] = [];
    const rootFiles: string[] = [];

    const entries = await readdir(root, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (excluded.has(entry.name)) continue;
        const files = await countDir(join(root, entry.name), excluded, sources, acc);
        topLevel.push({ name: entry.name, kind: 'dir', files });
      } else if (entry.isFile()) {
        rootFiles.push(entry.name);
        const ext = extname(entry.name).toLowerCase();
        if (sources.has(ext)) {
          acc.total += 1;
          acc.extensionCounts[ext] = (acc.extensionCounts[ext] ?? 0) + 1;
          topLevel.push({ name: entry.name, kind: 'file', files: 1 });
        }
      }
    }

    return {
      topLevel,
      rootFiles,
      sourceFiles: acc.total,
      extensionCounts: acc.extensionCounts,
      packageScripts: await readPackageScripts(root),
      readme: await readReadme(root, rootFiles, opts.readmeMaxChars),
    };
  }

  async exists(root: string, path: string): Promise<boolean> {
    if (!path || isAbsolute(path) || path.split(/[\\/]/).includes('..')) return false;
    try {
      const rootReal = await realpath(root);
      const targetReal = await realpath(join(rootReal, path));
      const rel = relative(rootReal, targetReal);
      if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('..')) {
        return false;
      }
      return (await stat(targetReal)).isFile();
    } catch {
      return false;
    }
  }
}
