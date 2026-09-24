# onion-architecture — reference

Paths are under `server/src/` unless they start with `reviewer-core/` or `test/`.

## Rings

| Ring | Files | May import |
|---|---|---|
| Domain | `reviewer-core/src/**` | zod, `@devdigest/shared`. One network edge, the OpenRouter provider (`llm/openrouter.ts:116,197`); add no other I/O |
| Contracts | `vendor/shared/**`, ports in `adapters.ts` | zod |
| Application | `modules/<m>/service.ts`, `helpers.ts`, `constants.ts`, `import.ts`, `status.ts`, `reviews/run-executor.ts`, `reviews/diff-loader.ts` | domain, contracts, its own repository's type, `platform/{errors,resilience,prompts,run-logger}.ts` |
| Infrastructure | `modules/<m>/repository.ts`, `repository/*.repo.ts`, `adapters/**`, `db/**` | anything inward, vendor SDKs |
| Edge | `modules/<m>/routes.ts`, `app.ts`, `platform/container.ts` (composition root), `platform/{jobs,sse,price-book}.ts` | anything |

`platform/{grounding,prompt,structured}.ts` re-export reviewer-core: import the core directly.

## Grandfathered

The 34 import edges that predate the check, including two added by PR #7 (queries in
`conventions/routes.ts`, a row type in `skills/helpers.ts`), are in
`.dependency-cruiser-known-violations.json`; they are not precedent. Adapter calls in route
handlers are counted in `GRANDFATHERED` in `test/route-adapter-calls.test.ts`: `container.github()`
at `polling/routes.ts:28` and `pulls/routes.ts:38,216,314,337`; `settings/routes.ts:43,80,83`
(`secrets`), `:87` (`github`), `:91` (`llm`). Neither check sees these:

- Services that take the whole `Container` and build their own repository:
  `reviews/service.ts:34-35`, `repos/service.ts:36-37`, `agents/service.ts:55-56`,
  `repo-intel/service.ts:104-105`, `reviews/diff-loader.ts:12`. The cost: faking one needs
  `as never` and a private-field overwrite (`test/repo-intel-facade-degraded.test.ts:23-38`).
- `repo-intel/service.ts` reads `container.config.repoIntelEnabled` 8 times (`:223` onwards).
  New code decides a flag at the edge or takes it as a value.
- `modules/_shared/context.ts:1` hands `FastifyRequest` to `AuthProvider`, which is
  transport-aware by design. No other port gets the request.

## Drizzle

- Transactions: declare `withTransaction<T>(work: () => Promise<T>)` in `adapters.ts`, implement
  it over `db.transaction`, and let repositories read the active handle from
  `AsyncLocalStorage`. An optional `tx` argument fails silently: forget it once, and that query
  runs outside the transaction.

## Fastify

One decorator, `app.decorate('container', …)`. Routes build their module's service
(`skills/routes.ts:83`). A second DI mechanism (awilix, tsyringe) needs an ADR.

## Ports

Seven, each with an adapter and a double in `adapters/mocks.ts`: `LLMProvider` (:58),
`Embedder` (:114), `GitHubClient` (:130), `GitClient` (:254), `CodeIndex` (:299),
`AuthProvider` (:312), `SecretsProvider` (:325).

## When a layer is too much

Skip a mapper, entity or internal port when the mapper copies field for field between identical
shapes; when repository methods only rename ORM calls; when the wrapper costs type-safe joins or
partial selects and buys N+1 queries; or when the module is validation, CRUD and JSON with no
invariant to protect. The repository itself stays: it is the floor.

## The check

`server/.dependency-cruiser.cjs` follows import edges, type-only ones included, across
`server/src` and `reviewer-core/src`; a failure prints the rule, its reason and the edge. It
cannot see a container member call; `test/route-adapter-calls.test.ts` parses every `routes.ts`
for those and fails on one inside a route registration, printing `file:line container.<member>`. After removing a recorded edge, regenerate the baseline with
`pnpm lint:boundaries:baseline`; never regenerate it to absorb a new one.
