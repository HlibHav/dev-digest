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

## Good / bad

Bad — the field is renamed, and every deployed caller reading \`cost_usd\` gets
\`undefined\`:

\`\`\`ts
// before
return { id: run.id, cost_usd: run.costUsd };
// after
return { id: run.id, cost: run.costUsd };
\`\`\`

Good — add the new name, keep the old one for one release, and say when it goes:

\`\`\`ts
return {
  id: run.id,
  cost: run.costUsd,
  /** @deprecated use \`cost\`; removed in v3. */
  cost_usd: run.costUsd,
};
\`\`\`

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


const RESPONSE_SCHEMA = `# Response schema discipline

The response body is the half of the contract a caller cannot validate before
it ships. Read every change to the SHAPE of what a route returns, separately
from whether the code is correct.

## Flag

- A field that disappears, is renamed, or moves to a nested object.
- A field whose type changes — \`string\` → \`number\`, scalar → array, object →
  array of objects.
- A field that becomes nullable or optional when callers dereference it today.
- An enum that gains a member a caller's exhaustive \`switch\` does not handle.
- A list that changes shape — bare array → \`{ items, next_cursor }\`.
- A schema changed in \`server\` without the matching edit in the vendored client
  copy: the two are hand-mirrored, so one alone is a silent drift.

## How to report

Quote the zod schema before and after, and name one consumer that reads the
field — a hook, a component, an e2e flow. "Some client might" is not a finding.

## Good / bad

Bad — a nullable widening with no caller change. Every \`score.toFixed(1)\`
now throws:

\`\`\`ts
export const RunStats = z.object({ score: z.number() });        // before
export const RunStats = z.object({ score: z.number().nullish() }); // after
\`\`\`

Good — widen the type AND say what reads it, so the caller is fixed in the
same diff:

\`\`\`ts
export const RunStats = z.object({ score: z.number().nullish() });
// client/…/ScoreBadge.tsx: score == null ? "—" : score.toFixed(1)
\`\`\`

## Severity

- \`critical\` — a removed, renamed or retyped field on an existing route.
- \`warning\` — a new nullable, a new enum member, or a server/client mirror drift.
- \`suggestion\` — a shape that is compatible but inconsistent with sibling routes.

## Do not flag

A field added as optional to a response. Callers that do not know it ignore it.`;

const SEMVER_DISCIPLINE = `# Semver discipline

Decide what the change costs a consumer, and say which version bump it forces.
The question is never "how big is the diff" — it is "what breaks if someone
upgrades without reading".

## The rule

- **major** — an existing caller that changes nothing now behaves differently or
  fails: a removed or renamed field, a new required input, a narrowed type, a
  changed status code, a changed default that alters an outcome.
- **minor** — new capability, nothing existing moves: a new route, a new
  optional field, a new enum member on INPUT only.
- **patch** — behaviour already documented, now actually true: a bug fix with no
  shape change.

Route a version bump by the WORST change in the diff. One major forces a major,
however many minors surround it.

## How to report

State the bump the diff forces, quote the single change that forces it, and say
whether the version in \`package.json\` matches. A diff that earns a major and
bumps a patch is itself the finding.

## Good / bad

Bad — a major change shipped as a patch, so consumers upgrade silently:

\`\`\`diff
- "version": "2.4.1",
+ "version": "2.4.2",
- app.get('/repos/:id/pulls', …)
+ app.get('/repos/:id/pull-requests', …)
\`\`\`

Good — the bump matches the worst change, and the reason is written down:

\`\`\`diff
- "version": "2.4.1",
+ "version": "3.0.0",
  # CHANGELOG: BREAKING — /repos/:id/pulls is now /repos/:id/pull-requests.
\`\`\`

## Severity

- \`critical\` — a major-forcing change released as minor or patch.
- \`warning\` — a minor-forcing change released as patch.
- \`suggestion\` — the bump is right but the changelog does not say why.

## Do not flag

An internal refactor behind an unchanged public surface — that is a patch, and
a patch is what it should get.`;

const DEPRECATION_POLICY = `# Deprecation policy

Removing something is easy and the cost lands on someone else. A public surface
leaves in two steps, never one: announce, then remove — with a release in
between so callers can move.

## Flag

- A public export, route, field, or config key deleted in the same release it
  was first called unwanted.
- A \`@deprecated\` marker with no replacement named and no removal version.
- A replacement shipped with no deprecation on the thing it replaces, so two
  ways to do one thing exist with nothing saying which wins.
- A deprecation whose stated removal version has passed and which is still here.

## The shape of a good deprecation

1. The replacement exists and works.
2. The old surface keeps working and says, in one line, what to use instead and
   when it disappears.
3. Removal happens in a later release, and the changelog names it.

## Good / bad

Bad — the field is simply gone, and the caller finds out in production:

\`\`\`ts
export const PrMeta = z.object({
-  head_sha: z.string(),
+  head_ref: z.string(),
});
\`\`\`

Good — both exist for one release, the marker names the replacement AND the
removal, so the next reviewer can delete it with confidence:

\`\`\`ts
export const PrMeta = z.object({
  head_ref: z.string(),
  /** @deprecated use \`head_ref\`. Removed in v3.0. */
  head_sha: z.string(),
});
\`\`\`

## Severity

- \`critical\` — a silent removal of a public surface.
- \`warning\` — a \`@deprecated\` with no replacement or no removal version.
- \`suggestion\` — a deprecation past its stated removal date.

## Do not flag

Deleting something that was never exported, or that the same diff introduced.`;

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
    name: 'breaking-change',
    description:
      'Flag any change to an existing route that breaks a deployed caller — required fields, removed or renamed fields, narrowed types, changed status codes — and give the compatible alternative.',
    type: 'rubric',
    body: BREAKING_CHANGE_GATE,
  },
  {
    name: 'response-schema',
    description:
      'Read every change to the SHAPE of a response — removed, renamed, retyped or newly-nullable fields — and name the consumer that breaks.',
    type: 'rubric',
    body: RESPONSE_SCHEMA,
  },
  {
    name: 'semver-discipline',
    description:
      'State which version bump the diff forces, routed by its worst change, and flag a release whose version does not match.',
    type: 'rubric',
    body: SEMVER_DISCIPLINE,
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
  // The fourth skill, `deprecation-policy`, ships as a file under
  // `docs/skills/` and is added through the Skills importer instead of the
  // seed — so at least one linked skill has "imported" provenance.
  'API Contract Reviewer': ['breaking-change', 'response-schema', 'semver-discipline'],
};
