# onion-architecture v2 — rewrite plan

Status: approved 2026-09-22. D1 (option A) and D2 are signed off; the ADR is
`../decisions/2026-09-22-onion-boundary-enforcement.md`. The evals in section 6 are deferred to a
later course module, so D3 falls away and T3/T4 are deferred. D4 is approved as PR #7 does it.
T0 is done: this branch
is `feat/onion-architecture-skill-v2`, cut from `origin/feat/agent-skills` at `fbe264e`, and v1
stays reachable as commit `6a80fd1` for the eval module's baseline arm.

## 1. The ask, and the short answer

Rewrite the Claude Code skill `.claude/skills/onion-architecture` so a coding agent keeps the
backend's onion intact for the tools this repo actually uses, and do it the way the H1 session
rebuilt the reviewer skills: eval-first, with Anthropic's `skill-creator` loop.

Two decisions were taken before this plan (Glib, 2026-09-22):

- **Which skill.** The Claude Code skill (triggered by its description while an agent writes
  code, and routed to by `pr-self-review`). Not a DevDigest reviewer skill stored in the DB.
- **Which direction.** Cut and add. Cut the rules a model already applies without the skill,
  keep the repo-specific ones, and add the tool areas v1 never covered (jobs, SSE, the
  `platform/` split). The skill gets smaller.

What the plan adds on top: a skill can describe the architecture but cannot force it. The
component that forces it is a boundary check, and the tool for it is already installed
(`dependency-cruiser` 17.4.3 is a runtime dependency of `server/`). Whether to wire it up is
decision D1 below and needs an ADR.

## 2. What already exists, and is reused rather than redone

| Asset | Where | State |
|---|---|---|
| v1 of the skill: `SKILL.md` (2,895 chars, 8 steps), `reference.md` (9,554 chars), `references.md` | commit `6a80fd1` on `feat/onion-architecture-skill`, merged into `feat/reviewer-skills` and `feat/agent-skills` | Ships in PR #7 (Homework 2), open |
| Path-scoped rule `.claude/rules/onion-boundaries.md` | same commit | Duplicates most of the skill |
| Deep research, 2026-09-20 | `PROJECTS/NEO/knowledge/market-watch/2026-09-20_onion-architecture-ts-backend.md`, [notebook](https://notebooklm.google.com/notebook/d6ae5ad4-54a9-45c9-9e8f-8ca45d3db040) | 24 sources; 6 more imported today (30 total), see the note's Follow-up |
| The H1 method | `docs/skills/api-contract-house-rules/README.md`, `docs/handoff/2026-09-21-skills-deep-analysis/rebuild/research/r1-skill-authoring.md` (both on `feat/agent-skills`) | Baseline first, keep only what the baseline misses, 48 checked sources |
| `skill-creator` | `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/` | Installed: evals, grader, benchmark viewer, `run_loop.py` for description tuning |
| `dependency-cruiser` 17.4.3 with `depcruise-baseline` and `--ignore-known` | `server/package.json` dependencies; used as a library in `server/src/adapters/depgraph/index.ts:17` | No `.dependency-cruiser.*` config exists, so nothing lints this repo's own imports yet |

Every factual claim v1 makes about the code was re-checked on `main` today; the results are in
section 4.

## 3. The stack, and the onion practice for each tool

"Practice" is what the sources recommend. "Repo fact" is what the skill must carry because a
model cannot infer it from a diff. Only the repo facts go into the skill; the practice column
explains why they matter. Line numbers are on `main` unless marked (PR #7).

| Tool | Ring here | Practice that keeps the onion | Repo fact the skill carries |
|---|---|---|---|
| **Fastify 5**, `fastify-type-provider-zod`, cors/helmet/rate-limit | Edge: `modules/*/routes.ts`, `src/app.ts` | Request and reply objects stop at the handler; the handler parses, calls one application method, maps errors to status codes. Fastify's maintainers recommend plugins and decorators over an external DI container ([fastify/help#284](https://github.com/fastify/help/issues/284)); onion purists additionally keep Fastify types out of services entirely ([Jovanović](https://milanjovanovic.tech/blog/clean-architecture-vs-onion-vs-hexagonal)). | One decorator only, `app.decorate('container', …)`; routes build services per request (`skills/routes.ts:83`, PR #7). `_shared/context.ts:1` is the one sanctioned transport-aware port (`AuthProvider`). No second DI library without an ADR. |
| **zod** and the shared contracts | Contracts | Parse at the boundary; a transport schema is not a domain type. | Contracts live in `src/vendor/shared/` and the client mirrors them by hand. That rule is owned by `.claude/rules/shared-contracts.md`, and the `.nullish()` trap by `api-contract-house-rules`; v2 only points to them. |
| **Drizzle ORM**, `postgres`, `drizzle-kit` | Infrastructure: `repository.ts`, `repository/*.repo.ts`, `src/db/` | The query builder and the `db` handle stop at the repository. The service owns the transaction boundary. Two patterns exist and both leak somewhere: an optional `tx` argument ([Sentry](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/)) runs a query outside the transaction when one call forgets it; an implicit `AsyncLocalStorage` context ([drizzle#2777](https://github.com/drizzle-team/drizzle-orm/discussions/2777), a community proposal, not in Drizzle core) keeps signatures clean but fails on nested or out-of-scope calls. | No transaction exists anywhere today (no `.transaction(`, no `tx:`), so the rule is a trigger: the first multi-repository write declares a `withTransaction` port. Row types leak at `reviews/run-executor.ts:58,141` and `repos/helpers.ts:44`; Drizzle sits outside a repository in `settings/feature-models.ts:1,8`. |
| **openai**, **@anthropic-ai/sdk**, OpenRouter | Port `LLMProvider` in `vendor/shared/adapters.ts`; adapters in `adapters/llm/` | Vendor SDKs only inside adapters, each behind a port the inner ring declares. | The OpenRouter provider lives in the core: `reviewer-core/src/llm/openrouter.ts` calls the `openai` SDK (`:116` on this branch) and `fetch` (`:197`). v1 called reviewer-core "pure: no network", which is false. v2 states the real boundary: no `server/` imports except the shared contracts, no DB, GitHub, filesystem or env, and one network edge. |
| **octokit**, **simple-git**, **@vscode/ripgrep** | Adapters behind `GitHubClient`, `GitClient`, `CodeIndex` | Same as above; test the inner rings with fakes. | All 7 ports in `adapters.ts` have an adapter and a double in `adapters/mocks.ts` (verified today). "An adapter without a double is unfinished" is a live invariant worth keeping. |
| repo-intel toolchain: **@ast-grep/napi**, **dependency-cruiser** (as a library), **graphology**, **js-tiktoken** | Adapters `depgraph`, `tokenizer`, `astgrep` | Same. | Grandfathered leaks: `repo-intel/service.ts:22-28` imports the astgrep adapter directly, contradicting its own header at `:17-18`, and `ContainerOverrides` has no `astgrep` slot; `pipeline/rank.ts:16-17` imports graphology; `service.ts:29` imports `node:fs/promises`; `config.repoIntelEnabled` is read 8 times inside the service. |
| **p-queue** and `JobRunner` (`platform/jobs.ts`) | Process machinery, exposed as `container.jobs` | A job handler is an entry point like a route: it resolves its dependencies and calls the application. Enqueuing from the application goes through a port; for "save and publish" atomicity the sources use an outbox ([Jovanović](https://milanjovanovic.tech/blog/clean-architecture-vs-onion-vs-hexagonal), [RezaOwliaei gist](https://gist.github.com/RezaOwliaei/477ed74fc77aa5df2a854789538dd79d)). | Only `container.ts` imports `JobRunner`; no module does. p-queue also appears in `repo-intel/pipeline/full.ts:25` as local parse concurrency, which is not a job queue and is fine. **New in v2.** |
| **fastify-sse-v2** and `RunBus` (`platform/sse.ts`) | Edge (the stream) plus process machinery (the bus) | The SSE route handles the protocol; the application publishes events through a port, the stream subscribes ([gist](https://gist.github.com/RezaOwliaei/477ed74fc77aa5df2a854789538dd79d)). | `sse.ts:103` exports a `runBus` singleton, imported only by `run-logger.ts` and `container.ts`. The application publishes run events through `run-logger` (imported by `run-executor.ts`), never through the singleton. **New in v2.** |
| **vitest**, **testcontainers** | Tests | Inner rings are tested with fakes, adapters against a real database; the strongest form runs one contract suite against both the fake and the real adapter ([DZone](https://dzone.com/articles/testing-repository-adapters-with-hexagonal-architecture), [Testcontainers](https://testcontainers.com/guides/getting-started-with-testcontainers-for-nodejs/)). | Unit gate: `pnpm exec vitest run --exclude '**/*.it.test.ts'`. The cost of a `Container`-taking service is visible in `test/repo-intel-facade-degraded.test.ts:23-38` (`as never`, then overwriting a private field). PR #7 already has the positive examples: `SkillsService(repo)` (`skills/service.ts:56`) and `ConventionsService(ports: ConventionsPorts)` (`conventions/service.ts:77`). |
| `src/platform/` | Mixed | — | v1 called all of `platform/` "edge by construction". That is wrong and would flag correct code: `conventions/service.ts:11-13` (PR #7) imports `platform/errors`, `prompts` and `resilience`, as application code should. v2 splits it: composition root (`container.ts`), process machinery (`jobs.ts`, `sse.ts`, `run-logger.ts`, `price-book.ts`), shared kernel (`errors.ts`, `resilience.ts`, `prompts.ts`), re-export shims over reviewer-core (`grounding.ts`, `prompt.ts`, `structured.ts`), and two files with no importers (`model-router.ts`, `trace-builder.ts`). **New in v2.** |

## 4. Gap audit of v1

This is the H1 step: classify every v1 rule before writing anything. The class of a rule is a
hypothesis until the baseline run in T1 confirms it, exactly as H1 tested each candidate rule
against the no-skills baseline.

Classes: **G** general knowledge a model applies unprompted (cut, or one line), **R**
repo-specific (keep), **S** stale or wrong (fix), **D** owned by another file (point to it),
**N** new.

| # | v1 rule | Class | Checked on `main` today | v2 action |
|---|---|---|---|---|
| 1 | Palermo's dependency rule; compile-time vs runtime direction | G | — | One line |
| 2 | Ring table mapping files to rings | R + S | `platform/` row is wrong (section 3) | Keep, fix `platform/`, add jobs and SSE rows |
| 3 | `service.ts` imports no fastify, drizzle-orm, `db/schema` or SDK | R + S | Holds for every `service.ts`. Other application files break it: `run-executor.ts:5`, `diff-loader.ts:4` import `db/schema` | Keep for application files; add those two to the leak table |
| 4 | Port in `adapters.ts` → adapter in `adapters/<name>/` → double in `mocks.ts` | R | Holds 7/7 | Keep |
| 5 | Composition root is `container.ts`; a new service takes its ports, not `Container` | R | 4 old services take `Container` (grandfathered); PR #7's two new ones take ports | Keep, and cite the PR #7 services as the pattern to copy |
| 6 | The five failure modes of a service locator | G | — | Cut to one line and a link ([Seemann](https://blog.ploeh.dk/2010/02/03/ServiceLocatorisanAnti-Pattern/)) |
| 7 | Secrets only via `container.secrets` | D | Already in `server/CLAUDE.md` | Pointer |
| 8 | Drizzle stops at the repository | R + S | `settings/feature-models.ts:1,8` and `repos/helpers.ts:2,44` sit outside a repository | Keep; update the grandfathered list |
| 9 | Service owns the transaction via a `withTransaction` callback port | R | No transactions exist | Keep as a trigger rule, add the `AsyncLocalStorage` risk in one line |
| 10 | Optional `tx` failure mode | G | — | Merge into 9 |
| 11 | No `$inferSelect` row types in application signatures | R | Leaks at `run-executor.ts:58,141` | Keep |
| 12 | Drizzle `sum()` returns a string | D | Already in `server/INSIGHTS.md`, and not an onion rule | Cut |
| 13 | Schema changes go through `db:generate` | D | Root `CLAUDE.md`, `.claude/rules/db-schema.md` | Cut |
| 14 | `FastifyRequest` stops at routes; `_shared/context.ts` is the exception | R | Holds | Keep |
| 15 | Validate at the edge; thin handlers | G | — | One line |
| 16 | No second DI mechanism without an ADR | R | Holds | Keep |
| 17 | Modules registered statically | D | Root `CLAUDE.md` | Cut |
| 18 | Contracts live in `vendor/shared/`, client mirrors | D | `.claude/rules/shared-contracts.md` | Pointer |
| 19 | `.nullish()` instead of `.optional()` in `Review`/`Finding` | D | Owned by `api-contract-house-rules` | Cut |
| 20 | Vendor SDKs only under `adapters/**` | R + S | Exceptions: graphology in `pipeline/rank.ts`, `fetch` in reviewer-core | Keep, name the exceptions |
| 21 | astgrep asymmetry | R | Holds | Leak table |
| 22 | Feature flag read inside application logic (×8) | R | Holds | Leak table |
| 23 | SQL in `pulls/`, `polling/`, `settings/`, `workspace/` routes | R + S | Holds on `main`. On PR #7 a fifth one appears: the **new** `conventions/routes.ts:17,58-67,109` runs Drizzle queries inside the port closures it passes to `ConventionsService`. That module shipped in the same PR as v1, the pattern v1 said not to copy. `server/CLAUDE.md` names only `pulls/` and `polling/` | Keep grandfathered; T1 decides whether `conventions/` is fixed (move the two queries into `ConventionsRepository`) or recorded as a known violation |
| 24 | reviewer-core has no DB, GitHub, filesystem, env or network | S | The OpenRouter provider calls the `openai` SDK (`openrouter.ts:116` on this branch) and `fetch` (`:197`); six core files import the shared contracts, which live in `server/src/vendor/shared/` | Restate truthfully: no `server/` imports except the contracts, no DB, GitHub, filesystem or env, one network edge |
| 25 | "When not to": four checkable signs a layer is too much | R + S | Conflicts with the root `CLAUDE.md` module convention (`routes.ts` + `service.ts` + `repository.ts`) if read as "skip the repository" | Keep, reframed: the module convention is the floor; the four signs apply to layers above it (mappers, entities, internal ports, DI libraries). Move it inside the rule it limits |
| 26 | Grandfathering stated in steps, reference and rule | R | — | Keep, with the updated list |
| 27 | Prove with a hermetic unit test | R | Command holds | Keep; add the boundary check if D1 = A |
| 28 | Report one line | R | — | Keep |
| N1 | Jobs are entry points | N | Section 3 | Add |
| N2 | SSE: publish through `run-logger`, not the `runBus` singleton | N | Section 3 | Add |
| N3 | `platform/` split | N | Section 3 | Add to the ring table |
| N4 | Cross-module imports | N (clarification) | v1 says "a module never imports another module's internals — cross-module work goes through the container or a port". It never says whether a module's `service.ts` counts as internal. `conventions/routes.ts:24-27` (PR #7) imports `SkillsService` and `AgentsService` directly, while `ConventionsService` itself receives them as ports | Decision D4 |

Expected result: roughly half of v1's lines go. H1 found 59% general knowledge in the reviewer
skills. This audit marks 10 of the 28 v1 rules as G or D (rows 1, 6, 10, 15 and 7, 12, 13, 17,
18, 19), and 7 more as partly or fully stale (rows 2, 3, 8, 20, 23, 24, 25). Row 9 stays R as a
trigger rule: it describes what to do when the first transaction appears, not code that exists.

## 5. Target shape of v2

**Files.**

- `SKILL.md`: the procedure. At most ~2,500 chars (v2 landed at ~4,000; see `references.md`).
- `reference.md`: ring table, leak table with `file:line`, per-tool rules. Only R and N rows.
- `references.md` (kept under the name the repo's skill convention in `.claude/skills/README.md`
  uses): provenance, version history, what is enforced where, and every source.
- `evals/evals.json` and `evals/trigger-queries.json`: prompts and assertions. The
  skill-creator workspace with run outputs stays out of the repo.
- `.claude/rules/onion-boundaries.md`: shrunk to three invariants that must hold even when the
  skill does not load, plus a pointer to the skill:
  1. Application files (`service.ts`, `run-executor.ts`, `helpers.ts`, `status.ts`) import no
     fastify, drizzle-orm, `db/schema` or vendor SDK.
  2. Vendor SDKs are imported only under `adapters/**` (plus `db/` for postgres), and every new
     adapter gets a double in `adapters/mocks.ts`.
  3. `reviewer-core/` imports nothing from `server/` except the shared contracts
     (`@devdigest/shared`, which live in `server/src/vendor/shared/`).

  Each one names its grandfathered exceptions. There is one authoritative source per boundary:
  if D1 = A, the depcruise config is that source, and both the rule and the skill point to it.

**Size budget.** v1 is 12,449 chars (SKILL.md plus reference.md). v2 aims for ≤ 7,000. Size
matters less here than in H1, because a Claude Code skill loads `reference.md` only when it is
read, but the pressure is the same: every general-knowledge line costs attention and adds
nothing.

**Writing rules, carried over from H1 and skill-creator.**

1. A rule goes in only if the no-skill baseline misses it.
2. An exception lives inside its rule, with its condition. No global "when not to" or "do not
   flag" section that can veto other rules.
3. Positive, checkable phrasing, grounded in a `file:line`.
4. No severity words; `pr-self-review` grades findings.
5. Explain why instead of writing MUST and NEVER.
6. Every rule the existing code breaks carries its grandfathering clause, stated once in the
   steps, once in the reference and once in the rule file.

## 6. Evaluation plan

**Deferred (2026-09-22):** evals are a later course module. This section is the spec for that
module; nothing here runs on this branch. Until then, the G class in section 4 is judgement,
not measurement, and v2 records that in its README.

This is the skill-creator loop, adapted. It differs from H1 in one important way. H1's skills
are always pasted into a review prompt, so H1 measured catches across pinned OpenRouter
providers. This skill loads by description inside a coding session, so it gets two harnesses:
coding tasks graded on the diff, and trigger queries graded on whether the skill loads.

**Arms.** No skill, v1 (snapshot), v2.

**Coding prompts.** Each prompt runs in its own worktree on the target branch.

| Id | Prompt (short form) | Assertions (graded on the diff) |
|---|---|---|
| E1 | New endpoint: finding counts per severity for a repo | Query lives in a repository file; no `drizzle-orm` or `db/schema` import in any application file; a unit test runs without Docker and passes |
| E2 | Post a review summary to a Slack webhook | Port in `adapters.ts`, adapter in `adapters/<name>/`, double in `mocks.ts`; the new service takes ports, not `Container`; the webhook secret comes from `container.secrets` |
| E3 | Persist a run and its findings atomically | No ORM handle in any service signature; the boundary is a port or an explicit, stated decision |
| E4 | Nightly job that re-indexes stale repos | Handler registered through `container.jobs` and calling a service; no `JobRunner` or `p-queue` import in `modules/` |
| E5 | Add a field to the `settings/` route | `settings/routes.ts` gets only the requested change; no migration and no new repository layer is proposed |
| E6 | Small CRUD endpoint with no business rule | Follows the module convention and adds nothing above it: no mapper, entity or internal port |

Each assertion is written so a near-miss fails it (H1 principle 8). For example, E2 fails if the
double exists but does not implement the port.

**Models.** Opus 5 (main sessions) and Sonnet 5 (subagents).

**Trigger queries.** 20 queries: 10 that should load the skill, and 10 near-misses that should
not (a React component in `client/`, a migration-only change, an API-contract field change, a
reviewer-core prompt edit, an e2e flow). Tuned with `run_loop.py`.

**Pre-registered criteria.**

- a. A v1 rule survives only if the no-skill baseline misses it on at least one prompt.
- b. v2 passes every assertion v1 passes, on both models.
- c. E5 and E6 show zero unrequested refactors.
- d. v2 is at most 7,000 chars.
- e. Trigger precision and recall are both ≥ 0.9.
- f. If D1 = A: the boundary check passes on a clean tree, fails on a planted forbidden import,
  and passes again after the revert. This proves the rule actually blocks something
  ([codingagentguide](https://codingagentguide.com/posts/architecture-boundary-tests-for-coding-agent-patches/)).

**Cost.** Full: 6 prompts × 3 arms × 2 runs × 2 models = 72 coding runs, plus the trigger loop.
Lean: T1 runs the no-skill and v1 arms once each on Sonnet (12 runs), and T3 runs v1 and v2
twice on both models for E1, E2, E5 and E6 (32 runs). Every run is budgeted at 150 tool calls or
45 minutes, and runs launch in batches of at most 10 agents.

## 7. Enforcement: the ADR this plan needs (D1)

| Option | What it is | Cost | Catches |
|---|---|---|---|
| **A. dependency-cruiser config** (recommended) | `server/.dependency-cruiser.cjs`, a `pnpm lint:boundaries` script, a step in the server CI job. Grandfathered edges are recorded with `depcruise-baseline` into `.dependency-cruiser-known-violations.json` and skipped with `--ignore-known`, so only new violations fail | No new package. A config, a script, a CI step and a baseline file to maintain. The tsconfig path aliases (`@devdigest/shared`, `@devdigest/reviewer-core`) must resolve, and that needs checking | Direct and transitive edges, cycles, across all of `server/src` |
| B. ArchUnitTS | Architecture rules as vitest tests, inside the existing test gate, with protection against rules that match zero files | New dev dependency | Same class of edges |
| C. Skill only | Status quo | Zero | Nothing: the skill asks, nothing blocks |

Initial rules for A: application files do not import fastify, drizzle-orm, `db/schema` or vendor
SDKs; `routes.ts` does not import drizzle-orm; vendor SDKs only under `adapters/**` (plus `db/`
for postgres); reviewer-core does not import `server/`; no cross-module imports from application
files (the edge follows D4); no cycles.

The skill then says: run `pnpm lint:boundaries`. Never edit the config or the baseline to get a
green run; a policy change is a separate diff. This is the "prove it" step, and it is what
actually enforces the architecture.

The evidence that a skill on its own is not enough is already in the repo. PR #7 carries v1,
and the same PR adds `conventions/routes.ts` with Drizzle queries inside the route, the pattern
v1 names as not to be copied. A route-level rule in the config (routes may not import
`drizzle-orm`, with the four grandfathered routes in the baseline) would have failed that diff.

## 8. Work breakdown

| Task | Done when |
|---|---|
| T0. Branch `feat/onion-architecture-skill-v2` from `origin/feat/agent-skills` (PR #7 carries v1 and is the homework PR); move this plan into `docs/` there; v1 kept as commit `6a80fd1` | **Done 2026-09-22** |
| T1. Re-verify every `file:line` in sections 3–4 on this branch (the audit ran on `main`) | **Done 2026-09-22**; corrected lines are in v2's `reference.md` |
| T2. Write v2 `SKILL.md`, `reference.md`, `references.md` from the audited table | **Done 2026-09-22**: 7,573 chars against v1's 12,449, about 8% over the 7,000 target; every cited `file:line` checked on this branch |
| T3. Run v2 against the evals, iterate | Deferred to the evals module |
| T4. Description optimisation | Deferred to the evals module |
| T5. Shrink `onion-boundaries.md`; update the catalog line in `.claude/skills/README.md` and the root `CLAUDE.md` line. These are the files that conflicted last time | **Done 2026-09-22** (`CLAUDE.md` is a symlink to `AGENTS.md` on this branch; `server/AGENTS.md` updated too) |
| T6. If D1 = A: config, script, baseline, CI step, planted-violation proof; ADR in `../decisions/` | **Done 2026-09-22**: 34 known violations, criterion f proved on three planted edges. The graph cannot see adapter calls through `container.<member>` in routes; that rule stays with the skill and `pr-self-review` |
| T7. Check `pr-self-review` still routes backend surfaces to this skill; record in `server/INSIGHTS.md` through `engineering-insights` | Routing verified; insight recorded or "nothing worth recording" |

Definition of done on this branch (evals deferred): criteria d and f hold, every `file:line` in
v2 is verified on the branch, and `server/` typecheck and unit tests stay green. Criteria a, b, c
and e belong to the evals module.

## 9. Decisions needed

- **D1. Enforcement.** Approved 2026-09-22: option A. ADR
  `../decisions/2026-09-22-onion-boundary-enforcement.md`.
- **D2. Base branch.** Approved 2026-09-22: branch from `origin/feat/agent-skills`, merge back
  into it.
- **D3. Eval budget.** Falls away: evals are a later course module.
- **D4. What counts as a module's public surface (a clarification, not a new rule).** Approved
  2026-09-22. v1 is
  ambiguous here. I recommend writing down what PR #7 already does: a module's `service.ts` and
  its exported types are its public surface; `routes.ts` (the edge) may import another module's
  service in order to compose it; application files receive other modules only as ports, the
  way `ConventionsService(ports)` does.

## 10. Sources

Every link returned HTTP 200 on 2026-09-22, except Medium, which answers 403 to scripts and
opens normally in a browser.

**The pattern**

- Jeffrey Palermo, The Onion Architecture:
  [part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/),
  [part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/),
  [part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/),
  [part 4, after four years](https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/).
  The origin of the dependency rule, and of the idea that the database is external.
- Alistair Cockburn, [Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/),
  and [Wikipedia](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)). Ports and
  adapters, driving versus driven.
- Milan Jovanović, [Clean vs Onion vs Hexagonal](https://milanjovanovic.tech/blog/clean-architecture-vs-onion-vs-hexagonal).
  What the three share, and background jobs treated as entry points.
- Herberto Graça, [Onion Architecture](https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85).

**Composition and DI**

- Mark Seemann, [Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/) and
  [Service Locator is an Anti-Pattern](https://blog.ploeh.dk/2010/02/03/ServiceLocatorisanAnti-Pattern/).
- Martin Fowler, [Inversion of Control Containers and the Dependency Injection pattern](https://martinfowler.com/articles/injection.html).
- [fastify/help#284: best practice for dependency injection](https://github.com/fastify/help/issues/284).
- Fastify docs: [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/),
  [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/),
  [Plugins guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/).

**TypeScript practice**

- [Vertical Slicing & Clean Architecture: A Practical Guide](https://gist.github.com/RezaOwliaei/477ed74fc77aa5df2a854789538dd79d).
  Per-layer import tables, a composition root without a framework, the outbox pattern and SSE
  through an event port.
- [nikolovlazar/nextjs-clean-architecture](https://github.com/nikolovlazar/nextjs-clean-architecture).
  Own error types at the boundary, and repositories as the only users of the database driver.
- [Sairyss/domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon). The
  canonical layout, declined in v1 because adopting it would restructure every module.

**Drizzle and transactions**

- [Drizzle: transactions](https://orm.drizzle.team/docs/transactions).
- Sentry, [Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/).
- [drizzle-orm#2777: implicit transaction context](https://github.com/drizzle-team/drizzle-orm/discussions/2777).
- Node.js, [AsyncLocalStorage](https://nodejs.org/api/async_context.html).

**Testing**

- [Testing Repository Adapters With Hexagonal Architecture](https://dzone.com/articles/testing-repository-adapters-with-hexagonal-architecture).
- [Getting started with Testcontainers for Node.js](https://testcontainers.com/guides/getting-started-with-testcontainers-for-nodejs/).

**The counterweight** (read before adding a layer)

- Three Dots Labs, [Is Clean Architecture Overengineering?](https://threedots.tech/episode/is-clean-architecture-overengineering/)
- CodeOpinion, [Avoiding the Repository Pattern with an ORM](https://codeopinion.com/avoiding-the-repository-pattern-with-an-orm/)
- Ardalis, [Clean Architecture Sucks](https://ardalis.com/clean-architecture-sucks/)

**Enforcement**

- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser):
  [rules tutorial](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-tutorial.md),
  [rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md),
  [CLI, including baseline and `--ignore-known`](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md).
- [Avoid cross-module dependencies with dependency-cruiser](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b).
- [Make Coding-Agent Patches Prove They Respect Module Boundaries](https://codingagentguide.com/posts/architecture-boundary-tests-for-coding-agent-patches/).
  One authoritative contract, test the test, and never let the agent edit the contract to go
  green.
- [ArchUnitTS](https://github.com/LukasNiessen/ArchUnitTS) and
  [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries), the
  alternatives. v1's research found that neither boundaries nor `no-restricted-paths` follows
  re-export chains.

**Writing and evaluating the skill**

- Anthropic, [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices).
- Anthropic, [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).
- [skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator).
- H1's 48 sources: `docs/handoff/2026-09-21-skills-deep-analysis/rebuild/research/SOURCES.md` on
  `feat/agent-skills`.
