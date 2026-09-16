> **Priority.** This is a course repo. Where course conventions conflict with
> global rules (`~/.claude`), course conventions win inside this repo.

# DevDigest — agent guide

Local-first AI PR reviewer. Course starter: Part-0 works end to end; each lesson adds one feature.

## Before answering

Search the relevant package's `docs/`, `specs/`, and `INSIGHTS.md` first — they are curated
and may already answer it. Then read code.

## Conventions (not obvious from code)

- Not a monorepo workspace: each package has its own `package.json` and lockfile.
  Cross-package code is shared as raw TypeScript through tsconfig path aliases.
- `server` cannot boot, typecheck, or test until `reviewer-core/node_modules` exists.
- Modules are registered statically in `server/src/modules/index.ts` (no filesystem autoload).
- ESM: relative imports carry the `.js` extension. Exception: `server/src/db/schema*`
  imports are extensionless.

## Do-not-touch

- `server/src/vendor/shared/` and `server/src/db/migrations/` — never hand-edit without coordination.
- `server/clones/` — cloned repos, possibly a copy of this one. Don't read or search it.

## Use when

- Stack, commands, architecture, how to run → `README.md`
- Working inside a package → that package's CLAUDE.md: `server/CLAUDE.md`, `client/CLAUDE.md`,
  `reviewer-core/CLAUDE.md`, `e2e/CLAUDE.md` (auto-load is unreliable, VS Code #24987)
- Agent prompt templates, model choice → `docs/agent-prompts/`
- Recording a finding → the touched package's `INSIGHTS.md`; cross-package → the most affected package
