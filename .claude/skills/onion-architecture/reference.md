# onion-architecture — reference

## The rule

> All code can depend on layers more central, but code cannot depend on layers further out from
> the core. In other words, all coupling is toward the center.
> — Jeffrey Palermo, *The Onion Architecture: part 1*

Two directions, don't confuse them:

- **Compile-time (imports)** — always inward: edge → infrastructure → application → contracts → core.
- **Runtime (control flow)** — outward and back: a request enters at `routes.ts`, reaches the DB or
  the LLM through an adapter, and returns.

The database is not the center. It is external. Behaviour that crosses outward is declared as an
interface in the inner ring and implemented in the outer one.

## Rings

DevDigest already has these rings; it just doesn't use the word. The vocabulary below maps onto the
files that exist — no renaming, no new folders.

| The change concerns | Ring | Files | May import |
|---|---|---|---|
| Prompt assembly, grounding, score, reduce | **Core** | `reviewer-core/src/**` | zod, its own modules. Nothing from `server/` |
| An interface, a zod contract, a shared type | **Contracts (ports)** | `server/src/vendor/shared/adapters.ts`, `vendor/shared/contracts/**` | zod only |
| A business rule, orchestration, a workflow | **Application** | `modules/<m>/service.ts`, `modules/reviews/run-executor.ts`, `helpers.ts`, `status.ts` | core, contracts |
| A query, an SDK call, a schema | **Infrastructure** | `modules/<m>/repository.ts`, `modules/<m>/repository/*.repo.ts`, `src/adapters/**`, `src/db/**` | everything inward |
| A route, DI wiring, app assembly | **Edge** | `modules/<m>/routes.ts`, `src/app.ts`, `src/platform/container.ts` | everything |

`src/platform/` is edge by construction: `container.ts` is the composition root, `jobs.ts` and
`sse.ts` are process-level machinery. `platform/{grounding,prompt,structured}.ts` are re-export
shims over `reviewer-core` — import the core directly in new code.

## Leaks

Each row is real code in this repo, kept as the reference case. ✗ is what exists, ✓ is what a new
change does instead.

| ✗ Leak | Where it lives today | ✓ Instead |
|---|---|---|
| A Drizzle row type in a public application signature — `repo: typeof schema.repos.$inferSelect` | `modules/reviews/run-executor.ts:58` | Declare the shape the application needs, in contracts. A row type couples every caller to the schema |
| Row types as domain types — `AgentRow`, `PullRow`, `FindingRow` crossing the service boundary | `modules/reviews/service.ts:5`, `run-executor.ts:6` | Same: the application names its own input, infrastructure maps to it |
| A service constructing its own repository from a leaked db handle | `reviews/service.ts:35`, `repos/service.ts:37`, `agents/service.ts:55`, `repo-intel/service.ts:105` | Pass the repository in. It is the only seam that makes the service testable |
| A service taking the whole `Container` | every service, plus `modules/reviews/diff-loader.ts` | Repo-wide and grandfathered — this is the current wiring, not a finding to report on existing code. The rule binds a **new** service: take the two or three ports it calls. See *Why not the container* below |
| A feature flag read inside application logic — `container.config.repoIntelEnabled`, 8 times | `modules/repo-intel/service.ts:223,406,419,426,458,579,644,664` | Decide at the edge, or pass the flag in as a value. Config is an outer-ring concern |
| SQL, GitHub sync and DTO assembly inside a route handler (361 lines) | `modules/pulls/routes.ts`, `polling/routes.ts`, `settings/routes.ts`, `workspace/routes.ts` | routes → service → repository. These four are grandfathered; don't copy, don't migrate |
| `FastifyRequest` reaching an adapter | `modules/_shared/context.ts:1` → `adapters/auth/local.ts` | Known, deliberate exception: `AuthProvider` is transport-aware by design. Don't extend the pattern to other ports |

The cost is measurable, not theoretical: `ReviewService`, `RepoService` and `AgentsService` have no
unit tests at all, and the single service-level unit test has to fake a container with three
`as never` casts and then overwrite a private field — `test/repo-intel-facade-degraded.test.ts:23-38`.

### Why not the container

Passing `Container` everywhere is the service-locator anti-pattern. Every service here does it, so
this is background for the next refactor, not a defect to file against existing code — but it is
why a new service asks for its ports. It fails in five named ways:

1. **Opaque signatures** — `new ReviewService(container)` doesn't say what the service uses.
2. **No interface segregation** — the service gets the DB pool, every other repo, and the LLM keys.
3. **Brittle tests** — faking one dependency means assembling a whole container.
4. **Runtime instead of compile-time** — a missing wire is `undefined` at request time, not a type error.
5. **Hidden cycles** — lazy getters resolve cycles silently that explicit construction would surface.

## Per-tool rules

### Drizzle

- The query builder and the `db` handle stop at `repository.ts` / `repository/*.repo.ts`. No
  `select`, `insert`, `eq`, `sql` above that line. Today no service violates this — keep it that way.
- **The service owns the transaction boundary; the repository does not.** Atomicity is a business
  statement ("the run and its findings land together"), so it is decided in the application ring.
- Express it as a callback port — `withTransaction<T>(work: () => Promise<T>): Promise<T>` declared
  in `vendor/shared/adapters.ts`, implemented over `db.transaction` in infrastructure. The ORM
  handle never appears in a service signature. **This port does not exist yet** — declare it when
  the first multi-repository transaction needs it; nothing is stale, nobody has needed it.
- The alternative — an optional `tx` argument on every repository method — is acceptable for a
  single repository, but know the failure mode: forget to thread `tx` through one call and that
  query silently runs **outside** the transaction, with no error and no type complaint.
- Don't export `$inferSelect` / row types from an application module.
- `sum()` returns a string, so money aggregates are written raw as `sql<number | null>`
  (`server/INSIGHTS.md`, evidence `modules/pulls/routes.ts:155`).
- Schema changes go `src/db/schema/*.ts` → `pnpm db:generate` → `pnpm db:migrate`. See
  `.claude/rules/db-schema.md`; never hand-edit migrations.

### Fastify

- `FastifyRequest` / `FastifyReply` stop at `routes.ts`. A service that needs the caller takes
  the resolved value (`workspaceId`), not the request.
- Validate at the edge with the route `schema` and the shared zod contracts. A handler stays thin:
  parse, call one service method, map to a status code.
- Fastify's plugin encapsulation and decorators are a lightweight DI system, and this app uses them
  for exactly one thing: `app.decorate('container', container)`. The composition root is
  `platform/container.ts` — don't introduce a second DI mechanism (`@fastify/awilix`, tsyringe) for
  new code; that is a vendor choice and needs its own ADR.
- Modules are registered statically in `src/modules/index.ts`. No filesystem autoload.

### zod

- HTTP and LLM contracts live in `src/vendor/shared/` and are the canonical copy; the client mirrors
  them by hand. See `.claude/rules/shared-contracts.md`.
- A contract schema is not a domain type. Parse at the edge, then work with the parsed value.
- `Review` and `Finding` double as the LLM structured-output schema sent with `strict: true`, so an
  optional field must be `.nullish()` — `.optional()` silently becomes required.

### External SDKs (openai, @anthropic-ai/sdk, octokit, simple-git, @ast-grep/napi, postgres)

- One rule, currently unbroken: an SDK is imported only under `src/adapters/**` (and `src/db/` for
  `postgres`). Zero SDK imports exist in `src/modules/**` — a new one is a defect, not a shortcut.
- Every adapter has a double in `src/adapters/mocks.ts` implementing the same port. The test that
  proves the boundary holds is a unit test that runs with no Docker and no network.
- Known asymmetry: `repo-intel/service.ts` imports the astgrep adapter's functions directly instead
  of going through the container, and `ContainerOverrides` has no `astgrep` slot. Don't widen it.

## When not to

Adding a ring has a price; these sources are the counterweight and the skill takes them seriously.
Skip the repository or the port when any of this is true:

1. The mapper copies field-for-field between two identical shapes.
2. The repository methods only rename ORM calls — `findActiveWithPaginationAndSort`.
3. The wrapper costs type-safe joins or partial selects, and buys N+1 queries or over-fetching.
4. The module is validation plus CRUD plus JSON, with no invariant to protect.

A module with three CRUD routes and no business rule is finished when it is correct. Saying
"no extra ring here" is a valid outcome of this skill.

## Out of scope

This skill governs code in `server/` and `reviewer-core/`. It does not migrate `pulls/`, `polling/`,
`settings/` or `workspace/`, does not rewire existing services away from `Container`, and does not
propose either unasked. It does not edit
`CLAUDE.md`, `.claude/rules/`, `server/src/db/migrations/`, `server/src/vendor/shared/` without
coordination, or `skills-lock.json`. It does not add a linter, a DI library, or a CI job — boundary
linting is a separate decision with its own ADR (see [references.md](references.md)).
