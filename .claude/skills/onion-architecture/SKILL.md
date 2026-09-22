---
name: onion-architecture
description: Keeps DevDigest's backend an onion — route → service → domain wired in the container; git, GitHub, the code index, secrets and LLMs behind adapters at the edge; imports pointing inward; no adapter call inside a route handler. Use before adding or changing code in server/src/modules, server/src/adapters, server/src/platform or reviewer-core/src — a new endpoint, module, service, integration, background job, SSE stream or query — and when deciding which layer backend code belongs in. Also triggers on "onion", "hexagonal", "ports and adapters", "layers", "where does this go", "куди покласти", "новий модуль", "lint:boundaries". Not for Fastify API details (fastify-best-practices), writing queries (drizzle-orm-patterns) or client/ (frontend-ui-architecture).
metadata:
  version: 2.0.0
---

# onion-architecture

Governs **new and changed** backend code. Code that predates it is [grandfathered](reference.md#grandfathered): don't copy it, and don't migrate it unless asked. `pnpm lint:boundaries` in `server/` machine-checks the import rules; the rules it cannot see are marked *(skill only)*. Sources and history: [references.md](references.md).

1. **Name the layer first.** Route `modules/<m>/routes.ts` → service `modules/<m>/service.ts` → domain `reviewer-core/src`, with contracts in `src/vendor/shared/`. Queries go in the module's repository, external systems in `src/adapters/`. Every other file, `src/platform/` included, is in the [ring table](reference.md#rings).
2. **A route handler parses, calls a service and maps the result.** It runs no query and calls no adapter: not `container.github()`, `.git`, `.codeIndex`, `.secrets`, `.llm` or `.embedder` *(skill only — a container member is not an import)*. Anything more can't be reused by a job or tested without Fastify. Handing adapters to a service's ports while building it in `routes.ts` is wiring, not a call (`conventions/routes.ts:71,76`).
3. **Imports point inward.** Application files (a service, `run-executor.ts`, helpers) import no `fastify`, `drizzle-orm`, `src/db/**` (schema or row types) and no adapter. `reviewer-core` imports nothing from `server/` except `@devdigest/shared`. A route may import another module's `service.ts` to compose it; application code gets other modules only as ports.
4. **New I/O is port → adapter → double.** The interface goes in `src/vendor/shared/adapters.ts`, the implementation in `src/adapters/<name>/` (the only place a vendor SDK is imported), a double in `src/adapters/mocks.ts`, and `src/platform/container.ts` exposes it. An adapter without a double is unfinished. Secrets come only from `container.secrets`.
5. **A new service takes the ports it uses, not `Container`.** Copy `SkillsService(repo)` (`skills/service.ts:56`) or `ConventionsService(ports)` (`conventions/service.ts:77`); the whole-`Container` services are grandfathered.
6. **Jobs and streams are edges.** A background job runs on `container.jobs` and calls a service, as a route does. Run events leave through `platform/run-logger.ts`; the SSE route subscribes to `container.runBus`.
7. **Atomicity belongs to the service.** A write that spans two repositories gets a `withTransaction(work)` port, not Drizzle's `tx` in service signatures. None exists yet; the first caller adds it ([how](reference.md#drizzle)).
8. **Add no layer the module doesn't need.** routes → service → repository is the floor; a mapper, entity, internal port or DI library goes above it only to protect a rule ([signs](reference.md#when-a-layer-is-too-much)).
9. **Prove it, then report.** In `server/`, run `pnpm lint:boundaries` and the unit tests. A new service is tested with `mocks.ts` doubles and no Docker; needing `as never` means a seam is missing. If the boundary check fails, fix the code, never `.dependency-cruiser.cjs` or its baseline. Report in one line: the layer, the imports you added and their direction, and the check result.
