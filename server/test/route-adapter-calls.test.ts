import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * Onion boundary the import graph cannot see: a route handler never calls an
 * adapter. Routes reach adapters as container members (`container.github()`,
 * `app.container.secrets`), which are property accesses, not imports, so
 * `pnpm lint:boundaries` (dependency-cruiser) is blind to them. This test parses
 * every `src/modules/<m>/routes.ts` and fails on an adapter member used inside a
 * route registration (its options and handler). Handing an adapter to a
 * service's ports while building the service at plugin level is wiring, not a
 * call, and passes (`conventions/routes.ts`).
 *
 * Rule: .claude/skills/onion-architecture, step 2.
 * Known limit: an alias (`const c = container; c.github()`) is not followed.
 */

/** Container members that are adapters. `auth` is left out: `getContext` hands it the request by design. */
const ADAPTER_MEMBERS = new Set([
  'github',
  'git',
  'codeIndex',
  'embedder',
  'secrets',
  'llm',
  'depgraph',
  'tokenizer',
]);

const ROUTE_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all']);

/**
 * Handler calls that predate the rule, by file and member. Don't add to this
 * list: move the call into a service behind a port. When you remove one, lower
 * its count here — the last test fails until you do, so the list stays exact.
 */
const GRANDFATHERED: Record<string, Record<string, number>> = {
  'pulls/routes.ts': { github: 3 },
  'polling/routes.ts': { github: 1 },
  'settings/routes.ts': { secrets: 3, github: 1, llm: 1 },
};

const MODULES_DIR = fileURLToPath(new URL('../src/modules/', import.meta.url));

interface AdapterCall {
  member: string;
  line: number;
}

function isContainer(expr: ts.Expression): boolean {
  return (
    (ts.isIdentifier(expr) && expr.text === 'container') ||
    (ts.isPropertyAccessExpression(expr) && expr.name.text === 'container')
  );
}

/** The parts of a route registration that run per request: everything after the path. */
function routeRegistrationParts(node: ts.Node): readonly ts.Node[] {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return [];
  const method = node.expression.name.text;
  const [first, ...rest] = node.arguments;
  if (!first) return [];
  if (ROUTE_METHODS.has(method) && ts.isStringLiteralLike(first) && first.text.startsWith('/')) {
    return rest;
  }
  if (method === 'route' && ts.isObjectLiteralExpression(first)) return [first];
  return [];
}

function findAdapterCallsInHandlers(source: string, fileName = 'routes.ts'): AdapterCall[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const calls: AdapterCall[] = [];

  const collect = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ADAPTER_MEMBERS.has(node.name.text) &&
      isContainer(node.expression)
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      calls.push({ member: node.name.text, line: line + 1 });
    }
    ts.forEachChild(node, collect);
  };

  const visit = (node: ts.Node): void => {
    const parts = routeRegistrationParts(node);
    if (parts.length > 0) {
      parts.forEach(collect);
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return calls;
}

function countByMember(calls: AdapterCall[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { member } of calls) counts[member] = (counts[member] ?? 0) + 1;
  return counts;
}

function routeFiles(): string[] {
  return readdirSync(MODULES_DIR)
    .map((m) => `${m}/routes.ts`)
    .filter((f) => existsSync(MODULES_DIR + f))
    .sort();
}

function scanFile(file: string): AdapterCall[] {
  return findAdapterCallsInHandlers(readFileSync(MODULES_DIR + file, 'utf8'), file);
}

describe('route handlers call no adapter', () => {
  it('scans every module route file', () => {
    const files = routeFiles();
    expect(files).toEqual(expect.arrayContaining(Object.keys(GRANDFATHERED)));
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it('finds no adapter call in a route handler beyond the grandfathered ones', () => {
    const excess: string[] = [];
    for (const file of routeFiles()) {
      const calls = scanFile(file);
      const allowed = GRANDFATHERED[file] ?? {};
      for (const [member, count] of Object.entries(countByMember(calls))) {
        if (count > (allowed[member] ?? 0)) {
          for (const c of calls.filter((x) => x.member === member)) {
            excess.push(`src/modules/${file}:${c.line} container.${member}`);
          }
        }
      }
    }
    expect(
      excess,
      'A route handler calls an adapter. Move the call into a service that takes the adapter as a port ' +
        '(see .claude/skills/onion-architecture). Do not raise GRANDFATHERED to make this pass.',
    ).toEqual([]);
  });

  it('still sees exactly the grandfathered calls, so the scanner is not blind', () => {
    for (const [file, expected] of Object.entries(GRANDFATHERED)) {
      expect(
        countByMember(scanFile(file)),
        `${file}: the grandfathered calls changed. Removed one? Lower its count. Added one? Move it into a service instead`,
      ).toEqual(expected);
    }
  });
});

describe('findAdapterCallsInHandlers', () => {
  const members = (src: string) => findAdapterCallsInHandlers(src).map((c) => c.member);

  it('flags a destructured container call inside a handler', () => {
    const src = `
      export default async function r(appBase) {
        const app = appBase.withTypeProvider();
        const { container } = app;
        app.get('/x', { schema: {} }, async (req) => {
          const gh = await container.github();
          return gh.listPullRequests();
        });
      }`;
    expect(members(src)).toEqual(['github']);
  });

  it('flags app.container access and a call inside a nested helper of the handler', () => {
    const src = `
      app.post('/keys', async (req) => {
        const save = async () => app.container.secrets.set('k', 'v');
        await save();
      });`;
    expect(members(src)).toEqual(['secrets']);
  });

  it('flags a handler passed through route({ handler })', () => {
    const src = `app.route({ method: 'GET', url: '/y', handler: async () => container.llm('openai') });`;
    expect(members(src)).toEqual(['llm']);
  });

  it('passes wiring at plugin level, where an adapter becomes a service port', () => {
    const src = `
      const { container } = app;
      const service = new ConventionsService({
        readRepoFile: (ref, path) => container.git.readFile(ref, path),
        llm: (provider) => container.llm(provider),
      });
      app.get('/repos/:id/conventions', async (req) => service.list(req.params.id));`;
    expect(members(src)).toEqual([]);
  });

  it('ignores non-route calls and non-adapter members', () => {
    const src = `
      cache.get('key', () => container.github());
      app.get('/z', async () => {
        await container.jobs.enqueue('x', async () => {});
        container.runBus.publish('run', {});
        return container.repoIntel.status();
      });`;
    expect(members(src)).toEqual([]);
  });
});
