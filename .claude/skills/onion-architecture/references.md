# onion-architecture — history, enforcement and sources

This file is for people. [SKILL.md](SKILL.md) and [reference.md](reference.md) are what the
agent reads.

## Version history

| Version | Date | Change |
|---|---|---|
| 2.0.0 | 2026-09-22 | Rewritten from a rule-by-rule audit of v1 against the code; import rules machine-checked by `pnpm lint:boundaries` |
| 1.0.0 | 2026-09-20 | First release, commit `6a80fd1` |

## Why v2

The course lab defines this skill in one sentence: it fixes the layers route → service → domain
through the container, keeps external integrations (git, the index, secrets) in adapters at the
edge, points dependencies inward, and does not let an adapter call be pulled into a route. v1
covered most of that in 28 rules. The audit, with evidence, is in
`docs/onion-architecture-skill-plan.md` §4:

- **10 rules were general knowledge or owned elsewhere**, and were cut or reduced to a line:
  Palermo's dependency rule, the service-locator essay, "validate at the edge", Drizzle's
  `sum()` (in `server/INSIGHTS.md`), the migration workflow (`.claude/rules/db-schema.md`), the
  `.nullish()` trap (`api-contract-house-rules`), and others.
- **7 were stale.** v1 called all of `src/platform/` the edge, but services legitimately import
  `errors`, `resilience` and `prompts`. It called reviewer-core "pure: no network", but its
  OpenRouter provider calls the `openai` SDK and `fetch`. Its list of routes with SQL missed
  `settings/`, `workspace/` and PR #7's new `conventions/`. And its "when not to" section, read
  literally, contradicted the module convention (routes + service + repository).
- **Added:** route handlers calling adapters through container members (the lab's headline rule,
  which v1 never stated); jobs and SSE as edges; the `platform/` split; PR #7's port-taking
  services as the pattern to copy; the boundary check.

Size: v1's `SKILL.md` plus `reference.md` came to 12,449 characters; v2's come to about 7,600.

## What is enforced where

| Rule | Enforced by |
|---|---|
| A route runs no query | `lint:boundaries` (`route-no-db`) |
| A route imports no adapter | `lint:boundaries` (`route-no-adapter-import`) |
| A route calls no adapter through `container.<member>` | the skill, and `pr-self-review` on every `server/**` diff; an import graph cannot see a property access |
| Application code imports no Fastify, Drizzle, `src/db/**` or adapter | `lint:boundaries` (`application-no-framework-or-db`, `application-no-adapter-import`) |
| Application code imports no `JobRunner` or run bus | `lint:boundaries` (`application-no-jobs-or-bus`) |
| Other modules reach application code only as ports | `lint:boundaries` (`application-no-cross-module`); routes may compose (decision D4) |
| Vendor SDKs only under `src/adapters` | `lint:boundaries` (`sdk-only-in-adapters`) |
| reviewer-core imports only the shared contracts from `server/` | `lint:boundaries` (`core-no-server`) |
| No cycles | `lint:boundaries` (`no-circular`) |
| A new service takes ports, not `Container`; every adapter has a double | the skill |

The check recorded 34 known violations when it was introduced. It was proved on planted edges:
three at once failed it with exit code 3 and a fourth alone with exit code 1 (depcruise exits
with the error count), each named by rule; it passed again after every revert. The
ADR lives outside the repo, in the course workspace: `decisions/2026-09-22-onion-boundary-enforcement.md`.

## Verification status

The evals are deferred to a later course module. Their spec is `docs/onion-architecture-skill-plan.md`
§6: six coding tasks graded on the diff, 20 trigger queries, and arms for no skill, v1 (commit
`6a80fd1`) and v2. Until those run, a rule's "general knowledge" class is judgement, not
measurement.

## Design rules

Carried over from the rebuild of the reviewer skills (`docs/skills/api-contract-house-rules/README.md`)
and from `skill-creator`:

1. Only what a model cannot infer from the diff: repo facts with a `file:line`.
2. An exception lives inside its rule. There is no global "do not flag" section.
3. No severity words; `pr-self-review` grades findings.
4. Explain why instead of writing MUST.
5. A rule the existing code breaks binds new code only, and says so.
6. One authoritative contract per boundary: the config owns the import rules, and the skill
   points to it.

## Sources

Research: `PROJECTS/NEO/knowledge/market-watch/2026-09-20_onion-architecture-ts-backend.md`
(with its 2026-09-22 follow-up), and the
[NotebookLM notebook](https://notebooklm.google.com/notebook/d6ae5ad4-54a9-45c9-9e8f-8ca45d3db040)
(30 sources). Every link below returned HTTP 200 on 2026-09-22, except Medium, which refuses
scripts and opens in a browser.

**The pattern**

- Jeffrey Palermo, The Onion Architecture:
  [part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/),
  [2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/),
  [3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/),
  [4](https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/)
- Alistair Cockburn, [Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/)
- Milan Jovanović, [Clean vs Onion vs Hexagonal](https://milanjovanovic.tech/blog/clean-architecture-vs-onion-vs-hexagonal):
  background jobs as entry points
- Herberto Graça, [Onion Architecture](https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85)

**Composition and DI**

- Mark Seemann, [Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/),
  [Service Locator is an Anti-Pattern](https://blog.ploeh.dk/2010/02/03/ServiceLocatorisanAnti-Pattern/)
- [fastify/help#284: dependency injection](https://github.com/fastify/help/issues/284);
  Fastify [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/),
  [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/)

**TypeScript practice**

- [Vertical Slicing & Clean Architecture: A Practical Guide](https://gist.github.com/RezaOwliaei/477ed74fc77aa5df2a854789538dd79d):
  import tables per layer, the outbox pattern, SSE through an event port
- [nikolovlazar/nextjs-clean-architecture](https://github.com/nikolovlazar/nextjs-clean-architecture)
- [Sairyss/domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon): the full
  layout, declined because it would restructure every module

**Drizzle and transactions**

- [Drizzle: transactions](https://orm.drizzle.team/docs/transactions)
- Sentry, [Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/)
- [drizzle-orm#2777: implicit transaction context](https://github.com/drizzle-team/drizzle-orm/discussions/2777)
- Node.js, [AsyncLocalStorage](https://nodejs.org/api/async_context.html)

**Testing**

- [Testing Repository Adapters With Hexagonal Architecture](https://dzone.com/articles/testing-repository-adapters-with-hexagonal-architecture)
- [Testcontainers for Node.js](https://testcontainers.com/guides/getting-started-with-testcontainers-for-nodejs/)

**The counterweight**

- Three Dots Labs, [Is Clean Architecture Overengineering?](https://threedots.tech/episode/is-clean-architecture-overengineering/)
- CodeOpinion, [Avoiding the Repository Pattern with an ORM](https://codeopinion.com/avoiding-the-repository-pattern-with-an-orm/)
- Ardalis, [Clean Architecture Sucks](https://ardalis.com/clean-architecture-sucks/)

**Enforcement**

- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser):
  [rules tutorial](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-tutorial.md),
  [rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md),
  [CLI, baseline and `--ignore-known`](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md)
- [Make Coding-Agent Patches Prove They Respect Module Boundaries](https://codingagentguide.com/posts/architecture-boundary-tests-for-coding-agent-patches/):
  one contract, test the test, never edit the contract to go green
- [ArchUnitTS](https://github.com/LukasNiessen/ArchUnitTS) and
  [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries), the
  alternatives weighed in the ADR

**Writing the skill**

- Anthropic, [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator)
