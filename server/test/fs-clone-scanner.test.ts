import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CloneScanOptions } from '@devdigest/shared';
import { FsCloneScanner } from '../src/adapters/clone-scan/fs-clone-scanner.js';

const OPTS: CloneScanOptions = {
  sourceExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  excludedDirs: ['node_modules', 'dist', '.git'],
  readmeMaxChars: 20,
};

let root: string;
let outside: string;
const scanner = new FsCloneScanner();

async function put(rel: string, body = 'x'): Promise<void> {
  const full = join(root, rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, body);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'scan-root-'));
  outside = await mkdtemp(join(tmpdir(), 'scan-out-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe('FsCloneScanner', () => {
  it('scan counts top-level dirs recursively, skips excluded dirs and symlinks', async () => {
    await put('src/a.ts');
    await put('src/deep/b.ts');
    await put('src/deep/er/c.ts');
    await put('lib/d.js');
    await put('node_modules/pkg/e.ts');
    await put('dist/f.ts');
    await put('index.ts');
    await writeFile(join(outside, 'z.ts'), 'x');
    await symlink(outside, join(root, 'linked'));
    await symlink(join(outside, 'z.ts'), join(root, 'link.ts'));

    const scan = await scanner.scan(root, OPTS);
    const byName = Object.fromEntries(scan.topLevel.map((e) => [e.name, e]));
    expect(byName.src).toEqual({ name: 'src', kind: 'dir', files: 3 });
    expect(byName.lib).toEqual({ name: 'lib', kind: 'dir', files: 1 });
    expect(byName['index.ts']).toEqual({ name: 'index.ts', kind: 'file', files: 1 });
    expect(byName.node_modules).toBeUndefined();
    expect(byName.dist).toBeUndefined();
    expect(byName.linked).toBeUndefined();
    expect(byName['link.ts']).toBeUndefined();
    expect(scan.rootFiles).toEqual(['index.ts']);
    expect(scan.sourceFiles).toBe(5);
  });

  it('sourceFiles counts supported extensions only', async () => {
    for (let i = 0; i < 7; i++) await put(`src/f${i}.ts`);
    await put('docs/a.md');
    await put('README.md', 'hi');

    const scan = await scanner.scan(root, OPTS);
    expect(scan.sourceFiles).toBe(7);
    expect(scan.extensionCounts).toEqual({ '.ts': 7 });
  });

  it('scan reads package.json scripts and README up to readmeMaxChars', async () => {
    await put(
      'package.json',
      JSON.stringify({ scripts: { test: 'vitest', build: 'tsc', bad: 5 } }),
    );
    await put('README.md', 'a'.repeat(100));

    const scan = await scanner.scan(root, OPTS);
    expect(scan.packageScripts).toEqual({ test: 'vitest', build: 'tsc' });
    expect(scan.readme).toBe('a'.repeat(20));
    expect(scan.rootFiles).toEqual(['README.md', 'package.json']);
  });

  it('sourceFiles is 0 for a py-only tree', async () => {
    await put('app/main.py');
    await put('app/util/helpers.py');

    const scan = await scanner.scan(root, OPTS);
    expect(scan.sourceFiles).toBe(0);
    expect(scan.packageScripts).toBeNull();
    expect(scan.readme).toBeNull();
  });

  it('exists rejects traversal, absolute and escaping symlink', async () => {
    await put('src/a.ts');
    await writeFile(join(outside, 'secret.ts'), 'x');
    await symlink(join(outside, 'secret.ts'), join(root, 'src/escape.ts'));

    expect(await scanner.exists(root, 'src/a.ts')).toBe(true);
    expect(await scanner.exists(root, 'src/missing.ts')).toBe(false);
    expect(await scanner.exists(root, 'src')).toBe(false);
    expect(await scanner.exists(root, '../etc/passwd')).toBe(false);
    expect(await scanner.exists(root, 'src/../src/a.ts')).toBe(false);
    expect(await scanner.exists(root, join(root, 'src/a.ts'))).toBe(false);
    expect(await scanner.exists(root, 'src/escape.ts')).toBe(false);
  });

  it('README is read only up to the byte cap, then the readmeMaxChars slice applies', async () => {
    await put('README.md', 'a'.repeat(2 * 1024 * 1024));

    const big = await scanner.scan(root, { ...OPTS, readmeMaxChars: 10_000_000 });
    expect(big.readme).not.toBeNull();
    expect(big.readme!.length).toBeLessThanOrEqual(64 * 1024);
    expect(big.readme!.length).toBeGreaterThan(0);

    const small = await scanner.scan(root, { ...OPTS, readmeMaxChars: 16_000 });
    expect(small.readme).toBe('a'.repeat(16_000));
  });

  it('a package.json over the byte cap yields no scripts and does not throw', async () => {
    const pad = 'x'.repeat(2 * 1024 * 1024);
    await put('package.json', JSON.stringify({ scripts: { test: 'vitest' }, pad }));

    const scan = await scanner.scan(root, OPTS);
    expect(scan.packageScripts).toBeNull();
    expect(scan.rootFiles).toEqual(['package.json']);
  });

  it('the walk stops after the maximum number of entries visited', async () => {
    await mkdir(join(root, 'src'), { recursive: true });
    await Promise.all(
      Array.from({ length: 120 }, (_, i) => writeFile(join(root, 'src', `f${i}.ts`), 'x')),
    );

    const scan = await new FsCloneScanner(100).scan(root, OPTS);
    expect(scan.sourceFiles).toBeLessThanOrEqual(100);
    expect(scan.sourceFiles).toBeGreaterThan(0);
    const src = scan.topLevel.find((e) => e.name === 'src');
    expect(src?.files).toBe(scan.sourceFiles);
  });
});
