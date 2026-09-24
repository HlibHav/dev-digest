# frontend-ui-architecture — reference

Depth behind [SKILL.md](SKILL.md). Sources for every principle: [README.md](README.md).

## Scope

Owns: where a file goes, when it moves, what a component folder contains, import
directions, barrel policy.

Does not own, and must not re-litigate:

| Question | Skill |
|---|---|
| Should this be memoized? Is this `useEffect` wrong? Too many props? | `react-best-practices` |
| What does `loading.tsx` do? How do route groups work? `generateMetadata`? | `next-best-practices` |
| How do I test this component? | `react-testing-library` |
| Is this zod schema right? | `zod` |

## Grandfathering

This skill governs **new and changed** code. Existing structure that predates it
stays as it is until someone touches that file for its own reasons.

Known deviations that are **not** findings:

- Eight `export *` barrels: `src/components/{app-shell,showcase,page-shell}/index.ts`
  and the five re-exports in `src/lib/hooks/index.ts`.
- Pages that inline user-facing text instead of going through next-intl.
- `src/vendor/ui` and `src/vendor/shared` — vendored, never restructured locally.

Flag a deviation only when the task already changes that file. Never open a
restructuring diff as a side effect.

## The tree

```
client/src/
├── app/                                  # routes only
│   ├── layout.tsx                        # Server Component: locale, providers
│   └── repos/[repoId]/pulls/
│       ├── page.tsx                      # thin: wires data → view
│       ├── constants.ts                  # shared by 2+ siblings in THIS route
│       ├── helpers.ts
│       ├── styles.ts
│       └── _components/
│           ├── PRRow/
│           │   ├── PRRow.tsx
│           │   ├── PRRow.test.tsx
│           │   ├── constants.ts
│           │   ├── helpers.ts
│           │   ├── helpers.test.ts
│           │   ├── styles.ts
│           │   └── index.ts
│           └── FindingsCell/…            # same shape
├── components/                           # used by 2+ routes; kebab-case folders
│   └── run-cost-badge/
│       ├── RunCostBadge.tsx
│       ├── RunCostBadge.test.tsx
│       ├── format.ts                     # helper named for its job when it has one
│       └── index.ts
├── lib/
│   ├── api.ts                            # the only fetch client
│   ├── hooks/{core,agents,reviews,trace,repo-intel}.ts   # react-query, by domain
│   ├── types.ts                          # re-export of @devdigest/shared
│   └── providers.tsx  theme.tsx  toast.tsx  repo-context.tsx
├── i18n/request.ts
└── vendor/                               # do not restructure
    ├── shared/                           # @devdigest/shared contracts
    └── ui/                               # @devdigest/ui design system
```

Counts as of 2026-09-20: 10 `_components/` folders, 36 component folders beneath
them, 7 shared components in `src/components/`.

## Where each kind of file goes

| What | Used by one component | Used by 2+ siblings in one route | Used by 2+ routes |
|---|---|---|---|
| Component | `_components/<Name>/<Name>.tsx` | `_components/<Name>/` beside the others | `src/components/<kebab-name>/` |
| Constant | module-level `const` at the top of the file | route-level `constants.ts` | the shared component's own folder, or `src/lib/` if it is not UI |
| Pure function | `helpers.ts` in the component folder | route-level `helpers.ts` | `src/lib/<name>.ts` (see `github-urls.ts`, `model-label.ts`) |
| Styles | `styles.ts` in the component folder | route-level `styles.ts` | the shared component's folder |
| Hook over server state | — | — | always `src/lib/hooks/<domain>.ts` |
| Domain type | — | — | `@devdigest/shared` via `src/lib/types.ts` |
| User-facing string | — | — | `messages/en/<namespace>.json`, referenced by `labelKey` |

Nothing moves *up* on the first use. Nothing moves *down* once shared.

## Nesting

A component folder that grows subcomponents gets its own `_components/`:

```
RunTraceDrawer/
├── RunTraceDrawer.tsx
├── RunTraceDrawer.test.tsx
├── constants.ts  helpers.ts  styles.ts  index.ts
└── _components/
    ├── TraceBody/  PromptBlock/  ToolCallRow/  …
    └── atoms.tsx                 # several one-liner components, not worth a folder each
```

Outside `app/`, the `_` prefix carries no routing meaning, so shared components
nest their children directly: `src/components/diff-viewer/{CodeLine,FileCard,…}/`.
Each child still has its own `index.ts`.

`atoms.tsx` is the escape hatch: two or three trivial presentational components
used only by their parent, in one file, rather than three folders.

## Naming

| Thing | Convention | Example |
|---|---|---|
| Component folder under `app/**` | PascalCase | `FindingsPanel/` |
| Component folder under `src/components/` | kebab-case | `run-cost-badge/` |
| Component file | PascalCase, matches its folder | `FindingsPanel.tsx` |
| Colocated support file | lowercase, fixed names | `constants.ts` `helpers.ts` `styles.ts` |
| A helper file with one clear job | named for the job | `format.ts` `comments.ts` |
| Hook | `useX`, in `src/lib/hooks/<area>.ts` | `usePulls` |
| Test | beside its subject | `FindingsPanel.test.tsx` `helpers.test.ts` |
| i18n namespace | camelCase file, camelCase nested keys | `prReview.json` → `list.columnHints.cost` |

## Content rules for the three support files

**`constants.ts`** — colour tokens as CSS custom properties (`var(--warn)`, never
a hex), grid column definitions, i18n `labelKey` strings, enumerations of domain
values. Never user-facing text: the constant holds the key, next-intl holds the
words.

```ts
export const STATUS_META: Record<string, { c: string; labelKey: string }> = {
  needs_review: { c: "var(--warn)", labelKey: "needs_review" },
  reviewed:     { c: "var(--ok)",   labelKey: "reviewed" },
};
```

**`helpers.ts`** — pure functions. No `import … from "react"`, no JSX, no hooks,
no I/O. Typed against `@devdigest/shared` contracts. Unit-tested without rendering
anything, in `helpers.test.ts`.

```ts
import type { FindingRecord, Severity } from "@devdigest/shared";
export const CELL_SEVERITIES: readonly Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];
export function sortBySeverity(findings: FindingRecord[]): FindingRecord[] { … }
```

A function that reaches for a hook is not a helper — it is a hook, and it belongs
in `src/lib/hooks/`. A "helper" that knows about HTTP is not a helper either; that
is `src/lib/api.ts`.

**`styles.ts`** — one exported object `s`, values typed `CSSProperties`, functions
for variant-dependent styles. This project uses inline style objects, not Tailwind
classes, despite postcss being installed. Colours come from CSS custom properties.

```ts
import type { CSSProperties } from "react";
import { GRID } from "./constants";
export const s = {
  row: (hover: boolean): CSSProperties => ({ display: "grid", gridTemplateColumns: GRID, … }),
};
```

## Business logic

The placement rule, in order of preference:

1. **Derive during render.** A value computable from props and state is computed
   in the component body or in a `helpers.ts` function called from it. Never in an
   `useEffect` that writes state — the React docs are explicit that Effects are an
   escape hatch for synchronising with external systems, and that logic which runs
   because the user did something belongs in the event handler.
2. **Pure function in `helpers.ts`** when the derivation is more than a line, is
   reused, or deserves a test. This is the default home for domain rules on the
   client.
3. **`src/lib/hooks/<domain>.ts`** for anything involving server state: fetching,
   polling, SSE, mutations and their cache invalidation. Invalidation is colocated
   with the mutation (`onSuccess: qc.invalidateQueries(…)`), not scattered into
   components.
4. **`src/lib/api.ts`** for the transport itself. It is the only place that calls
   `fetch`, and it normalises errors into `ApiError` so the toast/inline/full-screen
   error taxonomy can branch on status.

Run status is server-sourced: `usePrActiveRuns` polls and `useRunEvents` streams.
Do not mirror it into local state — it breaks on reload.

## Import boundaries

Allowed direction: `app/**` → `src/components` → `src/lib` → `src/vendor`.

Forbidden:

- One route's `_components/` imported by another route. A `_components/` folder is
  private to its route segment — that is the whole point of the underscore. Cross-route
  need means promote to `src/components/`.
- `src/lib/**` or `src/components/**` importing from `app/**`.
- `src/vendor/**` importing anything application-specific.
- A component importing `src/lib/api.ts` directly instead of a hook.

Nothing enforces this mechanically today: `client/` has no linter configured, and
the root CLAUDE.md states typecheck plus tests are the whole gate. The rule is
review-enforced. If it starts being violated, the fix is `import/no-restricted-paths`
zones (bulletproof-react ships a transferable config) or `eslint-plugin-boundaries`
v7 with flat config — that is a decision about introducing ESLint to the package,
not something this skill does on its own.

## Barrels

Every component folder has an `index.ts` with a named re-export:

```ts
export { FindingsPanel, FindingsPanel as default } from "./FindingsPanel";
```

Rules: named exports only in new code; no `export *`; no barrel above the component
folder (there is no `src/components/index.ts` and there should not be).

This is a deliberate call against bulletproof-react, which drops barrels entirely
over Vite tree-shaking and dev-server cost. Two reasons it does not transfer: this
is Next.js with its own bundler, and the convention is already in place across all
36 component folders — consistency is worth more than an unmeasured cost. The
counter-argument is real and documented in README.md; if Next's bundler is ever
shown to suffer here, revisit it as a decision rather than drifting away from it.

## Next.js specifics

Only what is not already in `next-best-practices`.

- **Colocation inside `app/` is safe.** A folder is not routable until it contains
  `page.tsx` or `route.ts`, so support files sit next to routes without becoming
  URLs. The `_` prefix makes the exemption explicit and survives future file
  conventions.
- **This package has effectively no RSC boundary.** 55 of 118 `.tsx` files under
  `src` carry `"use client"`, there are zero route handlers, and there is no
  server-side fetching — every read goes through client-side react-query against
  the separate Fastify API. The only true Server Components are `app/layout.tsx`,
  `i18n/request.ts` and two pass-through pages.
- **Therefore: do not use this codebase as the example for a server/client split.**
  A route entry here becomes a Client Component the moment it needs a hook, and
  that is correct *for this architecture*. When a task genuinely needs an RSC
  boundary decision, go to the Next.js docs linked in README.md.
- Adding a route handler under `app/api/` would be a new architectural direction,
  not a local choice — the API lives in `server/`. Raise it before writing one.

## When the rules run out

Three situations the table above does not answer. Ask rather than guess:

1. A component is needed by two routes **and** carries domain knowledge specific
   to one of them. Neither `src/components/` (business-agnostic by convention) nor
   either route is right. The sources disagree here too — FSD pushes it down to an
   `entities/` layer, others add a `features/core/`. This project has neither.
2. A helper is pure but knows a server-side rule that also exists in `server/`.
   Duplicating it silently is the failure mode; it may belong in the shared
   contract package instead.
3. Any structure that would need a new top-level folder under `src/`. That is an
   architecture decision, not a placement decision.
