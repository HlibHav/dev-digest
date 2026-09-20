# reviewer-core — @devdigest/reviewer-core

npm, not pnpm — this package has its own `package-lock.json`. It emits no JS:
`npm run typecheck` **is** the build. `server` imports `src/` directly through
a tsconfig path alias — never add `dist/`, a bundler, or an import from a
build output.

## Commands

```sh
npm test            # vitest, stubbed LLMProvider — no keys, no network
npm run typecheck
```

## Invariants

- Pure. No database, GitHub, filesystem, or env access — the only side effect
  is the injected `LLMProvider`. Anything needing I/O belongs in `server`.
- Public surface is `src/index.ts`. Adding/removing an export is an API
  change for `server` — run its typecheck too.
- `groundFindings` runs on every strategy. Never add a bypass — it's what
  stops hallucinated locations.
- `score` is recomputed from the findings that survive grounding
  (`scoreFromFindings`), never trusted from the model.
- `verdict` is still the model's own, unlike `score` — a known
  inconsistency, not yet decided. Ask before "fixing" it silently.
- Untrusted text (diff, PR description, repo map, callers, specs) goes
  through `wrapUntrusted`; `INJECTION_GUARD` stays appended to the system
  prompt.

## Gotchas

- Contract types (`Review`, `Finding`, …) come from
  `../server/src/vendor/shared` via alias — editing one is a server-side
  change first. See `.claude/rules/shared-contracts.md`.

## Read when

- `README.md` for the pipeline diagram and full public API.
- `test/run.test.ts` for the executable contract of `reviewPullRequest`.
- `docs/`, `specs/`, `INSIGHTS.md` in this package for deeper or past context.
