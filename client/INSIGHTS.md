# client — insights

Findings that are true about this code but not visible in it. Maintained by the
`engineering-insights` skill: read before working here, add an entry after a
non-trivial task, skip routine changes. Append-only — never rewrite or delete an
entry; correct a stale one with a dated sub-bullet beneath it. Sections are
fixed — add to the one that fits.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-09-26** — "A run finished, refetch reviews" is tab-local: `onRunDone` → `refetchReviews()` fires from `RunStatus`, which only mounts inside `FindingsTab`. Any other tab that must refresh when a run ends (the Files changed tab's finding counters) has to watch the polled `usePrActiveRuns` list itself and invalidate `["reviews", prId]` on the running → idle edge; nothing else in `page.tsx` does it for you. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx:46`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:156`

- **2026-09-20** — This package has effectively no RSC boundary, so don't use it as the reference for a Next.js server/client split. 55 of 118 `.tsx` under `src` carry `"use client"`, `find src/app -name route.ts` returns 0, and there is no server-side fetching: every read goes through client-side react-query against the separate Fastify API. Only `src/app/layout.tsx`, `src/i18n/request.ts` and two pass-through pages are true Server Components; a route entry becomes a Client Component the moment it needs a hook. When a task needs an RSC-boundary example, go to the Next.js docs, not to this code. Evidence: `client/src/app/repos/[repoId]/pulls/page.tsx:3`, `client/src/app/agents/page.tsx:1`

## Tool & Library Notes

- **2026-09-26** — Adding a `useTranslations("<ns>")` call to a shared `diff-viewer` component (`FileCard`, `CodeLine`) makes every existing test that renders `DiffViewer` need that namespace in its `NextIntlClientProvider`; next-intl logs `MISSING_MESSAGE` to stderr instead of throwing, so the suite stays green while the strings render as keys. Before adding one, grep test files for `<DiffViewer`/`<FileCard` and add the namespace there (`src/test/smoke.test.tsx` was the only one). Evidence: `client/src/test/smoke.test.tsx:8`, `client/src/components/diff-viewer/FileCard/FileCard.tsx:51`

- **2026-09-20** — The client can import **types** from `@devdigest/shared` but not **values**: the vendored barrel re-exports with ESM `.js` specifiers, and the Next bundler fails every one of them (`Module not found: Can't resolve './contracts/findings.js'`, ×11, page 500s). Every pre-existing client import from the barrel is `import type`, which is erased, so nothing had ever hit it. For a runtime value, deep-import the contract file — `@devdigest/shared/contracts/knowledge` resolves through the `@devdigest/shared/*` path alias — instead of copying the value into client code. Evidence: `client/src/app/skills/_components/SkillsListView/_components/SkillCard/SkillCard.tsx:12`, `client/src/vendor/shared/index.ts:17`, `client/tsconfig.json:25`

- **2026-09-16** — Vendored `Chip` renders a plain `<button>` with no `aria-pressed` prop, and `Toggle` renders `role="switch"`, not `button`. In tests, query the toggle with `getByRole("switch")` and assert a chip filter's active state through what it renders (the filtered cards), not an ARIA attribute; add the prop upstream rather than patching `src/vendor/ui` locally. Evidence: `client/src/vendor/ui/primitives/Chip.tsx:4`, `client/src/vendor/ui/primitives/Toggle.tsx:15`

## Recurring Errors & Fixes

## Session Notes

- **2026-09-26** — Smart Diff: Files changed grouped by role, findings inline under the diff line, order switch → Codebase Patterns, Tool & Library Notes. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx:32`

- **2026-09-20** — Skills library at `/skills` plus the agent editor's Skills tab (attach, vet, drag to reorder) → Tool & Library Notes. Evidence: `client/src/app/skills/_components/SkillsListView/SkillsListView.tsx:19`

- **2026-09-20** — Research pass for a planned `frontend-architecture` skill (NotebookLM deep research, annotated sources) → Codebase Patterns. Evidence: `.claude/skills/frontend-architecture/README.md:1`

- **2026-09-16** — Severity counter pills with filter in the findings panel → Tool & Library Notes
  - **2026-09-16** — Refined: the session's main code change, the pill row rendered for present severities. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:75`

## Open Questions
