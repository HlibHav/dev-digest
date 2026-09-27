# Development Plan: Smart Diff for the Files changed tab
Status: ready

## Goal

The Files changed tab currently lists a PR's files in GitHub's arbitrary order, with review
findings visible only on a separate tab. Smart Diff groups those files by role (core, tests,
wiring, docs, boilerplate), collapses the low-signal groups by default, and surfaces each
finding directly under the diff line it belongs to — so a reviewer can go from "what changed"
to "what's wrong with it" without leaving the tab. Grouping is pure path classification and
works before any review has run; nothing here calls a model.

## Acceptance criteria

P1 (blocking):
1. Files changed shows the groups in the order `core → tests → wiring → docs → boilerplate`,
   each with a role label and a file count. Empty groups are omitted.
2. A lock file (`pnpm-lock.yaml`, `package-lock.json`, …) is classified `boilerplate`; `docs`
   and `boilerplate` are collapsed on open.
3. After Run review the group header shows the count of files with findings.
4. A file card with findings shows a dot indicator.
5. In an expanded file, under the right line, a finding comment with severity, title and
   rationale is visible.
6. The Original order switch restores GitHub's order.

P2 (mentor comments, not blocking — implemented):
7. Patterns and role order live in ONE constants file; a unit test table "path → role" covers
   the classifier, including the three contentious cases.
8. `GET /pulls/:id/smart-diff` returns a body that passes `SmartDiff.parse`; `SmartDiffRole` is
   extended to five values in BOTH `brief.ts` copies.
9. No new model call in the server log when Smart Diff is viewed; grouping works before any
   review exists.
10. The finding line has the coloured stripe and the severity label.
11. Accept / Dismiss in the inline finding comment work and change the finding's state.
12. A finding whose `start_line` is not in the patch is shown in a separate block at the end of
    the file card, not dropped.
13. Finding comments can be hidden with the SAME toggle as GitHub comments (default: shown).

P3 (nice to have — cheap ones done):
14. Group header sticks to the top while scrolling.
15. A finding comment can be collapsed to one line (reuses `FindingCard`'s existing toggle).
16. Empty state "no review has run yet" instead of zero counters.
17. Counters/indicators update after Run review without a page reload.
18. Group labels and strings come from `client/messages/en/prReview.json`, key `smartDiff`.

## Context read

- `server/INSIGHTS.md` — "diff -rq server/src/vendor/shared client/src/vendor/shared is not
  clean even on main" (2026-09-16): don't try to fully reconcile the two vendor trees — diff
  only `contracts/brief.ts`, the one file this plan touches, and stop there. It is byte-identical
  today (verified), so the mirror step is a straight copy of the edit.
- `client/INSIGHTS.md` — "the client can import types but not values from `@devdigest/shared`"
  (2026-09-20): the new `useSmartDiff` hook only needs the `SmartDiff` TYPE (already re-exported
  via `client/src/lib/types.ts`), so no deep `@devdigest/shared/contracts/...` import is needed
  anywhere in this feature.
- `.claude/rules/onion-boundaries.md` — route handler rule and "new service takes ports, not
  Container" — shapes the whole server module (§ Constraints).
- `.claude/rules/shared-contracts.md` — edit server copy first, mirror client, verify with
  `diff -rq` on the touched file.
- `.claude/skills/frontend-ui-architecture/SKILL.md` steps 1, 4, 7, 8, 9 — placement, import
  direction (`src/components/diff-viewer` cannot import `FindingCard` from `app/**`), barrel
  rules, types-from-contract rule.
- `.claude/skills/onion-architecture/SKILL.md` steps 1–5, 9 — layer naming, route/service/port
  rules, the "prove it" gate (`pnpm lint:boundaries` + unit tests).
- `server/src/modules/skills/routes.ts:82-83` — the copyable "service built at plugin scope, a
  container-member repository handed to it" pattern (`new SkillsService(app.container.skillsRepo)`).
  `reviews/routes.ts:21` is NOT a parallel precedent — it hands `ReviewService` the whole
  `Container` (grandfathered), which this plan does not copy.
- `server/src/platform/container.ts:75-76,105-106` — `container.reviewRepo` is already an exposed
  lazy-singleton getter (`get reviewRepo(): ReviewRepository { return (this._reviewRepo ??= new
  ReviewRepository(this.db)); }`), the same shape as `container.skillsRepo`. Smart Diff's route
  uses this member, so it never imports `ReviewRepository` (or anything else) from the `reviews`
  module — see Constraints.
- `server/.dependency-cruiser.cjs` rule `application-no-cross-module` (lines ~78-86) — application
  code in ANY module (`^src/modules/([^/]+)/`, excluding `routes.ts`/`repository.ts`/`repository/`
  /`.repo.ts`) may not import another module's path at all, service.ts included. A route
  (`routes.ts`, excluded from this rule's `from` side) importing another module's `service.ts` is
  the documented exception; it says nothing about a route importing another module's repository,
  and container-member access side-steps the question entirely — confirms the `container.reviewRepo`
  choice above rather than `new ReviewRepository(container.db)` inside `smart-diff/routes.ts`.
- `server/src/db/schema/pulls.ts:22-23,42-43` — `pr_files.additions`/`.deletions` are
  `notNull().default(0)`, so the `SmartDiffStorePort`'s `{ additions: number; deletions: number }`
  (no `| null`) is correct as declared.
- `client/src/components/diff-viewer/FileCard/FileCard.tsx:8` and `DiffViewer/DiffViewer.tsx:9`
  — diff-viewer imports `PrFile` from `@/lib/types`, not `@devdigest/shared` directly; the new
  code follows the same convention for `FindingRecord`/`SmartDiff`.
- `client/messages/en/prReview.json:59-67` — `smartDiff` key already has `coreLabel`,
  `wiringLabel`, `boilerplateLabel`, `filesCount`, `groupedByRole` (and unrelated
  `largeTitle`/`largeBody`/`findingLines` for `split_suggestion`, out of scope here); `testsLabel`
  and `docsLabel` are missing and must be added.

## Affected surfaces

- `server` → `modules/smart-diff` (new) → route/service/domain → `server/src/modules/smart-diff/{constants,classify,service,routes}.ts` (new)
- `server` → shared contract → `server/src/vendor/shared/contracts/brief.ts` (changed)
- `server` → `modules/index.ts` (changed — one import, one registry entry)
- `server` → tests → `server/test/smart-diff-classify.test.ts`, `server/test/smart-diff-build.test.ts` (new)
- `client` → shared contract mirror → `client/src/vendor/shared/contracts/brief.ts` (changed)
- `client` → hook → `client/src/lib/hooks/reviews.ts` (changed — add `useSmartDiff`)
- `client` → shared diff-viewer → `client/src/components/diff-viewer/{findings.ts, constants.ts}` (changed/new), `RoleGroup/` (new), `FileCard/`, `CodeLine/`, `DiffViewer/` (changed)
- `client` → route-local → `.../pulls/[number]/_components/DiffTab/{DiffTab.tsx, helpers.ts}` (changed/new)
- `client` → i18n → `client/messages/en/prReview.json` (changed, key `smartDiff`)

## Constraints

- Route handler runs no query, calls no adapter/repository per request — source:
  `.claude/rules/onion-boundaries.md:15-16`, `onion-architecture/SKILL.md` step 2. Complied by
  building `new SmartDiffService(container.reviewRepo)` once at plugin registration (module
  scope), exactly like `skills/routes.ts:83`'s `new SkillsService(app.container.skillsRepo)` —
  never inside the `app.get(...)` handler. `container.reviewRepo` is a property access on the
  already-built container, not a call, and not an import of another module's file.
- A service takes the ports it uses, not `Container` — source: `onion-architecture/SKILL.md`
  step 5. `SmartDiffService` takes one `SmartDiffStorePort` (a locally-declared narrow interface:
  `getPull`, `getPrFiles`, `reviewsForPull`), satisfied structurally by `ReviewRepository` without
  importing it by name into the port's own declaration.
- Application code never imports another module's path at all (not even its `repository.ts`) —
  source: `server/.dependency-cruiser.cjs` rule `application-no-cross-module`. Complied by
  `smart-diff/service.ts` never importing anything from `../reviews/`; the concrete
  `ReviewRepository` only ever appears in `smart-diff/routes.ts` as `container.reviewRepo` (a
  property, not an import).
- Application code imports no `drizzle-orm`/`src/db/**` — source: `onion-architecture/SKILL.md`
  step 3. `SmartDiffStorePort` and `buildSmartDiff`'s parameter types are declared as plain local
  interfaces (`{ path, additions, deletions }`, `{ file, start_line }`, …), not
  `typeof t.prFiles.$inferSelect` or a drizzle row import.
- No new dependency for glob matching — source: brief.md "Classification rules" footer. A small
  hand-written `globToRegExp` (supports `**`, `*`, `?`) in `classify.ts`, no library.
- `src/components/diff-viewer` must not import `FindingCard` from `app/**` — source:
  `frontend-ui-architecture/SKILL.md` step 7 (downhill imports only), confirmed by brief.md
  line 168. Complied by a `renderFinding(f) => ReactNode` render-prop threaded from `DiffTab`
  down through `DiffViewer` → `RoleGroup`/`FileCard` → `CodeLine`.
- Types come from the contract — source: `frontend-ui-architecture/SKILL.md` step 9. New client
  code imports `PrFile`, `FindingRecord`, `SmartDiff` types via `@/lib/types` (already
  re-exporting `SmartDiff`; `FindingRecord` is added there in step 6), never restated locally.
- Edit the server shared-contract copy first, then mirror to client, verify with `diff -rq` on
  the touched file only — source: `.claude/rules/shared-contracts.md`.
- One barrel per component folder, named exports only — source:
  `frontend-ui-architecture/SKILL.md` step 8. `RoleGroup/index.ts` re-exports `{ RoleGroup }`
  only.

## Skills for the implementer

- `client/**` → `frontend-ui-architecture`, `next-best-practices`, `react-best-practices`,
  `react-testing-library`, `security`, `zod`
- `server/**` → `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`,
  `security`, `zod`

## Steps

1. [BE] server — Extend the shared contract: `SmartDiffRole` to five values, in the display
   order.
   - files: `server/src/vendor/shared/contracts/brief.ts` (changed)
   - layer: contract (`src/vendor/shared/`)
   - skills: `zod`
   - change: `export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs',
     'boilerplate']);` (was 3 values). `SmartDiffFile`, `SmartDiffGroup`, `SmartDiff` shapes are
     unchanged.
   - exports / signatures: `SmartDiffRole` (5-value enum), `SmartDiff` (unchanged shape) — every
     later server and client step imports these.
   - new tests: none (covered by step 3's `SmartDiff.parse` assertion).

2. [UI] client — Mirror the contract edit verbatim.
   - files: `client/src/vendor/shared/contracts/brief.ts` (changed)
   - layer: contract mirror (`src/vendor/shared/`)
   - skills: `zod`
   - change: same one-line `SmartDiffRole` edit as step 1. Run
     `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts`
     and confirm empty output before moving on.
   - exports / signatures: none new.
   - new tests: none.

3. [BE] server — Pure classifier: constants + `classifyFile`.
   - files: `server/src/modules/smart-diff/constants.ts` (new),
     `server/src/modules/smart-diff/classify.ts` (new)
   - layer: domain (pure, no HTTP, no DB — importable by lesson L08 as a prompt filter per the
     brief)
   - skills: `onion-architecture` (step 1: name the layer), `zod` (role type only)
   - `constants.ts` holds two independent orderings — do not conflate them:
     - `ROLE_ORDER: SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate']` — the
       **display** order (also the enum's declared order from step 1).
     - `CLASSIFY_RULES: { role: Exclude<SmartDiffRole, 'core'>; patterns: string[] }[]` — the
       **matching** priority order, first match wins, `core` is the implicit fallback (never a
       rule row):
       1. `boilerplate`: `['*.lock', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock',
          'dist/**', 'build/**', '**/__snapshots__/**', '*.snap', '*.generated.*', '*.min.js']`
       2. `tests`: `['**/*.test.ts', '**/*.test.tsx', '**/*.it.test.ts', '**/*.spec.ts',
          '**/test/**', '**/tests/**', '**/__tests__/**', 'e2e/**']`
       3. `wiring`: `['index.ts', 'index.js', '*.config.*', 'tsconfig*.json', '.eslintrc*',
          '.env*', 'docker-compose*.yml', '.github/**', '.claude/**']`
       4. `docs`: `['**/*.md', 'docs/**', 'README*', 'CHANGELOG*', 'LICENSE']`
   - `classify.ts` decision the brief left open — **glob anchoring**: a pattern containing `/`
     is anchored to the repo-root-relative path (tested against the whole path, gitignore-style);
     a pattern with no `/` matches the file's **basename** at any depth. This is what makes
     `pnpm-lock.yaml` catch both `pnpm-lock.yaml` and `server/pnpm-lock.yaml`, `index.ts` catch
     `client/src/lib/hooks/index.ts`, and `.github/**` / `e2e/**` stay anchored to the repo root
     so they don't accidentally match a nested `something/.github-like/` path.
     `globToRegExp(pat)` translates, in order: a **leading** `**/` → `(?:.*/)?` (zero or more
     directories — so `**/*.md` matches a root-level `CONTRIBUTING.md` too, not just a nested
     one), a **trailing** `/**` → `/.*`, any other `**` → `.*`, a lone `*` → `[^/]*`, `?` →
     `[^/]`, and escapes the rest. Getting the leading/trailing `**` cases right matters: a naive
     `**` → `.*` translation turns `**/*.md` into a pattern that requires a slash before the
     filename, silently missing every root-level doc file — the classifier test table below pins
     a case that would catch that regression.
   - `classifyFile(path: string): SmartDiffRole` — walk `CLASSIFY_RULES` in order, return the
     first role whose `patterns` match; `'core'` if none match.
   - exports / signatures: `ROLE_ORDER`, `CLASSIFY_RULES`, `classifyFile(path): SmartDiffRole` —
     step 4 (server `buildSmartDiff`) keys off `ROLE_ORDER` for group ordering. These stay
     server-only: the client never imports this module (see step 10) — its own
     `COLLAPSED_BY_DEFAULT` (step 7) is a separate, client-local constant that happens to name
     the same two roles, not a shared source of truth.
   - new tests: `server/test/smart-diff-classify.test.ts` — a `path → role` table. MUST include,
     verbatim:
     - `src/__tests__/__snapshots__/x.snap` → `boilerplate`
     - `.claude/skills/security/SKILL.md` → `wiring`
     - `e2e/README.md` → `tests`
     - `pnpm-lock.yaml` → `boilerplate`
     - `server/pnpm-lock.yaml` → `boilerplate`
     - `client/src/lib/hooks/index.ts` → `wiring`
     - `server/src/modules/reviews/service.ts` → `core`
     - `server/test/reviews.it.test.ts` → `tests`
     - `server/INSIGHTS.md` → `docs`
     - `.github/workflows/ci.yml` → `wiring`
     - `client/next.config.ts` → `wiring`
     - `dist/bundle.js` → `boilerplate`
     - `src/foo.generated.ts` → `boilerplate`
     - `CONTRIBUTING.md` (root-level, no directory prefix) → `docs` — pins the
       leading-`**/` glob-anchoring fix above; a naive `**` → `.*` translation would send
       this to `core` instead

4. [BE] server — Pure assembly: `buildSmartDiff` + the latest-per-agent rule.
   - files: `server/src/modules/smart-diff/service.ts` (new)
   - layer: domain (pure functions) + application (the service class)
   - skills: `onion-architecture` (steps 3, 5, 7), `zod`
   - Pure helper `latestReviewPerAgent<R extends { agentId: string | null }, F>(rows:
     { review: R; findings: F[] }[]): F[]` — `reviewsForPull` is newest-first; keep the first
     entry per `review.agentId` (a `null` agentId is its own key), flatten and return its
     findings. Typed against a minimal local shape, not `ReviewRow`/`FindingRow` from
     `../reviews/repository.js` (onion: no reach into another module's DB row types — accept the
     two fields it actually needs).
   - Pure `buildSmartDiff(files: { path: string; additions: number; deletions: number }[],
     findings: { file: string; start_line: number }[]): SmartDiff`:
     - group by `classifyFile(path)`, order groups per `ROLE_ORDER`, omit empty groups;
     - `finding_lines` per file = sorted unique `start_line`s where `finding.file === file.path`;
     - `pseudocode_summary: null` (out of scope);
     - `split_suggestion: { too_big: false, total_lines: Σ(additions + deletions), proposed_splits: [] }`
       (minimal fill, per brief).
   - `SmartDiffStorePort` (local interface, see Constraints) + `SmartDiffService`:
     ```ts
     interface SmartDiffStorePort {
       getPull(workspaceId: string, prId: string): Promise<{ id: string } | undefined>;
       getPrFiles(prId: string): Promise<{ path: string; additions: number; deletions: number }[]>;
       reviewsForPull(prId: string): Promise<
         { review: { agentId: string | null }; findings: { file: string; startLine: number }[] }[]
       >;
     }
     class SmartDiffService {
       constructor(private store: SmartDiffStorePort) {}
       async getSmartDiff(workspaceId: string, prId: string): Promise<SmartDiff | undefined> {
         /* undefined when getPull finds nothing — the route (step 5) turns that into
            NotFoundError, mirroring `service.reviewsForPull`'s callers; otherwise map
            findings' startLine -> start_line before calling buildSmartDiff */
       }
     }
     ```
     (`ReviewRepository`'s actual return types are wider — real `PullRow`/`FindingRow` — and are
     structurally assignable to this port without any cast.)
   - exports / signatures: `SmartDiffService`, `SmartDiffStorePort`,
     `getSmartDiff(workspaceId, prId): Promise<SmartDiff | undefined>`, `buildSmartDiff`,
     `latestReviewPerAgent` — step 5 (route) imports `SmartDiffService` and checks its result for
     `undefined`; step 6 (unit tests) imports `buildSmartDiff` and `latestReviewPerAgent` directly.
   - new tests: `server/test/smart-diff-build.test.ts` (see step 6 — colocated logically, listed
     once to avoid duplication).

5. [BE] server — Route: `GET /pulls/:id/smart-diff`.
   - files: `server/src/modules/smart-diff/routes.ts` (new)
   - layer: route
   - skills: `onion-architecture` (step 2), `fastify-best-practices`, `zod`
   - Copy the request-handling shape of `server/src/modules/reviews/routes.ts:19-30,129-133`
     (`withTypeProvider<ZodTypeProvider>()`, `getContext`, `IdParams`, `NotFoundError`), but build
     the service the way `server/src/modules/skills/routes.ts:82-83` does: `const service = new
     SmartDiffService(container.reviewRepo);` at plugin scope (not per-request — see
     Constraints). `container.reviewRepo` (`server/src/platform/container.ts:105-106`) is an
     existing lazy-singleton getter — no new container wiring needed, and no import of
     `ReviewRepository` or anything else from `../reviews/` inside this module (that import would
     trip `application-no-cross-module` if it landed in `service.ts`, and has no precedent for
     `routes.ts` either — the container member sidesteps the question entirely).
     `app.get('/pulls/:id/smart-diff', { schema: { params: IdParams } }, async (req) => { const
     { workspaceId } = await getContext(container, req); const result = await
     service.getSmartDiff(workspaceId, req.params.id); if (!result) throw new
     NotFoundError('Pull request not found'); return result; });`
   - exports / signatures: default Fastify plugin `smartDiffRoutes`.
   - new tests: none here (covered by step 6's route-adapter-calls run and, optionally, an
     integration test — see Out of scope / Risks).

6. [BE] server — Register the module + the two unit test files.
   - files: `server/src/modules/index.ts` (changed — one import, one entry: `smartDiff`),
     `server/test/smart-diff-build.test.ts` (new)
   - layer: wiring (registry) + tests
   - skills: `onion-architecture` (step 9 — prove it)
   - `smart-diff-build.test.ts` covers, against `buildSmartDiff` and `latestReviewPerAgent`
     directly (no DB, no Fastify):
     - group order `core → tests → wiring → docs → boilerplate`, empty groups omitted;
     - a lock file lands in `boilerplate`;
     - `finding_lines` are the file's findings' `start_line`s, sorted, deduplicated;
     - latest-per-agent: two reviews from the same `agentId` (newest first) → only the newer
       one's findings count; a `null` agentId review counts on its own;
     - `total_lines` = `Σ(additions + deletions)` across all files;
     - `SmartDiff.parse(buildSmartDiff(...))` succeeds (imports `SmartDiff` from
       `@devdigest/shared` — confirms step 1's contract edit end-to-end).

7. [UI] client — Pure diff-viewer additions: `findings.ts` + role constants.
   - files: `client/src/components/diff-viewer/findings.ts` (new),
     `client/src/components/diff-viewer/constants.ts` (changed),
     `client/src/components/diff-viewer/findings.test.ts` (new)
   - layer: shared component module (`src/components/diff-viewer`, already promoted — see
     `frontend-ui-architecture/SKILL.md` step 2)
   - skills: `frontend-ui-architecture` (steps 5, 9), `zod` (types only, no runtime zod here),
     `react-testing-library` (n/a — pure functions, plain vitest)
   - `constants.ts` additions: `ROLE_COLOR_VAR: Record<SmartDiffRole, string>` (CSS-var tokens,
     e.g. `core: 'var(--accent)'`, reuse existing tokens — no new palette, per brief line 157)
     and `COLLAPSED_BY_DEFAULT: ReadonlySet<SmartDiffRole>` = `new Set(['docs', 'boilerplate'])`.
     `SmartDiffRole` type imported from `@/lib/types` (add it there alongside the existing
     `SmartDiff` export — one-line addition, `export type { SmartDiffRole } from
     "@devdigest/shared";`... already covered by `export type { ... SmartDiff } from
     "@devdigest/shared"`, so also add `FindingRecord` here if not already present — check
     `client/src/lib/types.ts` before adding; `Finding` is already exported, `FindingRecord` is
     not and must be added).
   - `findings.ts` (pure, no React import, mirrors `comments.ts`'s shape exactly):
     - `export interface DiffFindingApi { findings: FindingRecord[]; showFindings: boolean;
       renderFinding(f: FindingRecord): ReactNode; }`
     - `findingKey(f: FindingRecord): string` → `` `RIGHT:${f.start_line}` `` (mirrors
       `lineKey`/`keysForLine` in `comments.ts`, which key line threads the same way for the
       "new" side).
     - `partitionFindings(fileFindings: FindingRecord[], renderedKeys: Set<string>):
       { matched: Map<string, FindingRecord[]>; unanchored: FindingRecord[] }` — same shape as
       `partitionThreads` in `comments.ts:89-106`.
     - `filesWithFindings(paths: string[], findings: FindingRecord[]): number` — count of
       `paths` that appear as some finding's `file`.
     - `severityLabel(sev: Severity): 'blocker' | 'warning' | 'suggestion'` — `CRITICAL →
       blocker`, `WARNING → warning`, `SUGGESTION → suggestion` (`INFO` is unused by this
       feature; map it to `'suggestion'` defensively rather than throwing).
     - stripe colour: reuse `SEV[f.severity].c` from `@devdigest/ui` directly at the call site
       (`CodeLine`) — no new colour constant, per brief line 157 ("Don't add a new palette").
   - exports / signatures: `DiffFindingApi`, `findingKey`, `partitionFindings`,
     `filesWithFindings`, `severityLabel`, `ROLE_COLOR_VAR`, `COLLAPSED_BY_DEFAULT` — steps 8–10
     import these.
   - new tests: `findings.test.ts` — `findingKey` format, `partitionFindings` matched vs.
     unanchored split (including a finding whose `start_line` has no rendered line), 
     `filesWithFindings` count, `severityLabel` for all three severities.

8. [UI] client — `RoleGroup` (new), `FileCard` findings support.
   - files: `client/src/components/diff-viewer/RoleGroup/RoleGroup.tsx` (new),
     `client/src/components/diff-viewer/RoleGroup/index.ts` (new),
     `client/src/components/diff-viewer/RoleGroup/RoleGroup.test.tsx` (new),
     `client/src/components/diff-viewer/FileCard/FileCard.tsx` (changed),
     `client/src/components/diff-viewer/FileCard/FileCard.test.tsx` (new)
   - layer: shared component module
   - skills: `frontend-ui-architecture` (steps 4, 8), `react-best-practices`,
     `react-testing-library`, `next-best-practices`
   - `RoleGroup` props: `{ role: SmartDiffRole; label: string; hint: string; files: PrFile[];
     findingsCount: number /* files-with-findings, pre-computed by DiffViewer via
     filesWithFindings */; findings?: DiffFindingApi; commenting?: DiffCommentApi }`. Uses
     `useTranslations("prReview")` (NOT `"shell"`, which the sibling `FileCard`/`DiffViewer` use
     today — every new Smart Diff string lives in `prReview.json:smartDiff`, per brief line 164
     and P3-18). Renders a header (colour square from `ROLE_COLOR_VAR[role]`, `label`, `hint`,
     `● {findingsCount}` only when `findingsCount > 0`, `t('smartDiff.filesCount', {count:
     files.length})` — that key already interpolates the count, so don't also print
     `files.length` in front of it), `position: sticky` on the header, collapsible
     (`React.useState(!COLLAPSED_BY_DEFAULT.has(role))`), and — when open — a `FileCard` per
     file, each still governed individually by `AUTO_EXPAND_MAX_LINES` (the group's own
     open/closed state is independent of each file's).
   - `FileCard` new optional prop `findings?: DiffFindingApi`. When present: a dot next to the
     path when `filesWithFindings([file.path], findings.findings) > 0`; build `matched`/
     `unanchored` via `partitionFindings` (same `renderedKeys` set already computed for
     comments) filtered to `findings.findings.filter(f => f.file === file.path)`; pass the
     per-line matches down to each `CodeLine`; render an `UnanchoredFindings` block (new small
     inline component or an inline map — implementer's call, keep it in `FileCard.tsx` unless it
     grows) after the lines when `unanchored.length > 0` and `findings.showFindings`.
   - exports / signatures: `RoleGroup` (named + default via `index.ts`, per barrel rule).
     `FileCard`'s new `findings` prop — step 9 (`CodeLine`) and step 10 (`DiffViewer`) depend on
     this prop existing.
   - new tests: `RoleGroup.test.tsx` — renders label + hint + file count; shows `● N` only when
     `findingsCount > 0`; starts collapsed for `docs`/`boilerplate`, open otherwise. `FileCard.
     test.tsx` — dot appears iff the file has a finding; a finding renders inline via
     `renderFinding` under its line; an unanchored finding renders in the trailing block, not
     dropped. Both tests render under the test setup's `NextIntlClientProvider` (or whatever
     existing test util `FindingCard.test.tsx` already uses) loaded with the `prReview` namespace
     — not `shell` — since `RoleGroup` reads from it.

9. [UI] client — `CodeLine` stripe + label + inline finding render.
   - files: `client/src/components/diff-viewer/CodeLine/CodeLine.tsx` (changed)
   - layer: shared component module
   - skills: `frontend-ui-architecture` (step 6), `react-best-practices`
   - New optional prop `findings?: FindingRecord[]` (the matches for this line, from `FileCard`'s
     `partitionFindings`) alongside `renderFinding?: (f: FindingRecord) => ReactNode` and
     `showFindings?: boolean` (or pass the whole `DiffFindingApi` down — implementer's call,
     match the existing `commenting?: DiffCommentApi` prop shape for consistency). Uses
     `useTranslations("prReview")` for the severity label — same namespace call-out as
     `RoleGroup` in step 8, distinct from this file's existing behaviour (today `CodeLine` takes
     no `useTranslations` call at all; it only starts needing one for this label). When
     `findings.length > 0`: a coloured left stripe on the line (`SEV[f.severity].c` of the
     highest-severity finding present — `CRITICAL > WARNING > SUGGESTION`) and a right-aligned
     label, `` t(`smartDiff.severity.${severityLabel(f.severity)}`) ``; when `showFindings`, render
     `renderFinding(f)` under the line for each finding, in the same position
     `CommentThreadView` renders comment threads today (`CodeLine.tsx:67-71`).
   - exports / signatures: none new (prop addition only).
   - new tests: covered by `FileCard.test.tsx` (step 8) rendering through `CodeLine`; no separate
     `CodeLine.test.tsx` needed unless the implementer finds the stripe/label logic non-trivial
     enough to isolate — optional, not required.

10. [UI] client — `DiffViewer` groups mode; hook + i18n.
    - files: `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx` (changed),
      `client/src/components/diff-viewer/index.ts` (changed — export `RoleGroup`'s public types
      if `DiffTab` needs them, e.g. `DiffFindingApi`), `client/src/lib/hooks/reviews.ts`
      (changed), `client/messages/en/prReview.json` (changed)
    - layer: shared component module + hook + i18n
    - skills: `frontend-ui-architecture` (steps 5, 9), `zod`
    - `DiffViewer` new optional props: `groups?: { role: SmartDiffRole; label: string; hint:
      string; files: PrFile[] }[]` and `findings?: DiffFindingApi`. With `groups` present, render
      a `RoleGroup` per entry, **in the order the array arrives** — the client never imports
      `ROLE_ORDER` (that constant lives in `server/src/modules/smart-diff/constants.ts`, a server
      module; the client has no access to it and must not deep-import server source). The server
      response is already emitted in `ROLE_ORDER` order (step 4's `buildSmartDiff`), so `DiffTab`
      (step 11) passes `smartDiff.groups` through untouched — no client-side re-sort. Each
      `RoleGroup` gets `findingsCount = filesWithFindings(files.map(f => f.path), findings?.findings
      ?? [])`; without `groups`, keep today's flat `FileCard` list (Original order and the
      loading/error fallback both use this path). `COLLAPSED_BY_DEFAULT` (step 7) stays
      client-local — it doesn't need to match the server's ordering, only its own five role
      keys.
    - `useSmartDiff(prId)` in `client/src/lib/hooks/reviews.ts`, next to `usePrReviews`:
      `useQuery({ queryKey: ["smart-diff", prId], queryFn: () => api.get<SmartDiff>
      (`/pulls/${prId}/smart-diff`), enabled: !!prId })`. `SmartDiff` type from `@/lib/types`
      (not `@devdigest/shared` directly, matching every other hook in this file).
    - i18n — add to `client/messages/en/prReview.json`, key `smartDiff` (alongside the five keys
      already there):
      ```json
      "testsLabel": "Tests",
      "docsLabel": "Docs",
      "coreHint": "Business logic",
      "testsHint": "Test coverage",
      "wiringHint": "Config & wiring",
      "docsHint": "Documentation",
      "boilerplateHint": "Generated & lockfiles",
      "orderSmart": "Smart order",
      "orderOriginal": "Original order",
      "unanchoredHeading": "Not shown inline (line not in this diff)",
      "emptyNoReview": "No review has run yet",
      "severity": { "blocker": "blocker", "warning": "warning", "suggestion": "suggestion" },
      "filesWithFindings": "{count} files with findings",
      "fileHasFindings": "This file has findings"
      ```
      (`largeTitle`/`largeBody`/`findingLines` stay untouched — out of scope, unrelated to this
      feature's `split_suggestion` minimal fill.)
    - exports / signatures: `useSmartDiff(prId)`, `DiffViewer`'s `groups`/`findings` props —
      step 11 (`DiffTab`) is the only consumer.
    - new tests: none beyond step 8's `RoleGroup`/`FileCard` tests, which already exercise
      `DiffViewer` through `groups`.

11. [UI] client — `DiffTab` wiring: order switch, latest-per-agent, Accept/Dismiss, the shared
    show/hide toggle.
    - files: `.../pulls/[number]/page.tsx` (changed — pass two new props to `DiffTab`),
      `.../pulls/[number]/_components/DiffTab/DiffTab.tsx` (changed),
      `.../pulls/[number]/_components/DiffTab/helpers.ts` (new),
      `.../pulls/[number]/_components/DiffTab/helpers.test.ts` (new)
    - layer: route-local component (`app/**` → `src/components`, downhill; `FindingCard` is a
      sibling under the same route's `_components/`, so `import { FindingCard } from
      "../FindingCard";` — same relative pattern `FindingsPanel.tsx` already uses — not an
      upward `app/**` import from inside `src/components`)
    - skills: `frontend-ui-architecture` (steps 1, 6, 7), `react-best-practices`,
      `react-testing-library`, `zod`
    - `page.tsx` already computes `repoFullName` (line 82) and `pr.head_sha`, and already passes
      both to `FindingsTab` (lines 148-149). `DiffTab` needs the same two — it renders
      `FindingCard` now, which requires them for its GitHub blob links — so add
      `repoFullName={repoFullName}` and `headSha={pr.head_sha}` to the existing `<DiffTab ... />`
      call (page.tsx, where `tab === "diff"`), and two new props on `DiffTabProps`.
    - `helpers.ts` (pure, colocated, mirrors step 4's server rule): `latestReviewFindings
      (reviews: ReviewRecord[]): FindingRecord[]` — same latest-per-agent rule as the server
      (`review.agent_id`, `null` is its own key, newest-first assumed from `usePrReviews`'s
      order), flattening the kept reviews' `findings`. This is intentionally a *second*
      implementation of the same rule (server operates on DB rows, client on `ReviewRecord[]`
      from `usePrReviews`) — the brief calls for "a small pure helper on each side, both
      unit-tested" rather than one shared function, since the two sides don't share a type.
    - `DiffTab` changes:
      - call `usePrReviews(prId)` itself (react-query dedupes the `["reviews", prId]` fetch
        against the page-level call — no extra network round trip) and `useSmartDiff(prId)`;
        `useFindingAction()` for Accept/Dismiss.
      - order switch: a `Chip`/`Chip` pair (or `Button`/`Button` — check what reads best; brief
        line 210 leaves the exact primitive to the implementer) labelled via
        `smartDiff.orderSmart` / `smartDiff.orderOriginal`, `useState<'smart' | 'original'>
        ('smart')`.
      - build `groups` for `DiffViewer` only when order is `'smart'` and `useSmartDiff` has data
        (loading/error → flat/original, per brief line 191): join `smartDiff.groups[].files[]
        .path` back to `files` (prop, from `pr.files`) by path, label/hint from the i18n keys
        added in step 10. Pass `smartDiff.groups` straight through in the order the server sent
        it — per step 10, `DiffTab` does not import or recompute `ROLE_ORDER` (server-only).
      - `findings: DiffFindingApi = { findings: latestReviewFindings(reviews ?? []), showFindings,
        renderFinding: (f) => <FindingCard f={f} defaultExpanded={true} pending={action.isPending}
        repoFullName={repoFullName} headSha={headSha} onAction={(act) => action.mutate({
        findingId: f.id, action: act, prId })} /> }`. **`defaultExpanded={true}` is not optional**
        (P1-5): `FindingCard` defaults it to `false`, so without this the rationale stays hidden
        and the finding fails P1-5 outright. The header-click collapse (P3-15) still works from
        this expanded starting state. `repoFullName` and `headSha` are the two props threaded
        in from `page.tsx` above, not the PR-detail page's own local variables — `DiffTab` has no
        other way to reach them.
      - the existing `showComments` state becomes the shared toggle, **default `true`** (was
        `false`) — per brief's P2-13 design decision, this one toggle now also gates
        `findings.showFindings`. Two things about the existing code must both change, not just
        the default:
        1. **the visibility gate.** Today the toggle button only renders `commentCount > 0`
           (`DiffTab.tsx`'s `SectionLabel`'s `right` prop) — a PR with findings but zero GitHub
           comments would never see the toggle at all, silently failing P2-13. Gate on
           `commentCount > 0 || findings.findings.length > 0` instead.
        2. **the label.** The current `{showComments ? "Hide comments" : "Show comments"}
           ({commentCount})` is inline English (grandfathered, but this diff is now editing this
           exact line, so per `client/AGENTS.md` — "some older pages still inline text — don't
           copy that pattern" — move it to i18n rather than extending the inline string). Add
           `smartDiff.toggleShow`: `"Show comments & findings ({count})"` and
           `smartDiff.toggleHide`: `"Hide comments & findings ({count})"` (interpolate `count =
           commentCount + findings.findings.length`), replacing the hardcoded strings.
        A freshly-posted comment still forces the toggle open (existing `setShowComments(true)`
        after a successful post, unchanged).
      - empty state (P3-16): when `useSmartDiff` has data but every group's every file has zero
        findings (i.e. `reviews` is empty/undefined), show `smartDiff.emptyNoReview` instead of
        a `0` counter — simplest correct reading is "omit the dot/number", which `RoleGroup`
        already does (`findingsCount > 0` gate from step 8); no extra empty-state branch is
        needed beyond that gate, so this criterion is satisfied by step 8's behaviour, not new
        code here. State this explicitly in the implementer's report rather than adding a
        redundant `EmptyState`.
    - exports / signatures: none new (leaf of the dependency chain).
    - new tests: `helpers.test.ts` — `latestReviewFindings` keeps only the newest review per
      `agent_id`, treats `null` as its own key, flattens findings in that order.

## Contracts & data

- `SmartDiffRole` (`server/src/vendor/shared/contracts/brief.ts`, mirrored in
  `client/src/vendor/shared/contracts/brief.ts`): `z.enum(['core', 'tests', 'wiring', 'docs',
  'boilerplate'])` (was 3 values; the 5-value order IS the display order).
- New endpoint: `GET /pulls/:id/smart-diff` → `SmartDiff` (`server/src/modules/smart-diff/routes.ts`).
- i18n — `client/messages/en/prReview.json`, key `smartDiff`, new keys (existing
  `coreLabel`/`wiringLabel`/`boilerplateLabel`/`filesCount`/`groupedByRole` untouched):
  - `testsLabel`: "Tests"
  - `docsLabel`: "Docs"
  - `coreHint`: "Business logic"
  - `testsHint`: "Test coverage"
  - `wiringHint`: "Config & wiring"
  - `docsHint`: "Documentation"
  - `boilerplateHint`: "Generated & lockfiles"
  - `orderSmart`: "Smart order"
  - `orderOriginal`: "Original order"
  - `unanchoredHeading`: "Not shown inline (line not in this diff)"
  - `emptyNoReview`: "No review has run yet"
  - `severity.blocker`: "blocker"
  - `severity.warning`: "warning"
  - `severity.suggestion`: "suggestion"
  - `filesWithFindings`: "{count} files with findings"
  - `fileHasFindings`: "This file has findings"
- `client/src/lib/types.ts`: add `FindingRecord` and `SmartDiffRole` to the existing `export
  type { ... } from "@devdigest/shared"` block (both types only, no new value re-export — keeps
  the client/INSIGHTS.md barrel-values gotcha from applying).

## Checks for the implementer

- `server/`: `pnpm typecheck` · `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- `client/`: `pnpm typecheck` · `pnpm test`

## Checks for reviewers

- architecture-reviewer: `pnpm lint:boundaries` (server); onion-architecture step 9 report (layer
  named, import directions, port used instead of `Container`); `server/test/route-adapter-calls.
  test.ts` passes with no new entry needed in `GRANDFATHERED` (the route never touches an adapter
  member).
- plan-verifier: acceptance criteria 1–18 above, verified against the running app or the unit
  tests that cover each; the optional `smart-diff` integration test if the implementer added one
  (Docker, `pnpm exec vitest run .it.test`). P3-17 specifically: start Run review, switch to the
  Files changed tab mid-run (or right after), and confirm the group counters and file-card dots
  update once the run completes without a page reload — the invalidation this depends on
  (`onRunDone` → `refetchReviews()`) lives in `page.tsx`/`FindingsTab`, not in `DiffTab` itself,
  so this is a real cross-component behaviour to click through, not just a code-reading check.
- main session: e2e (none exist for this surface — note that, don't invent one unless asked);
  `pr-self-review`; `/security-review`; browser verification of the six P1 criteria end to end
  (group order, lock-file collapse, finding count after Run review, file-card dot, inline finding
  under the right line, Original-order switch).

## Out of scope

- Architecture review (architecture-reviewer), acceptance verification (plan-verifier), security
  review and e2e (main session) — not this plan's job.
- `pseudocode_summary` (left `null`), `split_suggestion` beyond the minimal fill described in
  step 4, any LLM call, changes to the Agent runs tab, new e2e flows, DB schema changes, new
  dependencies (brief's explicit "out of scope" list, carried through unchanged).
- An integration test for the `smart-diff` route: "welcome if `reviews.it.test.ts` helpers make
  it cheap" (brief) — left as the implementer's judgment call, not required by either check list
  above; if skipped, say so plainly rather than silently.
- Reconciling `server/src/vendor/shared` vs. `client/src/vendor/shared` drift outside
  `brief.ts` — pre-existing and explicitly not this plan's concern (`server/INSIGHTS.md`
  2026-09-16).

## Risks & open questions

- **Exact UI copy for group hints, the order-switch primitive, and the unanchored-findings
  heading** are not specified in the brief. Defaults are given in Steps 10–11 and Contracts &
  data; the implementer may adjust wording but must keep every user-facing string in
  `prReview.json:smartDiff` (P3-18), not inline.
- **Highest-severity stripe when a line has multiple findings** (step 9): the brief doesn't say
  which colour wins when a line has both a CRITICAL and a WARNING finding. Default chosen:
  highest severity by `CRITICAL > WARNING > SUGGESTION` wins the stripe colour; all findings for
  that line still render individually below it.
- **DiffTab calling `usePrReviews(prId)` itself** instead of receiving `reviews` as a new prop
  from `page.tsx` (which already calls the same hook): relies on react-query's queryKey dedup to
  avoid a duplicate network call. This matches DiffTab's existing self-fetching pattern
  (`usePrComments`/`useCreatePrComment`) rather than the more prop-heavy pattern `FindingsTab`
  uses. If the implementer finds this surprising in review, the alternative (thread `reviews` as
  a prop from `page.tsx`) is a one-line change with no other impact.
- **Whether `getPull` in `SmartDiffStorePort` needs the full `PullRow`**: step 4 declares it as
  `Promise<{ id: string } | undefined>` since the service only needs existence for the 404 check;
  confirm no other field is needed once `service.ts` is actually written — if `workspaceId`-scoped
  existence needs more, widen the local interface, not the import.
- **No integration test exists yet for a route this shape (`GET .../smart-diff`, no mutation)** —
  confirm with `reviews.it.test.ts`'s existing helpers whether a read-only route integration test
  is cheap enough to add; if it requires meaningfully new fixture setup, the brief allows skipping
  it (see Out of scope).
