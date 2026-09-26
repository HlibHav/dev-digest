# Smart Diff — feature brief (homework, DevDigest course L3)

Repo checkout (git worktree, work ONLY here):
`/Users/Glebazzz/Claude/PROJECTS/NEO/dev-digest/.claude/worktrees/notebooklm-connection-setup-12e635`
Branch: `claude/smart-diff-pr-review-f04bbd` (at `main`, clean). Base for the PR: `main`.
Do not read or search `server/clones/`.

## Problem

The **Files changed** tab of a PR shows files in GitHub's order, so a lock file sits next to
business logic. Review findings live on the **Agent runs** tab; to match a finding with code the
reviewer jumps between tabs.

## What Smart Diff does

1. **Sorts PR files by role**, in this fixed order:
   `core` → `tests` → `wiring` → `docs` → `boilerplate`.
2. **Shows review results inside the diff**, in three places:
   - **group header**: a dot with a number = how many FILES in the group have findings (not how
     many findings; two files with five findings → `● 2`), placed before "N files";
   - **file card header**: a dot next to the path (no number). It is a different mark from the
     existing GitHub comment counter (message icon + count) — keep both;
   - **under the code line**: a finding comment (severity, title, rationale, suggestion,
     Accept / Dismiss) that looks like the finding card on the Agent runs tab. The line itself
     gets a coloured stripe on the left and a label on the right:
     `CRITICAL` → `blocker`, `WARNING` → `warning`, `SUGGESTION` → `suggestion`.
3. A **"Smart order | Original order"** switch; Original = GitHub's order (the current flat list).
4. `docs` and `boilerplate` groups are **collapsed by default**; other groups open, and files
   inside follow the existing `AUTO_EXPAND_MAX_LINES` rule.
5. Grouping must work **before the first review** and must **never call a model**. It is pure
   path classification.

The Agent runs tab stays as it is.

## Acceptance criteria

P1 (blocking):
1. Files changed shows the groups in the order `core → tests → wiring → docs → boilerplate`,
   each with a role label and a file count. Empty groups are omitted.
2. A lock file (`pnpm-lock.yaml`, `package-lock.json`, …) is classified `boilerplate`;
   `docs` and `boilerplate` are collapsed on open.
3. After Run review the group header shows the count of files with findings.
4. A file card with findings shows a dot indicator.
5. In an expanded file, under the right line, a finding comment with severity, title and
   rationale is visible.
6. The Original order switch restores GitHub's order.

P2 (mentor comments, not blocking — implement them):
7. Patterns and role order live in ONE constants file; a unit test table "path → role" covers
   the classifier, including the three contentious cases below.
8. `GET /pulls/:id/smart-diff` returns a body that passes `SmartDiff.parse`; the `SmartDiffRole`
   enum is extended to five values in BOTH `brief.ts` copies (server first, client mirror).
9. No new model call in the server log when Smart Diff is viewed; grouping works before any
   review exists.
10. The finding line has the coloured stripe and the severity label.
11. Accept / Dismiss in the inline finding comment work and change the finding's state.
12. A finding whose `start_line` is not in the patch is shown in a separate block at the end
    of the file card, not dropped.
13. Finding comments can be hidden with the SAME toggle as GitHub comments (default: shown).

P3 (nice to have — do the cheap ones):
14. Group header sticks to the top while scrolling (`position: sticky`).
15. A finding comment can be collapsed to one line (FindingCard's header click already does it).
16. Empty state "no review has run yet" instead of zero counters (just omit the dot/number).
17. Counters and indicators update after Run review without a page reload (react-query
    invalidation already refetches `["reviews", prId]` on run done — verify it propagates).
18. Group labels and other strings come from `client/messages/en/prReview.json`, key `smartDiff`
    (`coreLabel`, `wiringLabel`, `boilerplateLabel`, `filesCount`, `groupedByRole` exist; add
    `testsLabel`, `docsLabel` and whatever new strings the UI needs).

## Classification rules (first match wins — the ORDER is the point)

1. `boilerplate` — `*.lock`, `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `dist/**`,
   `build/**`, `**/__snapshots__/**`, `*.snap`, `*.generated.*`, `*.min.js`.
2. `tests` — `**/*.test.ts(x)`, `**/*.it.test.ts`, `**/*.spec.ts`, `**/test/**`, `**/tests/**`,
   `**/__tests__/**`, `e2e/**`.
3. `wiring` — `index.ts` / `index.js` (barrel files), `*.config.*`, `tsconfig*.json`,
   `.eslintrc*`, `.env*`, `docker-compose*.yml`, `.github/**`, `.claude/**`.
4. `docs` — `**/*.md`, `docs/**`, `README*`, `CHANGELOG*`, `LICENSE`.
5. `core` — everything else.

Three contentious cases that MUST be in the test table:
- `src/__tests__/__snapshots__/x.snap` → `boilerplate` (snapshot rule ranks above tests).
- `.claude/skills/security/SKILL.md` → `wiring` (`.claude/**` ranks above docs — that markdown
  drives agent behaviour).
- `e2e/README.md` → `tests` by this order. Keep it (`tests`) and pin it in the test.

Also pin in the table: `pnpm-lock.yaml`, `server/pnpm-lock.yaml`, `client/src/lib/hooks/index.ts`
(wiring), `server/src/modules/reviews/service.ts` (core), `server/test/reviews.it.test.ts`
(tests), `server/INSIGHTS.md` (docs), `.github/workflows/ci.yml` (wiring), `client/next.config.ts`
(wiring), `dist/bundle.js` (boilerplate), `src/foo.generated.ts` (boilerplate).

One deliberate deviation from the course list: `package.json` (any depth) → `wiring`. It is
configuration, and by the course rules alone it would fall into `core` next to business logic.
Add it to the wiring rule set (after the barrel/config patterns) and pin `server/package.json`
→ `wiring` in the test table with a one-line comment saying why.

**No new dependency for glob matching.** Write a small `globToRegExp` (supports `**`, `*`, `?`)
or plain `RegExp` literals in `constants.ts`. Adding a library needs the owner's sign-off, which
is not available.

## What already exists (verified in this checkout)

Server:
- `GET /pulls/:id` (`server/src/modules/pulls/routes.ts:197`) refreshes and returns `files[]` of
  `PrFile` = `{ path, additions, deletions, patch?: string | null }`
  (`server/src/vendor/shared/contracts/platform.ts:195`). Files are persisted in `pr_files`.
- `GET /pulls/:id/reviews` (`server/src/modules/reviews/routes.ts:129`) → `ReviewRecord[]`,
  newest first, each with `findings[]` of `FindingRecord`
  (`server/src/vendor/shared/contracts/review-api.ts:15`): `file`, `start_line`, `end_line`,
  `severity` (`CRITICAL | WARNING | SUGGESTION`), `title`, `rationale`, `suggestion`,
  `confidence`, `accepted_at`, `dismissed_at`, `review_id`, `id`. There is no `line` field —
  anchor on `start_line`.
- Data access for the review domain: `ReviewRepository`
  (`server/src/modules/reviews/repository.ts:25`) with `getPull(workspaceId, prId)`,
  `getPrFiles(prId)` (rows of `pr_files`: `path`, `additions`, `deletions`, `patch`),
  `reviewsForPull(prId)` (newest first, `{ review, findings }[]`). Row → DTO mapping:
  `findingRowToDto` in `server/src/modules/reviews/helpers.ts:34`.
- Route pattern to copy: `server/src/modules/reviews/routes.ts:19-30,129-133`
  (`app.withTypeProvider<ZodTypeProvider>()`, `getContext(container, req)` for `workspaceId`,
  `IdParams` from `../_shared/schemas.js`, `NotFoundError` from `../../platform/errors.js`).
- Modules are registered statically in `server/src/modules/index.ts:26` (one import + one entry).
- Contract: `server/src/vendor/shared/contracts/brief.ts:80-113` — `SmartDiffRole` is
  `z.enum(['core', 'wiring', 'boilerplate'])` (three values; extend to five in the same order as
  the display order: `core, tests, wiring, docs, boilerplate`). `SmartDiff` =
  `{ groups[{ role, files[{ path, additions, deletions, finding_lines[], pseudocode_summary? }] }],
  split_suggestion { too_big, total_lines, proposed_splits[] } }`. `SmartDiffResponse = SmartDiff`
  in `review-api.ts:64`. The client copy `client/src/vendor/shared/contracts/brief.ts` is
  byte-identical today (`diff` is clean for this file; other files in `vendor/shared` differ in
  comments on `main` already — ignore that drift).
- The route does not exist yet. Fill `split_suggestion` minimally: `too_big: false`,
  `total_lines = Σ(additions + deletions)`, `proposed_splits: []`. Leave `pseudocode_summary`
  null. `finding_lines` = the `start_line`s of the findings for that file (sorted, unique).
- Unit tests live in `server/test/*.test.ts` (vitest; e.g. `server/test/pulls-status.test.ts`),
  integration in `server/test/*.it.test.ts` (Docker; e.g. `reviews.it.test.ts`), no-DB route
  smoke via `buildApp` + `app.inject` in `server/test/routes-smoke.test.ts`.
  `server/test/route-adapter-calls.test.ts` fails if a route calls an adapter.

Client:
- PR page `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` renders
  `<DiffTab prId filesCount files={pr.files} canComment />` for `?tab=diff` (line 164) and already
  holds `usePrReviews(prId)`; on run done it calls `refetchReviews()` (line 156-160).
- `DiffTab` (`_components/DiffTab/DiffTab.tsx`) builds a `DiffCommentApi` from
  `usePrComments` / `useCreatePrComment` and renders `<DiffViewer files commenting />` under a
  `SectionLabel` with a "Show/Hide comments (N)" ghost `Button` (comments start hidden).
- `client/src/components/diff-viewer/` (shared): `DiffViewer` (flat list of `FileCard`),
  `FileCard` (collapsible; auto-open when `additions + deletions <= AUTO_EXPAND_MAX_LINES` from
  `constants.ts`; shows the GitHub comment count with `Icon.MessageSquare`), `CodeLine` (one
  line: gutter number, sign, text, hover "+", comment threads below, composer), `comments.ts`
  (`lineKey`, `keysForLine(ln)` → `RIGHT:<newNo>` / `LEFT:<oldNo>`, `partitionThreads(threads,
  renderedKeys)` → `{ matched, outdated }`, `cs` styles), `helpers.ts` (`parsePatch(patch)` →
  `Line{ kind, text, oldNo?, newNo? }`), `styles.ts`, `OutdatedComments`, `CommentThreadView`,
  `CommentCard`, `InlineComposer`. Public surface: `index.ts` exports `DiffViewer` and the
  `DiffCommentApi` type.
- Finding card: `_components/FindingCard/FindingCard.tsx` (route-local; props `f: FindingRecord`,
  `defaultExpanded`, `onAction(action)`, `pending`, `repoFullName`, `headSha`; header click
  toggles expanded; Accept / Dismiss buttons). Used by `FindingsPanel.tsx:99-107` with
  `useFindingAction()` from `client/src/lib/hooks/reviews.ts:139`:
  `action.mutate({ findingId: f.id, action: act, prId })`.
- Severity colours/labels: `SEV` in `client/src/vendor/ui/primitives/tokens.ts:6`
  (`{ c, bg, icon, label }` per severity) and `SeverityBadge` in `Badge.tsx:52`, both exported
  from `@devdigest/ui`. Don't add a new palette.
- Hooks: `client/src/lib/hooks/reviews.ts` — `usePrReviews(prId)` (query key `["reviews", prId]`),
  `useFindingAction()`, `usePrComments`, `useCreatePrComment`. `api.get<T>(path)` from
  `client/src/lib/api.ts`. Components never `fetch`.
- Types: the client imports TYPES from `@devdigest/shared` (barrel); a runtime VALUE must be
  deep-imported from `@devdigest/shared/contracts/<file>` (`client/INSIGHTS.md`, Tool & Library
  Notes 2026-09-20).
- i18n: `client/messages/en/prReview.json` key `smartDiff` (see P3-18). `useTranslations("prReview")`.
- Import rules (frontend-ui-architecture step 7): `app/**` → `src/components` → `src/lib` →
  `src/vendor`, downhill only. `src/components/diff-viewer` MUST NOT import `FindingCard` from
  `app/**`. Therefore the diff viewer takes the finding card as a render prop / slot
  (`renderFinding(f) => ReactNode`) supplied by `DiffTab`, and only needs the finding's
  `file`, `start_line`, `severity`, `id` (type `FindingRecord` from `@devdigest/shared` is fine
  in `src/components`) for the dot, stripe, label and anchoring.
- Client tests: vitest + Testing Library, `*.test.tsx` next to the component
  (`FindingCard.test.tsx`, `FindingsPanel/helpers.test.ts` are examples).

## Design decisions already taken (do not reopen; the planner turns them into steps)

- **Server module**: new `server/src/modules/smart-diff/` with `constants.ts` (role order +
  ordered rules), `classify.ts` (pure `classifyFile(path): SmartDiffRole`, importable with no
  HTTP — lesson L08 reuses it as a prompt filter), `service.ts` (pure assembly
  `buildSmartDiff(files, findings)` + a `SmartDiffService` that takes a narrow store port
  `{ getPull, getPrFiles, reviewsForPull }`, satisfied structurally by `ReviewRepository`),
  `routes.ts` (`GET /pulls/:id/smart-diff`: parse params → `getContext` → service → return;
  404 `NotFoundError` when the PR is not in the workspace). Register in `modules/index.ts`.
  No query and no adapter call in the route handler (onion rule).
- **Which findings count**: the latest review PER AGENT (`reviewsForPull` is newest first;
  keep the first review for each `agent_id`, a `null` agent_id counts as its own key). Accepted
  and dismissed findings still count (the card shows the muted state). Server and client apply
  the same rule (a small pure helper on each side, both unit-tested).
- **Client data**: `useSmartDiff(prId)` in `client/src/lib/hooks/reviews.ts` (query key
  `["smart-diff", prId]`, `api.get<SmartDiffResponse>`), enabled when `prId` is set. `DiffTab`
  joins `groups[].files[].path` back to `pr.files` by path (the route returns no patch). While
  the smart-diff query is loading or errored, render the flat original order.
- **Client components**: extend the shared `diff-viewer`:
  - `findings.ts` (pure): `DiffFindingApi { findings: FindingRecord[]; showFindings: boolean;
    renderFinding(f): ReactNode }`, `findingKey(f) = "RIGHT:" + start_line`,
    `partitionFindings(fileFindings, renderedKeys) → { matched: Map<string, FindingRecord[]>,
    unanchored: FindingRecord[] }`, `filesWithFindings(paths, findings): number`,
    `severityLabel(sev)` → `blocker | warning | suggestion`, and the stripe colour from `SEV`.
  - `FileCard`: new optional prop `findings?: DiffFindingApi`; dot next to the path when the
    file has findings; per-line findings passed to `CodeLine`; `UnanchoredFindings` block after
    the lines (P2-12).
  - `CodeLine`: new optional prop `findings?: FindingRecord[]`; stripe + label when non-empty;
    renders `renderFinding(f)` under the line when `showFindings`.
  - `RoleGroup` (`diff-viewer/RoleGroup/`): header (role colour square, label, hint, `● N`
    files-with-findings when N > 0, `M files`), collapsible, default open unless role is `docs`
    or `boilerplate`, sticky header.
  - `DiffViewer`: optional `groups?: { role, label, hint, files: PrFile[] }[]` and
    `findings?: DiffFindingApi`; with `groups` it renders `RoleGroup`s, without it the flat list
    (Original order and the loading fallback).
- **DiffTab**: order switch (two-option segmented control, "Smart order" default; use existing
  `@devdigest/ui` primitives such as `Button`/`Chip` — check what exists before inventing),
  one "Show/Hide comments" toggle for GitHub comments AND findings (default shown), Accept /
  Dismiss wired through `useFindingAction` with `prId`. Group labels/hints from i18n.
- **Tests**: server `smart-diff-classify.test.ts` (table) and `smart-diff-build.test.ts`
  (order, empty groups omitted, lock file in boilerplate, `finding_lines` from `start_line`,
  latest-per-agent, `total_lines`, and `SmartDiff.parse(result)` succeeds); an integration test
  for the route is welcome if `reviews.it.test.ts` helpers make it cheap. Client: pure helper
  tests for `findings.ts` and DiffTab helpers, a `RoleGroup` render test, a `FileCard` test for
  the dot + inline finding + unanchored block.
- **Out of scope**: `pseudocode_summary`, `split_suggestion` beyond the minimal fill, any LLM
  call, changes to the Agent runs tab, e2e flows, db schema changes, new dependencies.

## Checks (root `CLAUDE.md` Check table)

- `server/`: `pnpm typecheck` · `pnpm exec vitest run --exclude '**/*.it.test.ts'` ·
  `pnpm lint:boundaries` (architecture-reviewer) · integration `pnpm exec vitest run .it.test`
  (Docker, plan-verifier)
- `client/`: `pnpm typecheck` · `pnpm test`
- Run each from inside that package directory.
