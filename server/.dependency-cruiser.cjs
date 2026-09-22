/**
 * Onion boundaries for the backend. The rules are the machine-checked half of the
 * `onion-architecture` skill (.claude/skills/onion-architecture); the skill says where code
 * goes, this file proves it stayed there. ADR: ../decisions/2026-09-22-onion-boundary-enforcement.md
 *
 * Run: `pnpm lint:boundaries`. Edges that predate the rules are recorded in
 * `.dependency-cruiser-known-violations.json` and skipped; any new edge fails.
 * Never edit a rule or the known-violations file to make a change pass — a policy change is
 * its own reviewed diff. Regenerate the baseline (`pnpm lint:boundaries:baseline`) only after
 * fixing a recorded edge.
 */

/** Application files: everything in a module except its edge (routes) and its repository. */
const APPLICATION = '^src/modules/[^/]+/';
const NOT_APPLICATION = [
  '/routes\\.ts$',
  '/repository\\.ts$',
  '/repository/',
  '\\.repo\\.ts$',
  '^src/modules/index\\.ts$',
  '^src/modules/_shared/',
];

/** An npm package, whether resolved flat or through pnpm's `.pnpm/<id>/node_modules/` store. */
const npm = (names) => `node_modules/(${names})/`;

/** Vendor SDKs that only adapters (and src/db for postgres) may import. */
const VENDOR_SDK = npm(
  'openai|@anthropic-ai/sdk|octokit|@octokit|simple-git|@ast-grep/napi|postgres|dependency-cruiser|graphology|graphology-metrics|js-tiktoken|@vscode/ripgrep',
);

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'route-no-db',
      comment:
        'A route handler parses, calls a service and maps the result. Queries belong in the ' +
        "module's repository.",
      severity: 'error',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: { path: [npm('drizzle-orm'), '^src/db/'] },
    },
    {
      // Guards the import shape only. Routes reach adapters as container members
      // (`container.github()`, `container.secrets`), which are property accesses, not
      // import edges, so this graph cannot see them. That rule lives in the
      // onion-architecture skill, and pr-self-review applies it to server/** diffs.
      name: 'route-no-adapter-import',
      comment:
        'A route never reaches an adapter directly; external I/O goes through a service and a port.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'application-no-framework-or-db',
      comment:
        'Application code (services and their helpers) depends on ports and contracts, not on ' +
        'Fastify, Drizzle, the schema or row types.',
      severity: 'error',
      from: { path: APPLICATION, pathNot: NOT_APPLICATION },
      to: { path: [npm('fastify|drizzle-orm'), '^src/db/'] },
    },
    {
      name: 'application-no-adapter-import',
      comment:
        'Application code reaches external systems through a port in src/vendor/shared/adapters.ts, ' +
        'wired in src/platform/container.ts — not by importing an adapter.',
      severity: 'error',
      from: { path: APPLICATION, pathNot: NOT_APPLICATION },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'application-no-jobs-or-bus',
      comment:
        'A job is an entry point and the run bus belongs to the SSE edge: application code enqueues ' +
        'through container.jobs and publishes run events through platform/run-logger.',
      severity: 'error',
      from: { path: APPLICATION, pathNot: NOT_APPLICATION },
      to: { path: '^src/platform/(jobs|sse)\\.ts$' },
    },
    {
      name: 'application-no-cross-module',
      comment:
        "Application code receives another module as a port. Only a module's routes.ts (the edge) " +
        "may import another module's service to compose it.",
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/', pathNot: NOT_APPLICATION },
      to: { path: '^src/modules/[^/]+/', pathNot: ['^src/modules/$1/', '^src/modules/_shared/'] },
    },
    {
      name: 'sdk-only-in-adapters',
      comment: 'Vendor SDKs are imported only under src/adapters (and src/db for postgres).',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/(adapters|db)/' },
      to: { path: VENDOR_SDK },
    },
    {
      name: 'core-no-server',
      comment:
        'reviewer-core is the domain: from server/ it imports only the shared contracts ' +
        '(@devdigest/shared, which live in src/vendor/shared).',
      severity: 'error',
      from: { path: '^\\.\\./reviewer-core/' },
      to: { path: '^src/', pathNot: '^src/vendor/shared/' },
    },
    {
      name: 'no-circular',
      comment: 'A cycle hides which side is the inner ring.',
      severity: 'error',
      from: { path: '^(src|\\.\\./reviewer-core/src)/' },
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.mjs', '.cjs', '.json', '.d.ts'],
    },
  },
};
