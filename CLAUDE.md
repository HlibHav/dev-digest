> **Priority.** This is a course repo. Where course conventions conflict with
> global rules (`~/.claude`), course conventions win inside this repo.

# DevDigest — agent guide

Local-first AI PR reviewer. Course starter: Part-0 works end to end; each lesson adds one feature.

## Before answering

A task that concerns a package starts with the `engineering-insights` skill: read that
package's `INSIGHTS.md` before any other work. Don't skip it. Then its `docs/` and `specs/` —
they are curated and may already answer it. Then read code.

## Stack

| Package | Language · framework | Key libraries | Manager |
|---|---|---|---|
| `server/` | TypeScript (ESM) on Node ≥ 22 · Fastify 5 | Drizzle ORM + postgres-js, zod + fastify-type-provider-zod, fastify-sse-v2, openai + @anthropic-ai/sdk, octokit, simple-git, vitest + testcontainers | pnpm |
| `client/` | TypeScript · Next.js 15 (App Router) · React 19 | next-intl, @tanstack/react-query, zod, vitest + Testing Library | pnpm |
| `reviewer-core/` | TypeScript source, no build step | openai SDK (OpenRouter), zod, vitest | npm |
| `e2e/` | TypeScript run by tsx | global `agent-browser` CLI, no test framework | npm |

Database: PostgreSQL 16 with pgvector (`pgvector/pgvector:pg16` in `docker-compose.yml`).

## Repo structure

Not a monorepo workspace: each package has its own `package.json` and lockfile, and you run
its commands from inside its directory.

- `server/` — the API engine: PR import, review runs and traces, repo indexing (`repo-intel`), DB schema and migrations.
- `client/` — the studio UI: PR list, PR detail with findings and agent runs, agents, settings.
- `reviewer-core/` — the pure review engine (prompt assembly, LLM call, grounding, score), shared by the server and the CI runner.
- `e2e/` — deterministic browser flows as JSON, run against seeded data.
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
| `server/` | `pnpm typecheck` | `pnpm exec vitest run --exclude '**/*.it.test.ts'` (unit) · `pnpm exec vitest run .it.test` (integration, needs Docker) |
| `client/` | `pnpm typecheck` | `pnpm test` |
| `reviewer-core/` | `npm run typecheck` | `npm test` |
| `e2e/` | `npm run typecheck` | `npm run e2e:hermetic` |

No linter or formatter is configured in any package: typecheck + tests are the gate. A change in
`reviewer-core/` must also pass `server/`'s checks.

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
- Working inside a package → that package's CLAUDE.md: `server/CLAUDE.md`, `client/CLAUDE.md`,
  `reviewer-core/CLAUDE.md`, `e2e/CLAUDE.md` (auto-load is unreliable, VS Code #24987)
- Agent prompt templates, model choice → `docs/agent-prompts/`
- Placing a new file under `client/src` — which folder, when to promote to shared, import
  directions → `frontend-ui-architecture`
- Finishing a non-trivial task → `engineering-insights` to record what was learned in the touched
  package's `INSIGHTS.md`. Don't skip it; "nothing worth recording" is a valid outcome.
