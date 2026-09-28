# @devdigest/mcp-server

A local **stdio MCP server** that exposes five DevDigest review tools to an MCP client (Claude
Code, MCP Inspector, or any other). It runs against the already-running local DevDigest API —
it never talks to GitHub, an LLM provider, or the database directly.

## Tools

| tool | what it does |
|---|---|
| `devdigest_list_agents` | List the reviewer agents configured in DevDigest. |
| `devdigest_run_agent_on_pr` | Run one agent on a pull request, wait up to ~2 minutes, return its verdict and findings. |
| `devdigest_get_findings` | Read finished reviews on a pull request without starting a run — defaults to the latest per agent, or narrow by `agent`/`run_id`. |
| `devdigest_get_conventions` | Read the coding conventions DevDigest extracted for a repo. |
| `devdigest_get_blast_radius` | Get a pull request's changed symbols, their callers (`file:line`), and the HTTP endpoints and cron jobs they reach, read from DevDigest's code index. |

## Setup

1. Install `server/`'s dependencies (this package's tsconfig resolves `@devdigest/shared`'s
   zod types from `server/node_modules`):
   ```sh
   cd server && pnpm install --frozen-lockfile
   ```
2. Install this package's own dependencies:
   ```sh
   cd mcp-server && pnpm install --frozen-lockfile
   ```
3. Have the DevDigest API running locally (`cd server && pnpm dev`, default `:3001`; this
   machine uses `:3201` — see the repo's `CLAUDE.local.md`).

## Run

```sh
cd mcp-server
DEVDIGEST_API_URL=http://localhost:3001 pnpm start
```

Environment variables (all optional):

| var | default | meaning |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | base URL of the running DevDigest API |
| `DEVDIGEST_MCP_WAIT_MS` | `110000` | how long `devdigest_run_agent_on_pr` polls before returning `status: "running"` |
| `DEVDIGEST_MCP_POLL_MS` | `2000` | interval between polls |

## Verify it's wired up

**MCP Inspector**, without a UI, over stdio:

```sh
cd mcp-server
npx --yes @modelcontextprotocol/inspector@2.8.0 --cli node_modules/.bin/tsx src/main.ts --method tools/list
```

It should print the five tools above.

**Claude Code**: the repo root's `.mcp.json` registers this server as `devdigest`. Open a
session in the repo, approve the server when prompted, then run `/mcp` — it should show
`devdigest` connected with 5 tools.

## Layout

- `src/ports/api-client.ts` — the `ApiClient` port, `ApiError`, `Clock`, `ServerDeps`.
- `src/adapters/http-api-client.ts` — the only file that calls `fetch`, for real.
- `src/adapters/mocks.ts` — `FakeApiClient`, the test double.
- `src/app/*` — resolution, error mapping, presentation and the five use cases.
- `src/tools/*` — one file per MCP tool: parse input, call a use case, map the result.
- `src/server.ts` / `src/main.ts` — wiring and the stdio entry point.

See `AGENTS.md` for the onion rules this package follows and the commands to run it.
