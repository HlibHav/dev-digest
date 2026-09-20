# server — @devdigest/api

## Commands

```sh
pnpm dev                                          # tsx watch, :3001 (or $API_PORT)
pnpm typecheck
pnpm exec vitest run --exclude '**/*.it.test.ts'  # unit, hermetic
pnpm exec vitest run .it.test                     # integration, needs Docker
pnpm db:generate && pnpm db:migrate               # after any schema change
pnpm db:seed                                      # idempotent demo data
```

`pnpm build` / `pnpm start` are not a working path — path aliases aren't
rewritten by `tsc`. Run the API through `tsx` (`pnpm dev`) everywhere.

## Map

- `src/platform/container.ts` is the composition root. External I/O goes only
  through the adapters it exposes; test doubles live in `src/adapters/mocks.ts`.
- `src/modules/repo-intel/` is the codebase indexer. Read its own README
  before changing it.

## Boundaries

- routes → service → repository. `pulls/` and `polling/` keep SQL directly in
  routes — don't copy that pattern into new modules.
- Review logic (prompt assembly, grounding, score) lives in `reviewer-core`.
  This package owns I/O, persistence, and streaming only.
- Secrets only through `container.secrets`, never `process.env` or
  `AppConfig` directly.
- These are the onion's rings. The ring table, the known leaks and the
  per-tool rules live in the `onion-architecture` skill; the always-on
  guardrail is `.claude/rules/onion-boundaries.md`.

## Async model

Two different mechanisms, don't conflate them:
- clone / index / refresh / resync run on `container.jobs` (JobRunner, backed
  by the `jobs` table, with timeout + retry).
- Reviews run **fire-and-forget** from `ReviewService.runReview` — no queue,
  no retry, no concurrency cap. See `.claude/rules/review-runs.md`.

## Gotchas

- `~/.devdigest/secrets.json` wins over `.env`; `POST /settings/test-connection`
  writes it, shared by every checkout on this machine.
- Seeded agents use `openrouter` — reviews fail without `OPENROUTER_API_KEY`
  even with OpenAI/Anthropic keys set.
- Integration tests (`*.it.test.ts`) skip silently without Docker. Skipped is not
  passed — say so instead of reporting green.
- Migrations never run on boot — `relation ... does not exist` means you
  skipped `pnpm db:migrate`.
- `GET /repos/:id/pulls` and `GET /pulls/:id` write to the DB (GitHub sync) —
  not read-only.
- Clones default to `~/.devdigest/workspace`, but `.env.example` sets
  `DEVDIGEST_CLONE_DIR=./clones` and `dev.sh` runs from `server/` — a standard
  launch clones into `server/clones/`.
- JobRunner's timeout doesn't cancel the handler (a `failed` job may still be
  running) and is never retried; boot reaps every `running` agent run as
  `failed`, assuming one API process per DB.
- Ports come from env, but `client/package.json`'s `dev` hardcodes `-p 3000`.
- `platform/{grounding,prompt,structured}.ts` are reviewer-core re-export
  shims; `model-router.ts`, `trace-builder.ts`, `prompts.ts` have no callers
  yet — lesson scaffolding, not dead code.

## Read when

- `README.md` for the API map and request/DI flow.
- `src/modules/repo-intel/README.md` before touching indexing or the repo map.
- `../TESTING.md` before adding a test or changing the unit/integration split.
- `docs/`, `specs/`, `INSIGHTS.md` in this package for deeper or past context.
