---
name: onion-architecture
description: Keeps DevDigest's backend onion intact — dependencies point inward, the core stays framework-free, external I/O goes through ports. Use before adding or changing anything in server/src/modules, server/src/adapters, server/src/platform/container.ts or reviewer-core/src; when deciding where a piece of code belongs; and when a change needs a new external dependency, a new module, or a new database query. Also triggers on "onion", "hexagonal", "ports and adapters", "layering", "boundaries", "where does this go", "new module", "куди покласти".
---

# onion-architecture

1. **Place the change before editing it.** Name its ring from the table in [reference.md](reference.md) — core, contracts, application, infrastructure, or edge — and say it out loud. One change that spans rings is several edits, not one.
2. **Check the arrow.** Imports point inward only. `service.ts` imports neither `fastify`, nor `drizzle-orm`, nor `db/schema`, nor any vendor SDK, and no ORM transaction handle appears in its signature; `reviewer-core/` imports nothing from `server/`. A violation in code you are writing is the finding — report it before writing around it.
3. **Name the port before the adapter.** New external I/O (an HTTP API, a CLI, a filesystem, a model provider) gets an interface in `server/src/vendor/shared/adapters.ts` first, then an implementation under `server/src/adapters/<name>/`, then a double in `server/src/adapters/mocks.ts`. An adapter without a test double is unfinished.
4. **Wire at the root, ask for what you need.** Construction belongs to `server/src/platform/container.ts`. A **new** service takes the ports it uses, not the whole `Container` — passing the container is a service locator and costs the seam that makes the service testable. Existing services take `Container`; that is the current wiring, not a defect to report. Secrets only through `container.secrets`, never `process.env`.
5. **Prove it with a hermetic test.** New application code gets a unit test that runs without Docker (`pnpm exec vitest run --exclude '**/*.it.test.ts'`). If faking the dependencies needs `as never` or overwriting a private field, the seam is missing — that is the defect, fix it before the feature.
6. **Don't add a ring you don't need.** Three CRUD routes with no business rule do not earn a repository wrapper over Drizzle. The checkable signs are in *When not to* in [reference.md](reference.md); "skip the ring" is a valid outcome, say so and move on.
7. **Legacy is grandfathered.** `pulls/`, `polling/`, `settings/` and `workspace/` keep SQL in `routes.ts`, and every service takes the whole `Container`. Don't copy either pattern into new code, don't migrate the old code, don't propose migrating it unless asked.
8. **Report** one line: the ring, the direction of the imports you touched, and what proves it.
