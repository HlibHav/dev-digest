> **Priority.** This is a course repo. Where course conventions conflict with
> global rules (`~/.claude`), course conventions win inside this repo.

# DevDigest — agent map

## Before answering

Search the touched package's `docs/`, `specs/`, and `INSIGHTS.md` first — they
may already answer the question. Read code only after that.

## What this repo is

Local-first AI pull-request review. Course starter: Part-0 works end to end;
each lesson adds one feature. Unused DB tables, platform modules, and prompt
slots are intentional scaffolding for later lessons — don't delete them as
dead code, don't wire them up unless the task asks for it.

## Packages

No workspace — 4 independent packages, each with its own lockfile. Run
commands from inside the package directory. Node >= 22.


| Dir              | Manager | Role                             | Verify                          |
| ---------------- | ------- | -------------------------------- | ------------------------------- |
| `server/`        | pnpm    | Fastify API, Drizzle, repo-intel | `pnpm typecheck && pnpm test`   |
| `reviewer-core/` | npm     | Pure review engine, TS source    | `npm run typecheck && npm test` |
| `client/`        | pnpm    | Next.js 15 studio                | `pnpm typecheck && pnpm test`   |
| `e2e/`           | npm     | Browser flows, seeded data       | `npm run e2e:hermetic`          |


## Cross-package wiring

- Packages import each other as raw TypeScript through tsconfig path aliases,
not as published modules.
- `server` cannot boot, typecheck, or test until `reviewer-core` has
`node_modules` (`cd reviewer-core && npm ci`).
- A change in `reviewer-core/` must also pass `server`'s checks.
- `@devdigest/shared` exists twice: `server/src/vendor/shared` is canonical,  
`client/src/vendor/shared` is a hand copy — see  
`.claude/rules/shared-contracts.md`.

## Definition of done

- Run the Verify command (above) for every package you touched.
- `server` integration tests (`*.it.test.ts`) skip silently without Docker. A
run with skipped tests has not verified DB behaviour — say so, don't call it green.

## Never

- Read, grep, or glob `server/clones/` — cloned user repos, possibly a full
copy of this repo. Matches there point you at the wrong files.

## Read when

- The package `CLAUDE.md` for the area you're touching — `server/CLAUDE.md`,
`client/CLAUDE.md`, `reviewer-core/CLAUDE.md`, `e2e/CLAUDE.md`. These load
on their own when you open a matching file, but auto-load has a known bug
(VS Code extension #24987) — open the file yourself if in doubt.
- `<package>/INSIGHTS.md` for that package's past findings. Add a line after
a non-trivial task; skip routine changes. A finding spanning 2+ packages
goes in the INSIGHTS.md of the most-affected package (e.g. `vendor/shared`
→ `server`).

