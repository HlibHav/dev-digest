import type { SkillType } from '@devdigest/shared';

/**
 * Built-in skills used by the seed.
 *
 * A skill is reusable review guidance: text that is appended to an agent's
 * prompt as its own block, in the order the agent lists it. These four are
 * written against THIS repo's stack — vitest, `*.it.test.ts`, testcontainers,
 * Fastify routes with zod schemas, snake_case JSON contracts — because a rule
 * that names the project's own conventions produces findings a reviewer can act
 * on, while a generic one produces advice.
 *
 * Bodies live here as string constants rather than being read from
 * `.claude/skills/**` at seed time: those files are the *coding session's*
 * skills, they do not ship in a deployed container, and the seed must not
 * depend on the repo layout. Importing them into DevDigest is what the import
 * flow is for.
 *
 * The `description` is the skill's interface — what a router or a human reads
 * to decide whether the skill applies — so each one is phrased directively.
 */

export interface SeedSkill {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

const BRANCH_COVERAGE_GATE = `# Branch coverage gate

Every conditional the diff adds or changes needs a test for each side of it.

## Flag

- A new \`if\`, \`else\`, ternary, \`switch\` case, \`??\`, \`||\` or optional-chaining
  fallback whose alternative path no test exercises.
- A new \`throw\` or early \`return\` guard with no test that triggers it.
- A \`catch\` block that the tests never enter. An untested \`catch\` is where a
  swallowed error lives.
- A new exported function with no test at all.

## How to report

Cite the exact \`path:line\` of the uncovered branch, name the input that would
reach it, and say which existing test file the case belongs in
(\`*.test.ts\` for unit, \`*.it.test.ts\` for anything needing Postgres).

## Severity

- \`critical\` — an untested branch that swallows an error or skips a security or
  tenancy check.
- \`warning\` — an untested branch in changed business logic.
- \`suggestion\` — an untested branch in formatting, logging or display code.

## Do not flag

Branches the diff only moved or reindented, and defensive branches that cannot
be reached from a public entry point.`;

const TEST_SMELLS = `# Test smells

Judge what a test would catch if the code under it broke. A test that cannot
fail is worse than no test: it reports safety that does not exist.

## Flag

- **Assertion-free test.** A test whose body only calls the code, or whose only
  assertion is \`expect(x).toBeDefined()\` / \`not.toBeNull()\`. On a Drizzle row a
  missing column reads as \`undefined\`, so \`not.toBeNull()\` passes before the
  feature exists — assert a value or a type instead.
- **Over-mocking.** The unit under test is mocked, or so much is mocked that the
  test only proves the mocks were called. Mocking the module you are testing, or
  asserting on \`mock.calls\` where a real return value was available, both
  qualify.
- **Testing the mock.** An assertion that only restates what the stub was told to
  return.
- **Shared mutable fixture.** A module-level object mutated inside \`it\`, so the
  tests pass in file order and fail alone.
- **Flake sources.** \`Date.now()\` or \`new Date()\` without a fixed clock, a real
  \`setTimeout\` wait instead of awaiting the thing itself, randomness with no
  seed, reliance on object key order, a hardcoded port, or a test that depends on
  a previous test having written a row.
- **Snapshot as the only assertion** for behaviour that has a specific expected
  value.

## How to report

Quote the assertion (or the missing one) with its \`path:line\` and state the
change to the production code that this test would not catch. That sentence is
the finding: without it you are reporting style.

## Severity

- \`critical\` — a test that cannot fail guarding security, tenancy or money.
- \`warning\` — over-mocking or an assertion-free test in changed logic.
- \`suggestion\` — naming, shared fixtures, and flake sources that are unlikely to
  fire.

## Do not flag

A deliberate smoke test that says so, and \`expect(...).not.toThrow()\` where not
throwing is the actual contract.`;

const BREAKING_CHANGE_GATE = `# Breaking change gate

A route's shape is a contract with every client already deployed. Flag a diff
that changes what an existing caller must send or can expect.

## Flag

- **Request:** a new required field; a field that becomes required; a removed or
  renamed field; a narrowed type or enum; a stricter validator on an existing
  field; a changed path or method; a new required header or query parameter.
- **Response:** a removed or renamed field; a widened type where \`null\` becomes
  possible; a changed status code, including a 200 that becomes 201 or 204; a
  changed error \`code\`; a changed shape of a list (array → paginated object).
- **Defaults:** a changed default value that alters behaviour for a caller that
  sends nothing.
- **Semantics:** the same request now does something materially different —
  deletes where it archived, or applies a limit it did not apply before.

## How to report

Name the route and method, quote the old and the new shape, say which caller
breaks (client hook, e2e flow, CI runner, or an external consumer), and give the
compatible alternative: add the field as optional, add a new route, or keep
accepting the old name for one release.

## Severity

- \`critical\` — a removed or renamed field, a new required field, or a changed
  status code on a route that exists in the default branch.
- \`warning\` — a narrowed type, a stricter validator, or a changed default.
- \`suggestion\` — a change that is compatible today but pins the design into a
  corner.

## Do not flag

A route the diff itself introduces — nothing calls it yet.`;

const API_CONTRACT_CONVENTIONS = `# API contract conventions

The rules a route in this repo follows. Judge the changed route against them.

## Rules

1. **Every route has a zod schema.** \`params\`, \`body\` and \`querystring\` are
   validated at the edge through \`fastify-type-provider-zod\`. A handler that
   reads \`req.body\` without a schema is unvalidated input.
2. **A \`:id\` that addresses a row uses \`IdParams\`** (uuid), so a malformed id is
   a 422 at the edge, not a 500 from the database. A \`:id\` that is a name (a
   provider, a section) uses its own enum schema.
3. **JSON fields are snake_case** (\`head_sha\`, \`cost_usd\`, \`skill_ids\`), while
   Drizzle properties are camelCase. The mapping happens in a helper, not inline
   in the handler.
4. **A zod schema and its inferred type share one PascalCase name.**
5. **Workspace scoping is not optional.** Every handler resolves
   \`getContext(container, req)\` first and every query filters by the workspace.
   A row fetched by id alone is a cross-tenant read.
6. **Missing is 404, invalid is 422.** The service returns \`undefined\`, the route
   throws \`NotFoundError\`. Errors serialise as \`{ error: { code, message } }\`.
7. **\`POST\` that creates returns 201.**
8. **Contract types are shared.** A new field belongs in
   \`server/src/vendor/shared/contracts/\` and must be mirrored to the client copy
   in the same change.

## How to report

Name the rule, cite \`path:line\`, and show the corrected signature. One finding
per rule broken.

## Severity

- \`critical\` — missing workspace scoping, or a body used with no schema.
- \`warning\` — a wrong status code, a missing \`IdParams\`, or a contract changed on
  one side only.
- \`suggestion\` — naming and casing.

## Do not flag

\`pulls/\`, \`polling/\`, \`settings/\` and \`workspace/\` for keeping SQL in
\`routes.ts\` — that is grandfathered and documented.`;

export const SEED_SKILLS: readonly SeedSkill[] = [
  {
    name: 'branch-coverage-gate',
    description:
      'Flag every conditional a diff adds whose alternative path no test exercises, and name the test file the case belongs in.',
    type: 'rubric',
    body: BRANCH_COVERAGE_GATE,
  },
  {
    name: 'test-smells',
    description:
      'Flag assertion-free tests, over-mocking, shared mutable fixtures and flake sources; for each one, state the production change the test would not catch.',
    type: 'convention',
    body: TEST_SMELLS,
  },
  {
    name: 'breaking-change-gate',
    description:
      'Flag any change to an existing route that breaks a deployed caller — required fields, removed or renamed fields, narrowed types, changed status codes — and give the compatible alternative.',
    type: 'rubric',
    body: BREAKING_CHANGE_GATE,
  },
  {
    name: 'api-contract-conventions',
    description:
      'Check a changed route against this repo’s API rules: zod schema at the edge, IdParams for uuid routes, snake_case JSON, workspace scoping, 404 vs 422, 201 on create, contracts mirrored to the client.',
    type: 'convention',
    body: API_CONTRACT_CONVENTIONS,
  },
];

/** Which seeded skills each seeded agent links, in prompt order. */
export const SEED_AGENT_SKILLS: Readonly<Record<string, readonly string[]>> = {
  'Test Quality Reviewer': ['branch-coverage-gate', 'test-smells'],
  'API Contract Reviewer': ['breaking-change-gate', 'api-contract-conventions'],
};
