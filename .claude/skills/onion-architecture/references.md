# onion-architecture — sources and rationale

## The pattern itself

- Jeffrey Palermo — [The Onion Architecture: part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) ·
  [part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) ·
  [part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/) ·
  [part 4, after four years](https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/).
  The dependency rule quoted in `reference.md`, and the tenet that the database is external.
- [Hexagonal architecture — Wikipedia](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)) — Cockburn's
  ports and adapters, the same idea with a different picture.
- Herberto Graça — [Onion Architecture](https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85),
  part of The Software Architecture Chronicles. Places onion next to hexagonal and clean.

## TypeScript and Node practice

- [Sairyss/domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon) — the canonical
  `domain/application/infrastructure` vocabulary with entities, value objects and mappers.
  **This is the alternative we declined**: adopting it would restructure every module, which is an
  ADR, not a documentation change. The skill maps onion onto the names this repo already uses.
- [nikolovlazar/nextjs-clean-architecture](https://github.com/nikolovlazar/nextjs-clean-architecture) —
  a worked TypeScript ports-and-adapters layout with boundary linting.
- ["Vertical Slicing & Clean Architecture: A Practical Guide"](https://gist.github.com/RezaOwliaei/477ed74fc77aa5df2a854789538dd79d) —
  the most concrete source found: per-layer import tables, the composition-root pattern without a DI
  framework, the service-locator failure modes, and the Unit of Work over Drizzle.
- [Hexagonal Architecture and Clean Architecture, with examples](https://dev.to/dyarleniber/hexagonal-architecture-and-clean-architecture-with-examples-48oi)
- [Ports and Adapters with TypeScript](https://betterprogramming.pub/how-to-ports-and-adapter-with-typescript-32a50a0fc9eb)

## Our stack

- Drizzle · [Atomic Repositories in Clean Architecture and TypeScript (Sentry)](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/) —
  the optional-`tx` argument pattern, and why the service owns the transaction boundary.
- Drizzle · [Drizzle ORM best practices](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/)
- Fastify · [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) ·
  [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/) ·
  [The hitchhiker's guide to plugins](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) —
  the plugin system as a lightweight DI container, and why a decorated reference type is shared
  across requests.
- Fastify · [Plugins as building blocks for a backend Node.js API (Snyk)](https://snyk.io/blog/fastify-plugins-for-backend-node-js-api/)

## The counterweight

Read these before adding a layer. The *When not to* section in `reference.md` comes from them.

- [Is Clean Architecture Overengineering? — Three Dots Labs](https://threedots.tech/episode/is-clean-architecture-overengineering/)
- [Avoiding the Repository Pattern with an ORM — CodeOpinion](https://codeopinion.com/avoiding-the-repository-pattern-with-an-orm/)
- [Clean Architecture Sucks — Ardalis](https://ardalis.com/clean-architecture-sucks/)

## Enforcement (not adopted — phase 2)

This repo has no linter in any package; typecheck and tests are the gate. Adding boundary linting is
a dependency, a CI job and a vendor choice, so it needs its own ADR.

- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) — rules over the import graph,
  reports in CI. [Worked example](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b).
- [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) — the same rules
  in the editor, instantly.
- Caveat found during research: neither `eslint-plugin-boundaries` nor `no-restricted-paths` follows
  re-export chains, so a boundary can be bypassed through a barrel file; `no-cycle` is expensive on
  large repos. Worth weighing in the ADR against [ArchUnitTS](https://github.com/LukasNiessen/ArchUnitTS)
  (architecture rules expressed as vitest tests — this repo already runs vitest everywhere, so it
  costs no new CI job), and against Deslop / archprint, which derive rules from the real import graph.

## Research note

Deep research run 2026-09-20 (27 sources found, 20 imported), with the deltas that changed two
decisions here — the god-object container and the transaction port:
`PROJECTS/NEO/knowledge/market-watch/2026-09-20_onion-architecture-ts-backend.md`.
