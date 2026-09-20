# client — @devdigest/web

## Commands

```sh
pnpm dev          # next dev -p 3000 — hardcoded, see server/CLAUDE.md gotcha
pnpm typecheck
pnpm test         # vitest + jsdom, fetch mocked — no API needed
```

## Map

- Pages (`src/app/**/page.tsx`) stay thin. Feature logic lives in colocated
  `_components/<Name>/` folders, each with its own test.
- Data flows `src/lib/hooks/*` → `src/lib/api.ts`. Components never call
  `fetch` or open an `EventSource` themselves.
- `src/vendor/ui` (`@devdigest/ui`) and `src/vendor/shared` are vendored —
  don't restructure them locally.

## Rules

- New user-facing strings go through `next-intl` (`messages/en/*.json`).
  Some older pages still inline text — don't copy that pattern.
- API types come from `@devdigest/shared`, but this copy is not canonical.
  Change `server/src/vendor/shared` first and mirror here in the same change
  — see `.claude/rules/shared-contracts.md`.

## Gotchas

- PR detail routes by number; the uuid is resolved via `usePulls`, and that
  request triggers a GitHub sync on the server (not a plain read).
- Run status is server-sourced: `usePrActiveRuns` polls, `useRunEvents`
  streams SSE. Don't mirror it into local state — it breaks on reload.
- Component tests mock `fetch`; a green test proves nothing about the real
  API shape. The contract is `@devdigest/shared`; the real journey is `../e2e`.
- `NEXT_PUBLIC_API_BASE` is inlined at build time — restart `pnpm dev` after
  changing `.env`.
- e2e flows assert on visible text — renaming UI copy or a seeded label can
  break them silently.

## Read when

- `README.md` for the route map and which endpoint each page uses.
- `src/vendor/ui/README.md` before adding or changing a UI primitive.
- `docs/`, `specs/`, `INSIGHTS.md` in this package for deeper or past context.
