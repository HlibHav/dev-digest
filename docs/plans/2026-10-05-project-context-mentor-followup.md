# Implementation Plan: Project Context mentor follow-up (coming-soon controls, 8000-token budget warning, grouped "Serializes as")
Status: ready
Spec: specs/2026-10-02-project-context.md (SPEC-2026-10-02-project-context), the 2026-10-05 amendment only: AC-10 (rewritten), AC-20 (rewritten), AC-44 to AC-49
Execution mode: single-agent, chosen by the user

## Open questions & recommendations
- better way — AC-45 — default assumed: the Download icon is imported directly from `lucide-react` (already a direct dependency at `client/package.json:17`), because the vendored `Icon` registry (`client/src/vendor/ui/icons.tsx`) has `Plus`, `Folder` and `Upload` but no `Download`, and client INSIGHTS (2026-09-16) says don't patch `src/vendor/ui` locally. This bypasses the registry, which `client/src/vendor/ui/README.md:34` calls the single source. The spec rules out `Icon.Upload`. — recommendation: add `Download` to the vendored registry upstream later and switch the import — blocking: no
- gap — AC-45 — default assumed: the verify line doesn't pin the DOM order (Plus, Folder, Download, Refresh), or that the controls are absent in the empty and not-cloned states, though the AC text says both. The plan's tests pin both. — recommendation: spec-creator can add both to AC-45's verify line — blocking: no
- gap — AC-20 / AC-48 — default assumed: an attachment with `present: true` whose path is not in the repo doc list (so it has no known category) is left out of the grouped preview, the same as an absent doc. — recommendation: add it to Edge cases if it matters — blocking: no
- gap — Contracts (skill context) — default assumed: `SkillContext.serialized` stays in the contract and the server keeps computing it, but the client no longer renders it. Removing it is out of scope by the spec. — recommendation: decide later whether to drop the field (non-additive, its own decision) — blocking: no
- design — AC-44 / AC-20 — default assumed: (a) the Refresh button keeps its visible text "Refresh", while design-1 shows an icon only, so the AC-5 tests keep matching `/refresh/i`. (b) The grouped preview renders real `h3` headings with the design-3 wording and `li` paths, without the literal `## ` and `- ` prefixes design-3 shows, so screen readers reach the headings (the spec's accessibility NFR). The box keeps the mono look. — blocking: no
- design — AC-45 — design-1's second icon is a plain folder. The vendored `Icon.Folder` is used, since the registry has no `FolderPlus`. Placement follows design-1: tree header, before Refresh. — blocking: no

## Acceptance criteria (from the spec, verbatim)
See `specs/2026-10-02-project-context.md` lines for AC-10, AC-20, AC-44, AC-45, AC-46, AC-47, AC-48, AC-49 (the 2026-10-05 amendment). They are the source of truth; this plan does not restate them to avoid drift.

AC-1 to AC-9, AC-11 to AC-19 and AC-21 to AC-43 are built (#30) and out of scope here. Their existing tests must stay green (the client `pnpm test` gate).

## Traceability
| AC | step | test | proof |
|---|---|---|---|
| AC-10 | 4 | `client/src/app/repos/[repoId]/context/_components/ProjectContextView/ProjectContextView.test.tsx` "AC-10: coming-soon controls change nothing; Refresh still re-indexes" (replaces "AC-10: offers no edit, new, folder or upload control; Refresh re-indexes") | red-first unit |
| AC-44 | 4 | same file, "AC-44: preview pane shows a selected Preview tab and a disabled Edit (coming soon) tab" | red-first unit |
| AC-45 | 4 | same file, "AC-45: tree header shows disabled New doc, New folder, Download before an enabled Refresh" + the extended "shows the rewritten empty state and the not-cloned notice" | red-first unit |
| AC-46 | 1, 2 | `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.test.tsx` "AC-46: warns above the 8000-token budget, blocks nothing; 8000 is silent" | red-first unit |
| AC-47 | 1, 3 | `client/src/app/skills/[id]/_components/SkillDetailView/_components/ContextTab/ContextTab.test.tsx` "AC-47: warns above the 8000-token budget, blocks nothing; 8000 is silent" | red-first unit |
| AC-20 | 3 | skill `ContextTab.test.tsx` "AC-20: Serializes as groups present docs under Project specifications, Project docs, Project insights" (replaces "previews the serialized block exactly as the run sends it (AC-20)") | red-first unit |
| AC-48 | 3 | skill `ContextTab.test.tsx` "AC-48: paths keep attachment order within a group; empty groups are hidden" | red-first unit |
| AC-49 | 3 | skill `ContextTab.test.tsx` "AC-49: Serializes as shows paths only, no doc text" | red-first unit |

## Red-first
Tests are written first, against the exact strings in **Contracts & data**. Tests assert literal English text, not `messages.x` lookups, because those keys don't exist yet.
- AC-10 → `ProjectContextView.test.tsx` — "AC-10: coming-soon controls change nothing; Refresh still re-indexes". Replace the old AC-10 test. Select `public-api.md` (content `## Goals`), then `const fetchSpy = vi.spyOn(globalThis, "fetch")` (setup.ts mocks no fetch). `fireEvent.click` each of: tab "Edit (coming soon)", buttons "New doc (coming soon)", "New folder (coming soon)", "Download (coming soon)". Expect `fetchSpy` not called, `state.reindex` not called, no `input[type="file"]`, `queryByRole("dialog")` null, still 2 `doc-folder` and 3 `doc-file` nodes, and heading "Goals" still present. Then click Refresh and expect `state.reindex` called with `"r1"`.
- AC-44 → same file — "AC-44: preview pane shows a selected Preview tab and a disabled Edit (coming soon) tab". After selecting: `getByRole("tab", { name: "Preview" })` has `aria-selected="true"`; `getByRole("tab", { name: "Edit (coming soon)" })` passes `toBeDisabled()` (native `disabled`) and its name contains "coming soon"; heading "Goals" shown. Before any selection, `queryByRole("tab")` is null.
- AC-45 → same file — "AC-45: tree header shows disabled New doc, New folder, Download before an enabled Refresh". `within(getByRole("toolbar", { name: "Doc actions" })).getAllByRole("button")` has accessible names exactly `["New doc (coming soon)", "New folder (coming soon)", "Download (coming soon)", "Refresh"]` in that order. The first three are `toBeDisabled()`; Refresh is `not.toBeDisabled()`. Also extend the existing "shows the rewritten empty state and the not-cloned notice" test: in both states, `queryByRole("button", { name: "New doc (coming soon)" })` and the toolbar are null.
- AC-46 → agent `ContextTab.test.tsx` — "AC-46: warns above the 8000-token budget, blocks nothing; 8000 is silent". Files `own1.md` 5000, `own2.md` 2000, `inh.md` 1001; ctx attached own1 and own2 (present), inherited `inh.md` (present, skill "rubric"). Expect text "Attached docs exceed the 8000-token budget." and the own rows' checkboxes not disabled. Re-render with `inh.md` at 1000 and expect no such text. Repeat both with an extra attached `gone.md` (`present: false`, tokens 0) and expect the same outcomes.
- AC-47 → skill `ContextTab.test.tsx` — "AC-47: warns above the 8000-token budget, blocks nothing; 8000 is silent". Attached 4000 + 4001 → the warning text, every checkbox not disabled; 4000 + 4000 → no warning.
- AC-20 → skill `ContextTab.test.tsx` — "AC-20: Serializes as groups present docs under Project specifications, Project docs, Project insights". Extend the local `file()` helper with a `category` parameter, as the agent test has it. Attached in order `docs/b.md` (docs), `server/INSIGHTS.md` (insights), `specs/public-api.md` (specs), `README.md` (other), plus `specs/gone.md` (`present: false`, not in files). In `getByRole("region", { name: "Serializes as" })`: the `h3` headings, in order, are Project specifications, Project docs, Project insights. Each heading's following list holds the expected paths, `README.md` under Project docs, and `specs/gone.md` appears nowhere in the region. Replaces the old AC-20 test.
- AC-48 → skill `ContextTab.test.tsx` — "AC-48: paths keep attachment order within a group; empty groups are hidden". Attached array `[ {specs/a.md, order 1}, {specs/b.md, order 0} ]`: the array order differs from `order`, so the test pins the sort. Expect `specs/b.md` before `specs/a.md` in the region, and only the "Project specifications" heading. Re-render with orders swapped and expect `specs/a.md` first.
- AC-49 → skill `ContextTab.test.tsx` — "AC-49: Serializes as shows paths only, no doc text". Override `useContextDoc` to return `{ content: "## Goals" }` for any path. Expect `specs/a.md` in the region and `within(region).queryByText(/Goals/)` null.
- Also rewrite (not an AC, but it would go vacuous): skill "shows no preview when nothing is attached" → `queryByRole("region", { name: "Serializes as" })` is null, in place of the `pre` check.

## Review focus
- `attached` array order differs from the `order` field → pinned by `groupSerializedPaths` in skill `ContextTab/helpers.test.ts`, and by the AC-48 test in step 3.
- An attachment with `present: true` whose path is missing from the repo doc list → skipped; pinned by `helpers.test.ts` "skips attachments not in the doc list" in step 3.
- AC-45 DOM order and the controls' absence in the empty and not-cloned states → pinned by the AC-45 test and the extended empty-state test in step 4.
- Budget boundary exactly 8000 versus 8001 → pinned by `context-doc-list/helpers.test.ts` "exceedsTokenBudget is strict greater-than" in step 1.
- Clicking a disabled control triggers neither reindex nor fetch → pinned by the AC-10 test in step 4.

## Context read
- `specs/2026-10-02-project-context.md:91-113` — the eight ACs in scope. Contracts note leaves the grouping location to the plan; the plan settles it as client-side.
- `client/INSIGHTS.md:35` — no runtime values from the `@devdigest/shared` barrel, so the group order is a local literal array, never `ContextDocCategory.options`. Only `import type` from the barrel.
- `client/INSIGHTS.md:33` — a missing next-intl namespace renders keys without throwing, so each tab renders the warning from its own namespace and there is no shared component calling `useTranslations`.
- `client/INSIGHTS.md:29` — no `user-event` (use `fireEvent`); TS5033 in srt (use `tsc --noEmit --incremental false`).
- `client/INSIGHTS.md:37` — don't patch `src/vendor/ui` locally, so the Download icon comes from `lucide-react` directly.
- `.claude/skills/frontend-ui-architecture/reference.md:80` — a constant used by 2+ routes lives in the shared component's own folder, so it goes in `client/src/components/context-doc-list/constants.ts`.
- `client/src/components/context-doc-list/helpers.ts:97` — `contextTotals` already gives the AC-14 total (dedup, present only), and the AC-46 comparison reuses it.
- `client/src/app/skills/[id]/.../ContextTab/ContextTab.tsx:86,120` — the skill total is computed inline, and the preview renders `ctx.serialized` in a `pre`, which gets replaced.
- `client/src/app/repos/[repoId]/context/.../ProjectContextView.tsx:48-59`, `_components/DocPreview/DocPreview.tsx:18-25` — tree header and preview header where the controls go.
- `client/src/vendor/ui/primitives/Button.tsx:10-22,70` — `Button` forwards `aria-label`, `title`, native `disabled`; `IconBtn` has no `disabled`, so use `Button`.
- `client/src/test/setup.ts` — fetch is not globally mocked, so `vi.spyOn(globalThis, "fetch")` is a valid spy target.
- e2e: no flow references "Serializes as" or Project Context strings (grep of `e2e/specs`).

## Affected surfaces
- client → context-doc-list (shared component) → `client/src/components/context-doc-list/constants.ts` (new), `helpers.ts` (changed), `helpers.test.ts` (changed), `index.ts` (changed)
- client → agents route → `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.tsx` (changed), `client/messages/en/agents.json` (changed)
- client → skills route → `client/src/app/skills/[id]/_components/SkillDetailView/_components/ContextTab/ContextTab.tsx`, `styles.ts` (changed), `helpers.ts` + `helpers.test.ts` (new), `client/messages/en/skills.json` (changed)
- client → repos/context route → `ProjectContextView/ProjectContextView.tsx`, `styles.ts`, `_components/DocPreview/DocPreview.tsx` (changed), `client/messages/en/context.json` (changed)
- server, reviewer-core, shared contracts, DB: unchanged

## Constraints
- No change to the vendored shared contract — source: `.claude/rules/shared-contracts.md`, `client/CLAUDE.md` Rules. Client-side grouping: `SpecFile.category` joined on path with `SkillContext.attached`.
- Reviewer-core and the run prompt stay unchanged — source: spec Non-goals ("Grouping the run prompt").
- Place near the consumer; promote on the second route — source: `.claude/skills/frontend-ui-architecture/SKILL.md:11-12`, reference.md:80. The budget constant and predicate go in `context-doc-list` (two routes); the grouping helper stays colocated in the skill ContextTab (one consumer).
- `helpers.ts` is pure, with no React and typed against `@devdigest/shared` (type imports only) — source: reference.md:137.
- Every user-facing string goes in `messages/en/<ns>.json` — source: root `CLAUDE.md` Naming, spec NFR i18n.
- "Coming soon" lives in the accessible name or visible text, not a tooltip alone — source: spec NFR accessibility. Use `aria-label` plus `title` and a native `disabled`.
- No runtime import from the `@devdigest/shared` barrel — source: `client/INSIGHTS.md:35`.
- Don't patch `src/vendor/ui` — source: `client/CLAUDE.md` Map, `client/INSIGHTS.md:37`.
- Doc paths render as plain text, never markup or links — source: spec Untrusted inputs. React text nodes only, no `dangerouslySetInnerHTML`, no `Markdown`.

## Skills for the implementer
- client/** → frontend-ui-architecture, next-best-practices, react-best-practices, react-testing-library, security, zod
- server/** / reviewer-core/** → none (not touched)

## Lanes
n/a — single-agent

## Steps
1. [UI] client — budget constant and predicate in the shared context-doc-list
   - files: `client/src/components/context-doc-list/constants.ts` (new), `helpers.ts` (changed), `helpers.test.ts` (changed), `index.ts` (changed)
   - layer: shared component (`src/components`) · skills: frontend-ui-architecture, react-testing-library
   - turns green: none directly (feeds AC-46, AC-47)
   - test first: `client/src/components/context-doc-list/helpers.test.ts` — "exceedsTokenBudget is strict greater-than": `exceedsTokenBudget(8000) === false`, `exceedsTokenBudget(8001) === true`, `exceedsTokenBudget(0) === false`
   - interfaces: produces `export const CONTEXT_TOKEN_BUDGET = 8000` (constants.ts) and `export function exceedsTokenBudget(total: number, budget: number = CONTEXT_TOKEN_BUDGET): boolean` (helpers.ts), both re-exported by name from `index.ts`
   - verify: `cd client && pnpm exec vitest run src/components/context-doc-list/helpers.test.ts` → all tests pass

2. [UI] client — agent Context tab budget warning
   - files: `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.tsx` (changed), `client/messages/en/agents.json` (changed)
   - layer: route component · skills: frontend-ui-architecture, react-best-practices, react-testing-library
   - turns green: AC-46 test
   - test first: none beyond the red-first test (the predicate is covered in step 1)
   - interfaces: consumes `CONTEXT_TOKEN_BUDGET`, `exceedsTokenBudget`, existing `contextTotals(ctx).total` · produces i18n key `agents.context.overBudget`. When `exceedsTokenBudget(totals.total)`, render `<p>` (warn colour) under the totals row with `t("context.overBudget", { budget: CONTEXT_TOKEN_BUDGET })`. Nothing is disabled.
   - verify: `cd client && pnpm exec vitest run "src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.test.tsx"` → all pass, including AC-46 and the existing AC-11 to AC-17 cases

3. [UI] client — skill Context tab: grouped "Serializes as" and budget warning
   - files: `client/src/app/skills/[id]/_components/SkillDetailView/_components/ContextTab/helpers.ts` (new), `helpers.test.ts` (new), `ContextTab.tsx` (changed; update the header comment, which should no longer claim "exact block a run would send"), `styles.ts` (changed: group heading and list styles; the `pre` style may be reused for the box or dropped), `client/messages/en/skills.json` (changed)
   - layer: route component + colocated pure helper · skills: frontend-ui-architecture, react-best-practices, react-testing-library, security
   - turns green: AC-20, AC-47, AC-48, AC-49 tests, plus the rewritten "shows no preview when nothing is attached"
   - test first: `helpers.test.ts` —
     - "groups in specs, docs, insights order with other under docs": four attachments of each category → `[{group:"specs",…},{group:"docs",paths:["docs/b.md","README.md"]},{group:"insights",…}]`
     - "sorts by order, not array position": `[{a, order 1},{b, order 0}]` → specs paths `["b","a"]`
     - "omits empty groups": only specs → length 1
     - "skips absent attachments and attachments not in the doc list": `present:false` and a path missing from `files` both left out
   - interfaces: consumes `ContextAttachment`, `SpecFile` (type imports), `CONTEXT_TOKEN_BUDGET`, `exceedsTokenBudget` · produces `export type SerializeGroup = "specs" | "docs" | "insights"` and `export function groupSerializedPaths(attached: ContextAttachment[], files: SpecFile[]): { group: SerializeGroup; paths: string[] }[]`, with the order from a local literal `const GROUP_ORDER: SerializeGroup[] = ["specs", "docs", "insights"]`, `other` mapped to `"docs"`. In `ContextTab.tsx`, call `React.useId()` at the top with the other hooks, before the early returns. Render, only when `groups.length > 0`, the existing "Serializes as" label `div` with that id, then `<section aria-labelledby={id}>` holding, per group, an `h3` with `t(\`context.serializeGroups.${group}\`)` and a `ul` of `li` path text nodes. Remove the `ctx.serialized` render. Warning: when `exceedsTokenBudget(tokens)`, render `<p>` with `t("context.overBudget", { budget: CONTEXT_TOKEN_BUDGET })` next to the header total; nothing is disabled.
   - verify: `cd client && pnpm exec vitest run "src/app/skills/[id]/_components/SkillDetailView/_components/ContextTab"` → `helpers.test.ts` and `ContextTab.test.tsx` all pass

4. [UI] client — Project Context page: coming-soon toolbar and Preview / Edit tabs
   - files: `client/src/app/repos/[repoId]/context/_components/ProjectContextView/ProjectContextView.tsx` (changed), `styles.ts` (changed: toolbar row; `path` loses `flex: 1`, and a spacer goes before Used by so the tabs sit beside the file name as in design-1), `_components/DocPreview/DocPreview.tsx` (changed), `client/messages/en/context.json` (changed)
   - layer: route component · skills: frontend-ui-architecture, react-best-practices, react-testing-library, security
   - turns green: AC-10, AC-44, AC-45 tests, plus the extended empty-state test
   - test first: none beyond the red-first tests (no new pure logic)
   - interfaces: produces the i18n keys listed below. Tree header (only in the branch that renders the tree, so the empty, not-cloned, loading, error and no-repo states don't get it): eyebrow, then `<div role="toolbar" aria-label={t("toolbar.label")}>` holding `Button size="sm" kind="ghost" icon="Plus" disabled aria-label={t("toolbar.newDoc")} title={same}`, the same for `icon="Folder"` with `toolbar.newFolder`, a third `Button` with child `<Download size={14} aria-hidden />` (`import { Download } from "lucide-react"`) and `toolbar.download`, then the existing Refresh `Button` unchanged. None of the three gets an `onClick`. DocPreview header: path, then `<div role="tablist" aria-label={t("tabs.label")}>` with `<button type="button" role="tab" aria-selected="true">{t("tabs.preview")}</button>` and `<button type="button" role="tab" aria-selected="false" disabled aria-label={t("tabs.editComingSoon")} title={same}>{t("tabs.edit")}</button>`, then a spacer and Used by. The Markdown preview stays exactly as it is.
   - verify: `cd client && pnpm exec vitest run "src/app/repos/[repoId]/context/_components/ProjectContextView"` → all pass, including AC-5a, AC-6, AC-7 and AC-8

## Contracts & data
- Shared contract, migrations, seed: none.
- i18n, exact English text (tests assert these strings):
  - `client/messages/en/context.json`: `"toolbar": { "label": "Doc actions", "newDoc": "New doc (coming soon)", "newFolder": "New folder (coming soon)", "download": "Download (coming soon)" }`, `"tabs": { "label": "Doc view", "preview": "Preview", "edit": "Edit", "editComingSoon": "Edit (coming soon)" }`. Leave the legacy `mode.*` keys untouched.
  - `client/messages/en/agents.json` → `context.overBudget`: `"Attached docs exceed the {budget}-token budget."` (renders "Attached docs exceed the 8000-token budget.")
  - `client/messages/en/skills.json` → `context.overBudget`: the same text as agents; `context.serializeGroups`: `{ "specs": "Project specifications", "docs": "Project docs", "insights": "Project insights" }`

## Checks for the implementer
- single-agent, client only: `cd client && pnpm typecheck` (inside srt, on TS5033: `pnpm exec tsc --noEmit --incremental false`) · `cd client && pnpm test` (the full suite is the regression gate for AC-1 to AC-43 on the client side)

## Checks for reviewers          (plan-verifier first, then the rest in parallel)
- plan-verifier: AC-10, AC-20, AC-44 to AC-49 against the red-first tests and the diff. No integration tests or Docker are needed, because the diff touches no server code. Then fill the step, test and commit columns of the spec's `## Traceability` for these eight rows (the AC-10 and AC-20 rows get the new test names).
- architecture-reviewer: client-only diff, so the server checks don't apply. Placement read against frontend-ui-architecture covers the new `constants.ts` (shared folder, two routes) and the skill tab `helpers.ts` (colocated, one consumer).
- security-reviewer: paths render as text nodes only (no `dangerouslySetInnerHTML`, no `Markdown`, no links); the preview carries no doc text (AC-49); the disabled controls carry no handlers.
- main session: `/code-review` of the diff; pr-self-review; e2e not required (no flow references the changed strings), optional `npm run e2e:hermetic`. Optional browser look on the dev stack against design-1 and design-3 (not an AC).

## Out of scope
- Writing or changing the spec, architecture review, acceptance verification, security review and e2e
- Removing `SkillContext.serialized` or changing what it means, and the server code that builds it
- Grouping the run prompt, any reviewer-core change, any server change
- Making the coming-soon controls do anything (separate feature after #31); adding `Download` to the vendored icon registry
- A configurable or per-tab budget; multiplying the budget by the number of changed files
- The coverage ring and the design-1 elements the spec lists as non-goals

## Risks
- next-intl formatting of a plain `{budget}` argument with a number value: the plan expects the raw "8000". If it renders "8,000", the red tests catch it; the fix is to pass `String(CONTEXT_TOKEN_BUDGET)`, not to edit the tests.
- The Download icon bypasses the vendored registry (see Open questions). Harmless at run time, but a reviewer may flag it.
- `serialized` is still fetched and computed but no longer shown. Dead payload, not a bug.
