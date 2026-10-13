# Implementation Report: Next config .js -> .ts extension alias
Status: done
Mode: fix

## Steps
| id | BE/UI | status | files touched | note |
|---|---|---|---|---|
| fix | UI | done | client/next.config.mjs | Added a `webpack(config)` hook that sets `resolve.extensionAlias` (`.js` -> `.ts`, `.tsx`, `.js`; `.mjs` -> `.mts`, `.mjs`). The existing next-intl wrapper, `reactStrictMode` and `env` are unchanged. |

Turbopack: not used. `client/package.json` has `dev: next dev -p 3000`, `build: next build` and `start: next start -p 3000`, with no `--turbo` or `--turbopack` flag. A grep of `e2e/scripts`, `scripts/` and `package.json` for "turbo" found nothing. I added no `turbopack.*` config. If someone later runs dev with `--turbopack`, they will need `turbopack.resolveExtensions` or an alias.

## Skills applied
- preloaded: onion-architecture, frontend-ui-architecture
- invoked through Skill: next-best-practices (the bundling guidance is the relevant part)
- named by the plan but not invoked: none

## Self-review
- next-best-practices — `next.config.mjs` diff — no issues. The alias spreads any existing `extensionAlias`. It adds `.js` and `.mjs` aliases only, and `.js` keeps itself as the last fallback.

## Tests
| command | package | exit code | result |
|---|---|---|---|
| `pnpm typecheck` | client | 0 | clean on re-run. The first run failed on the `.next/types/**` include. That was a race with `next build` rewriting `.next/types`, not a source error. |
| `pnpm test` | client | 0 | 79 files, 483 tests passed |
| `pnpm exec next build` | client | 0 | succeeded with the route table printed. Per your report it would have failed on the `./findings.js` import before this change. |

## Deviations from plan
- None. I did not start a dev server. I did not check the :3200 dev server in a browser. Its running process may need a restart to pick up the config change, because Next does not hot-reload `next.config.mjs`.

## Not done / blocked
- None.

## Insight candidates
- client — The vendored shared contracts import sibling files as `./x.js` while the sources are `.ts`. vitest and tsc resolve that. webpack does not unless `resolve.extensionAlias` is set in `next.config.mjs`, so unit tests stay green while every page 500s on `next dev` and `next build`. Run `next build` after adding a vendored contract that imports a sibling file.

## Handoff to reviewers
- Surfaces and files touched: `/Users/Glebazzz/Claude/PROJECTS/NEO/dev-digest/.claude/worktrees/eval-pipeline/client/next.config.mjs`
- main session: restart the :3200 dev server so it loads the new config. Don't run `pnpm typecheck` while a `next build` or `next dev` is rewriting `.next/types`. `client/INSIGHTS.md` was not touched.
- No architecture, acceptance or security verdict is given here.