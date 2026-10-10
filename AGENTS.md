> **Priority.** This is a course repo. Where course conventions conflict with
> global rules (`~/.claude`), course conventions win inside this repo.

# DevDigest — agent guide

Local-first AI PR reviewer. Course starter: Part-0 works end to end; each lesson adds one feature.

## Before answering

A task that concerns a package starts with the `engineering-insights` skill: read that
package's `INSIGHTS.md` before any other work. Don't skip it. Then the guides that package's
`AGENTS.md` names for this kind of task (its **Read when** list), then its `docs/` and
`specs/` — they are curated and may already answer it. Then read code.

## Stack

| Package | Language · framework | Key libraries | Manager |
|---|---|---|---|
| `server/` | TypeScript (ESM) on Node ≥ 22 · Fastify 5 | Drizzle ORM + postgres-js, zod + fastify-type-provider-zod, fastify-sse-v2, openai + @anthropic-ai/sdk, octokit, simple-git, vitest + testcontainers | pnpm |
| `client/` | TypeScript · Next.js 15 (App Router) · React 19 | next-intl, @tanstack/react-query, zod, vitest + Testing Library | pnpm |
| `reviewer-core/` | TypeScript source, no build step | openai SDK (OpenRouter), zod, vitest | npm |
| `e2e/` | TypeScript run by tsx | global `agent-browser` CLI, no test framework | npm |
| `mcp-server/` | TypeScript ESM · MCP stdio server | `@modelcontextprotocol/server` v2, zod v4, vitest | pnpm |
| `evals/` | TypeScript run by tsx and vitest | Claude Agent SDK, vitest | pnpm |

Database: PostgreSQL 16 with pgvector (`pgvector/pgvector:pg16` in `docker-compose.yml`).

## Repo structure

Not a monorepo workspace: each package has its own `package.json` and lockfile, and you run
its commands from inside its directory.

- `server/` — the API engine: PR import, review runs and traces, repo indexing (`repo-intel`), DB schema and migrations.
- `client/` — the studio UI: PR list, PR detail with findings and agent runs, agents, settings.
- `reviewer-core/` — the pure review engine (prompt assembly, LLM call, grounding, score), shared by the server and the CI runner.
- `e2e/` — deterministic browser flows as JSON, run against seeded data.
- `mcp-server/` — a local stdio MCP server exposing five DevDigest review tools to an MCP client, over the already-running local API.
- `evals/` — behaviour evals for the project's skills and agents (course lesson 6): cases in `evals/skills/<name>/` and `evals/agents/<name>/`, never inside `.claude/`.
- `docs/` — cross-package docs (`docs/agent-prompts/`). Package-local docs live in each package's `docs/` and `specs/`.
- `scripts/` — `dev.sh` (local stack) and `e2e.sh` (hermetic e2e).
- `.github/workflows/` — CI per package (server split into unit and integration) plus e2e.
- `.claude/` — path-scoped rules, project skills, settings.

## Run

```sh
./scripts/dev.sh              # Postgres (docker) → migrate → seed → API + web
./scripts/dev.sh --db-only    # Postgres + migrate + seed, then exit
cd server && pnpm dev         # API on :3001 (tsx watch)
cd client && pnpm dev         # web on :3000
cd server && pnpm db:migrate && pnpm db:seed
```

Ports and machine-specific overrides live in `CLAUDE.local.md` when present.

## Check

| Package | Typecheck | Tests |
|---|---|---|
| `server/` | `pnpm typecheck` · `pnpm lint:boundaries` | `pnpm exec vitest run --exclude '**/*.it.test.ts'` (unit) · `pnpm exec vitest run .it.test` (integration, needs Docker) |
| `client/` | `pnpm typecheck` | `pnpm test` |
| `reviewer-core/` | `npm run typecheck` | `npm test` |
| `e2e/` | `npm run typecheck` | `npm run e2e:hermetic` |
| `mcp-server/` | `pnpm typecheck` | `pnpm test` |
| `evals/` | `pnpm typecheck` · `pnpm eval:quality` (static, no LLM) | `pnpm eval:skills` · `pnpm eval:agents` · `pnpm eval:workflow` (run a model through Claude Code) |

No linter or formatter is configured in any package: typecheck + tests are the gate, plus
`server/`'s import-boundary check (`pnpm lint:boundaries`, dependency-cruiser). A change in
`reviewer-core/` must also pass `server/`'s checks.

Harness changes run the evals (from `evals/`, `pnpm eval:quality` first). CI runs the same
suites on pull requests and on push to `main` (`.github/workflows/evals.yml`, one job per tier,
report-only; `evals/scripts/ci-detect.mjs` picks them). Actions → evals → Run workflow runs a
tier by hand, with an optional skill or agent name and the task and judge models:

| Change | Local run | CI job |
|---|---|---|
| `.claude/skills/<name>/**` or `evals/skills/<name>/**` | `pnpm exec vitest run skills/<name>/` (all: `pnpm eval:skills`) | `skills` |
| `.claude/agents/<name>.md` or `evals/agents/<name>/**` | `pnpm exec vitest run agents/<name>/` (all: `pnpm eval:agents`) | `agents` |
| `AGENTS.md` / `CLAUDE.md` (root or a package's), `TESTING.md`, `.claude/rules/**`, an agent definition, a skill the workflow cases name, `evals/workflow/**` | `pnpm eval:workflow` | `workflow` |

## Naming conventions

- **Server files:** kebab-case (`run-executor.ts`, `diff-loader.ts`). A module is
  `server/src/modules/<name>/routes.ts` plus `service.ts`, `repository.ts` and
  `repository/<entity>.repo.ts`.
- **Client components:** PascalCase folder and file, `_components/<Name>/<Name>.tsx` with `index.ts`,
  `<Name>.test.tsx` and colocated `helpers.ts`, `constants.ts`, `styles.ts`. Hooks are `useX` in
  `client/src/lib/hooks/<area>.ts`.
- **Tests:** unit `*.test.ts(x)`; server integration `*.it.test.ts`.
- **Database:** snake_case tables and columns in SQL (`agent_runs.cost_usd`), camelCase properties
  in Drizzle (`costUsd`). Migrations are drizzle-kit generated: `NNNN_<generated_name>.sql`.
- **API and contracts:** JSON fields are snake_case (`head_sha`, `cost_usd`). A zod schema and its
  inferred type share one PascalCase name (`export const PrMeta = z.object(…)`,
  `export type PrMeta = z.infer<typeof PrMeta>`).
- **i18n:** one namespace file per area, `client/messages/en/<namespace>.json`, with camelCase
  nested keys (`list.columnHints.cost`).
- **e2e flows:** `e2e/specs/NN-kebab-name.flow.json`.
- **Branches:** `feat/…`, `fix/…`, `docs/…`, `chore/…`.

## Conventions (not obvious from code)

- Cross-package code is shared as raw TypeScript through tsconfig path aliases.
- `server` cannot boot, typecheck, or test until `reviewer-core/node_modules` exists.
- Modules are registered statically in `server/src/modules/index.ts` (no filesystem autoload).
- ESM: relative imports carry the `.js` extension. Exception: `server/src/db/schema*`
  imports are extensionless.

## Do-not-touch

- `server/src/db/migrations/` (including `meta/`) — never hand-edit. Change the schema, then
  `pnpm db:generate` and `pnpm db:migrate`.
- Lock files — `server/pnpm-lock.yaml`, `client/pnpm-lock.yaml`, `reviewer-core/package-lock.json`,
  `e2e/package-lock.json`, and the root `skills-lock.json`. Never hand-edit them: change
  dependencies only through pnpm/npm inside that package, and skills only through the tool that
  wrote the lock.
- `server/src/vendor/shared/` — never hand-edit without coordination; the client copy mirrors it.
- `server/clones/` — cloned repos, possibly a copy of this one. Don't read or search it.

## Use when

- Architecture, API map, environment → `README.md`
- Working inside a package → that package's AGENTS.md: `server/AGENTS.md`, `client/AGENTS.md`,
  `reviewer-core/AGENTS.md`, `e2e/AGENTS.md` (auto-load is unreliable, VS Code #24987).
  Each package keeps a `CLAUDE.md` symlink beside it, so a tool that looks for either name
  finds the same file.
- Building a feature spec-first (spec → plan → red-first tests → implementers → reviewers) →
  `docs/sdd-cascade.md` for how much spec it needs, then `.claude/agents/README.md` for the
  order, the briefs, lane slices, the package gate and the fix loop. The main session
  orchestrates. `spec-creator` and `implementation-planner` are run by hand; once a plan is
  saved, `/implement <plan-path>` runs the rest.
- Agent prompt templates, model choice → `docs/agent-prompts/`
- Whether a skill actually changes a review → `docs/skills-control-experiment.md`
- Adding or changing backend code (`server/src/**`, `reviewer-core/src/**`) → the
  `onion-architecture` skill: which layer the change belongs to (route → service → domain,
  adapters at the edge), which way the imports point, and what `pnpm lint:boundaries` cannot
  see. Don't skip it; "no extra layer here" is a valid outcome. The always-on guardrail is
  `.claude/rules/onion-boundaries.md`.
- Placing a new file under `client/src` — which folder, when to promote to shared, import
  directions → `frontend-ui-architecture`
- Adding or changing a skill (`.claude/skills/**`) or an agent (`.claude/agents/**`) → its cases in
  `evals/skills/<name>/` or `evals/agents/<name>/` (`<name>.eval.ts`, `<name>.cases.ts`, `fixtures/`).
  Fixtures stay out of `.claude/`, so a planted violation never reads as guidance. Gate with
  `pnpm eval:quality`, then run the suite the change maps to in the table under **Check**:
  changed `.claude/skills` → `eval:skills`, changed `.claude/agents` → `eval:agents`, changed
  `CLAUDE.md` → `eval:workflow`. Measure a change with `eval:repeat --label` (before the edit) +
  `eval:delta`, and the artifact's lift with `eval:benchmark`. How-to: `evals/README.md`.
- Finishing a non-trivial task → `engineering-insights` to record what was learned in the touched
  package's `INSIGHTS.md`. Don't skip it; "nothing worth recording" is a valid outcome.
