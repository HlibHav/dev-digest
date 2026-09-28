# mcp-server — @devdigest/mcp-server

pnpm. A local stdio MCP server exposing five DevDigest review tools to an MCP client
(Claude Code, MCP Inspector, …). It talks to the already-running local API over HTTP — it has
no database and no direct GitHub/LLM access of its own.

## Commands

```sh
pnpm typecheck   # tsc --noEmit, needs server/node_modules for @devdigest/shared's zod types
pnpm test        # vitest run
pnpm start       # tsx src/main.ts, reads DEVDIGEST_API_URL / DEVDIGEST_MCP_WAIT_MS / DEVDIGEST_MCP_POLL_MS
pnpm inspect     # MCP Inspector UI on this server; passes DEVDIGEST_API_URL through (default :3001)
```

`server/node_modules` must exist before `pnpm typecheck` — the shared contract types resolve
`zod` from there (see `README.md`).

## Rules

- Onion inside this package: `tools/*.ts` parse input, call one `app/*` use case and map the
  result; only `app/*` uses `ports/`; only `adapters/` calls `fetch`.
- `@devdigest/shared` is imported **type-only**, everywhere, enforced by
  `verbatimModuleSyntax: true` and `test/shared-imports.test.ts`. No shared zod schema value
  ever reaches the SDK — this package's own schemas are zod v4 (`import * as z from 'zod/v4'`).
- Stdout carries only the MCP protocol. Every log line goes through `src/log.ts`, which uses
  `console.error`, whatever the level — see `test/no-stdout.test.ts`.
- Tool and field descriptions are copied verbatim from
  `docs/homework-4/plan.md`'s "Tool descriptions" table. A change needs a plan revision, not a
  local edit.

## Read when

- `README.md` before running it against a live API or wiring it into a client.
- Layer boundaries or a new tool/port/adapter → the root `onion-architecture` skill (this
  package has no `lint:boundaries`; the checks are manual, see `docs/homework-4/plan.md`).
