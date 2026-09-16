# e2e — @devdigest/e2e

npm, not pnpm. Each flow is JSON in `specs/NN-name.flow.json` — these are
tests, not design docs.

## Commands

```sh
npm run e2e:hermetic   # isolated stack, fresh seed — the usual way to run this
npm test               # runner only; needs an already-running, freshly seeded stack
npm run typecheck
```

Requires a global `agent-browser`: `npm i -g agent-browser && agent-browser install`.

## Rules

- Deterministic locators only — `--url`, `--text`, `find role|text|label`.
  Never the AI `chat` command.
- Flows target read-only seed data (`server/src/db/seed.ts`) — nothing may
  trigger an LLM call.
- Flows that start at `{BASE}/` follow the redirect to the first repo.
  Against a dev DB with several repos they fail — expected, not a regression.

## Read when

- `README.md` before writing or debugging any flow.
- `docs/`, `INSIGHTS.md` in this package for deeper or past context.
