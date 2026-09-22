---
paths:
  - "server/src/modules/**"
  - "server/src/adapters/**"
  - "server/src/platform/**"
  - "reviewer-core/src/**"
---

# Onion boundaries

These hold for new and changed code even when the `onion-architecture` skill has not loaded.
`pnpm lint:boundaries` (in `server/`) checks the import rules; its config,
`server/.dependency-cruiser.cjs`, is the source of truth for them.

- A route handler parses, calls a service and maps the result. It runs no query and calls no
  adapter (`container.github()`, `.git`, `.codeIndex`, `.secrets`, `.llm`, `.embedder`). The
  check cannot see container members, so this one is on you.
- Application code (a service and its helpers) imports no `fastify`, `drizzle-orm`, `src/db/**`
  or adapter, and gets other modules only as ports. Vendor SDKs are imported only under
  `src/adapters/**` (and `src/db/` for `postgres`), and every new adapter gets a double in
  `src/adapters/mocks.ts`.
- `reviewer-core/` imports nothing from `server/` except the shared contracts
  (`@devdigest/shared`).
- Code that predates these rules is grandfathered: the import edges are in
  `server/.dependency-cruiser-known-violations.json`, and the rest is listed in the skill's
  `reference.md`. Don't copy it, don't migrate it unless asked, and never edit the config or the
  baseline to get a green run.
