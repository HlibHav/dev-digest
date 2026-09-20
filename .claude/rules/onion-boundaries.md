---
paths:
  - "server/src/modules/**"
  - "server/src/adapters/**"
  - "server/src/platform/container.ts"
  - "reviewer-core/src/**"
---

# Onion boundaries

- Imports point inward: `routes.ts` → `service.ts` → `repository*` / adapters. A module never
  imports another module's internals — cross-module work goes through the container or a port.
- `service.ts` imports neither `fastify`, nor `drizzle-orm`, nor `db/schema`, nor a vendor SDK.
  No service does today; the first one that does is a defect, not a precedent.
- The query builder and the `db` handle stop at `repository.ts` / `repository/*.repo.ts`.
  Row types (`AgentRow`, `$inferSelect`) don't travel outward into application signatures.
- The service decides what is atomic. The ORM transaction handle never appears in its signature —
  express the boundary as a callback port, not as a threaded `tx` argument.
- A vendor SDK is imported only under `src/adapters/**` (and `src/db/` for `postgres`), and every
  adapter gets a matching double in `src/adapters/mocks.ts`. An adapter with no double is unfinished.
- Construction belongs to `src/platform/container.ts`. A new service takes the ports it calls, not
  the whole `Container` — passing the container removes the seam and forces `as never` in tests
  (`test/repo-intel-facade-degraded.test.ts:23-38`). Existing services take `Container`; that is
  the current wiring, not a defect to report.
- Secrets only through `container.secrets`, never `process.env` or `AppConfig` directly.
- `reviewer-core/` stays pure: no database, GitHub, filesystem or env access. Anything needing I/O
  belongs in `server`.
- `pulls/`, `polling/`, `settings/` and `workspace/` keep SQL in `routes.ts`. Grandfathered: don't
  copy the pattern into new code, and don't migrate them unless asked.
- Full procedure, the ring table and the per-tool rules: the `onion-architecture` skill.
