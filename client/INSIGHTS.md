# client — insights

Findings that are true about this code but not visible in it. Maintained by the
`engineering-insights` skill: read before working here, add an entry after a
non-trivial task, skip routine changes. Append-only — never rewrite or delete an
entry; correct a stale one with a dated sub-bullet beneath it. Sections are
fixed — add to the one that fits.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-10-03** — `RoleGroup` and `FileCard` read `open` from a `useState` initialiser, so a later `focus` prop does not reopen them. The click-through from the PR Brief reopens them by keying a reset on `seenFocusKey` (set during render, no effect). The key must include the line, otherwise a second click on another line of the same file never re-scrolls. Evidence: `client/src/components/diff-viewer/FileCard/FileCard.tsx:64`, `client/src/components/diff-viewer/RoleGroup/RoleGroup.tsx:45`

- **2026-10-02** — A new agent-editor tab needs two edits, not one: `AgentEditor/constants.ts` and the page's own `VALID_TABS`. The page filters `?tab=` and falls back to `config` for anything unknown. The Context tab was built, tested and green, yet unreachable in the app, because its unit tests render `AgentEditor` with `tab` passed in directly. Add a `page.test.tsx` case for `?tab=<new>`. Evidence: `client/src/app/agents/[id]/page.tsx:17`, `client/src/app/agents/[id]/page.test.tsx:1`

- **2026-09-26** — "A run finished, refetch reviews" is tab-local: `onRunDone` → `refetchReviews()` fires from `RunStatus`, which only mounts inside `FindingsTab`. Any other tab that must refresh when a run ends (the Files changed tab's finding counters) has to watch the polled `usePrActiveRuns` list itself and invalidate `["reviews", prId]` on the running → idle edge; nothing else in `page.tsx` does it for you. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx:46`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:156`

- **2026-09-20** — This package has effectively no RSC boundary, so don't use it as the reference for a Next.js server/client split. 55 of 118 `.tsx` under `src` carry `"use client"`, `find src/app -name route.ts` returns 0, and there is no server-side fetching: every read goes through client-side react-query against the separate Fastify API. Only `src/app/layout.tsx`, `src/i18n/request.ts` and two pass-through pages are true Server Components; a route entry becomes a Client Component the moment it needs a hook. When a task needs an RSC-boundary example, go to the Next.js docs, not to this code. Evidence: `client/src/app/repos/[repoId]/pulls/page.tsx:3`, `client/src/app/agents/page.tsx:1`

## Tool & Library Notes

- **2026-10-05** — The vendored `Icon` registry has `Plus`, `Folder` and `Upload` but no `Download` (or `FolderPlus`). The Project Context toolbar imports `Download` straight from `lucide-react`, the only direct `lucide-react` import outside `src/vendor` as of bf0ce1f. That is a recorded stopgap, not a pattern to copy: when a second icon is missing, add it to the registry upstream and switch this import too, because `src/vendor/ui/README.md:34` calls `icons.tsx` the single source. Evidence: `client/src/app/repos/[repoId]/context/_components/ProjectContextView/ProjectContextView.tsx:15`, `client/src/vendor/ui/icons.tsx`

- **2026-10-03** — The vendored `Markdown` primitive accepts only `children`, with no `components` or `urlTransform` prop. It drops raw HTML and blanks `javascript:` hrefs, but it still renders remote images and live links. When the Markdown is written by a model from untrusted repo text, an injected `![x](https://attacker/p.png)` becomes a request beacon. For text like that, render a local `ReactMarkdown` with `a` and `img` renderers that output plain text, instead of editing `src/vendor/ui`. The tree-level override also catches reference links, `<https://…>` and bare GFM autolinks, which a regex pass misses. Evidence: `client/src/vendor/ui/primitives/Markdown.tsx:6`, `client/src/app/repos/[repoId]/onboarding/_components/OnboardingTourView/_components/OverviewBody/OverviewBody.tsx:23`

- **2026-10-03** — Several feature models share the same registry default. Intent, Conventions and now Risk Brief all default to `openai/gpt-4.1-mini` (`platform.ts:59,66,84`), so in a Settings test `screen.getByText("openai/gpt-4.1-mini")` throws on multiple matches. Find the feature's label first, take its row, and query inside it with `within(row)`. Evidence: `client/src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/SettingsModels.test.tsx:24-27`

- **2026-10-03** — Three test-environment traps that cost the PR Brief lanes time. `@testing-library/user-event` is not installed, so use `fireEvent` and a native `focus()` for tab-order checks. jsdom has no `Element.prototype.scrollIntoView`, so spy on it by assigning the prototype and restoring it afterwards. Inside the `srt` sandbox `pnpm typecheck` fails with `TS5033` (EPERM writing `tsconfig.tsbuildinfo`); run `tsc --noEmit --incremental false` there. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.test.tsx:212`

- **2026-10-03** — React Query: do not read `refetch` off the hook result during render to re-read after a parent refresh (it narrows tracking), and do not trust `isPending` to block a double click, since it lags the click by a render. Re-read with `qc.refetchQueries({ queryKey, exact: true })` from an effect keyed on a ref'd value, and guard the mutation with a `useRef` flag. Evidence: `client/src/lib/hooks/brief.ts:39`, `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBriefCard/PrBriefCard.tsx:53`

- **2026-09-26** — Adding a `useTranslations("<ns>")` call to a shared `diff-viewer` component (`FileCard`, `CodeLine`) makes every existing test that renders `DiffViewer` need that namespace in its `NextIntlClientProvider`; next-intl logs `MISSING_MESSAGE` to stderr instead of throwing, so the suite stays green while the strings render as keys. Before adding one, grep test files for `<DiffViewer`/`<FileCard` and add the namespace there (`src/test/smoke.test.tsx` was the only one). Evidence: `client/src/test/smoke.test.tsx:8`, `client/src/components/diff-viewer/FileCard/FileCard.tsx:51`

- **2026-09-20** — The client can import **types** from `@devdigest/shared` but not **values**: the vendored barrel re-exports with ESM `.js` specifiers, and the Next bundler fails every one of them (`Module not found: Can't resolve './contracts/findings.js'`, ×11, page 500s). Every pre-existing client import from the barrel is `import type`, which is erased, so nothing had ever hit it. For a runtime value, deep-import the contract file — `@devdigest/shared/contracts/knowledge` resolves through the `@devdigest/shared/*` path alias — instead of copying the value into client code. Evidence: `client/src/app/skills/_components/SkillsListView/_components/SkillCard/SkillCard.tsx:12`, `client/src/vendor/shared/index.ts:17`, `client/tsconfig.json:25`

- **2026-09-16** — Vendored `Chip` renders a plain `<button>` with no `aria-pressed` prop, and `Toggle` renders `role="switch"`, not `button`. In tests, query the toggle with `getByRole("switch")` and assert a chip filter's active state through what it renders (the filtered cards), not an ARIA attribute; add the prop upstream rather than patching `src/vendor/ui` locally. Evidence: `client/src/vendor/ui/primitives/Chip.tsx:4`, `client/src/vendor/ui/primitives/Toggle.tsx:15`

## Recurring Errors & Fixes

- **2026-10-05** — On the agent Context tab an inherited doc's row renders a native `<input type="checkbox" disabled>` (AC-15: detach it on the skill), so `getAllByRole("checkbox").forEach(b => expect(b).not.toBeDisabled())` fails whenever the fixture has an inherited doc. For a "the warning blocks nothing" check, query the own rows by accessible name, `getByRole("checkbox", { name: "Attach <path>" })`. The skill tab has no inherited rows, so every checkbox there is fair game. Evidence: `client/src/components/context-doc-list/ContextDocList.tsx:77-84`, `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.test.tsx` "AC-46"

- **2026-09-28** — Every vendored `Icon.*` (SectionLabel's `icon` prop, `Chip`'s `icon` prop, `Button`'s `icon`/loading spinner) renders a lucide `<svg>`. A test that uses `document.querySelector("svg")` as a stand-in for "no graph rendered" (rather than `queryByLabelText("Blast radius graph")`) fails the moment ANY icon appears anywhere in that render — not just the graph. Drop icon props from components under test with that assertion, or ask for the assertion to be scoped to the graph's `aria-label`. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BlastRadiusCard/BlastRadiusCard.test.tsx:96,129`, `client/src/vendor/ui/primitives/Chip.tsx:22`
  - **2026-09-28** — Refined: the test was the bug, not the icons. `test-writer` fixed the assertion to `queryByLabelText("Blast radius graph")` for "no graph" and to `getByRole("button", { name: /foo/ })` for "still on tree", so a bare `svg` query is gone from the suite. Icons (`SectionLabel`'s, and `Globe`/`Clock` on the endpoint/cron chips) are back — nothing about the design needs to drop them; only scope a "no graph" assertion to the graph's own `aria-label`, never to `document.querySelector('svg')` globally. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BlastRadiusCard/BlastRadiusCard.test.tsx:131-137`, `BlastRadiusCard.tsx:45,68`, `_components/BlastTree/BlastTree.tsx:75,85`

## Session Notes

- **2026-10-05** — Project Context mentor follow-up (coming-soon controls, 8000-token warning, grouped Serializes-as preview) → Recurring Errors & Fixes, Tool & Library Notes. Evidence: `client/src/components/context-doc-list/constants.ts:2`

- **2026-10-03** — PR Brief lane 0 (Risk Brief default in Settings) → Tool & Library Notes. Evidence: `client/src/lib/feature-models.ts:30`

- **2026-10-03** — PR Brief review phase (fix round 1: failed GET shows retry, `setTab` clears `file`/`line`) → Codebase Patterns, Tool & Library Notes ×2. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:82`

- **2026-09-26** — Smart Diff: Files changed grouped by role, findings inline under the diff line, order switch → Codebase Patterns, Tool & Library Notes. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx:32`

- **2026-09-20** — Skills library at `/skills` plus the agent editor's Skills tab (attach, vet, drag to reorder) → Tool & Library Notes. Evidence: `client/src/app/skills/_components/SkillsListView/SkillsListView.tsx:19`

- **2026-09-20** — Research pass for a planned `frontend-architecture` skill (NotebookLM deep research, annotated sources) → Codebase Patterns. Evidence: `.claude/skills/frontend-architecture/README.md:1`

- **2026-09-16** — Severity counter pills with filter in the findings panel → Tool & Library Notes
  - **2026-09-16** — Refined: the session's main code change, the pill row rendered for present severities. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:75`

- **2026-09-28** — Blast radius card (homework-5, implementer B): `useBlastRadius` hook, `BlastRadiusCard` + `BlastTree`/`BlastGraph`/`IndexNotice`, OverviewTab two-column grid → Recurring Errors & Fixes. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BlastRadiusCard/BlastRadiusCard.tsx:1`

## Open Questions
