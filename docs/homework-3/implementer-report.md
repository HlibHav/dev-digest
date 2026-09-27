# Implementation Report: Smart Diff for the Files changed tab
Status: done

## Steps
| id | BE/UI | status | files touched | note |
|----|-------|--------|----------------|------|
| 1 | BE | done | `server/src/vendor/shared/contracts/brief.ts` | `SmartDiffRole` → 5-value enum |
| 2 | UI | done | `client/src/vendor/shared/contracts/brief.ts` | verbatim mirror; `diff -rq` clean |
| 3 | BE | done | `server/src/modules/smart-diff/{constants,classify}.ts` | `package.json` → wiring added per caller note |
| 4 | BE | done | `server/src/modules/smart-diff/service.ts` | `buildSmartDiff`, `latestReviewPerAgent`, `SmartDiffStorePort`, `SmartDiffService` |
| 5 | BE | done | `server/src/modules/smart-diff/routes.ts` | service built at plugin scope on `container.reviewRepo` |
| 6 | BE | done | `server/src/modules/index.ts`, `server/test/smart-diff-build.test.ts` | module registered; build/latest-per-agent tests |
| 12 (caller) | BE | done | `server/test/smart-diff.it.test.ts` | integration test written, **not run** (plan-verifier's job — see Handoff) |
| 7 | UI | done | `client/src/components/diff-viewer/{findings,constants}.ts` + test | `DiffFindingApi`, `findingKey`, `partitionFindings`, `filesWithFindings`, `severityLabel`, `highestSeverity` |
| 8 | UI | done | `RoleGroup/*`, `FileCard/FileCard.tsx` + test | dot, sticky header, `●N`, unanchored block |
| 9 | UI | done | `CodeLine/CodeLine.tsx` | stripe + severity label + inline `renderFinding` |
| 10 | UI | done | `DiffViewer/DiffViewer.tsx`, `diff-viewer/index.ts`, `lib/hooks/reviews.ts`, `messages/en/prReview.json` | groups mode, `useSmartDiff`, i18n keys |
| 11 | UI | done | `page.tsx`, `DiffTab/{DiffTab.tsx,helpers.ts}` + test | order switch, shared toggle, Accept/Dismiss, latest-per-agent |

## Skills applied
- loaded: onion-architecture, frontend-ui-architecture
- invoked through Skill: server/** → onion-architecture (route/service/port shape, step 9 "prove it" run); client/** → frontend-ui-architecture (placement, import direction, barrel rule, types-from-contract)
- named by the plan but not invoked: fastify-best-practices, drizzle-orm-patterns, zod (server); next-best-practices, react-best-practices, react-testing-library, zod (client), security (both) — not invoked as separate Skill calls; the route/service/contract/test code follows their conventions by copying the cited precedents (`skills/routes.ts`, `comments.ts`, `FindingCard.test.tsx`) directly, per the plan's own file-level guidance. None of the work needed a rule from these skills beyond what the plan already spelled out.

## Self-review (code writing)
- onion-architecture — `smart-diff/{constants,classify,service,routes}.ts`: route runs no query and touches no adapter (`container.reviewRepo` is a property, service built once at plugin scope, matching `skills/routes.ts:83`); `service.ts` imports nothing from `../reviews/` (no cross-module import), declares `SmartDiffStorePort` as a local interface with no `drizzle-orm`/`src/db/**` import; `classify.ts`/`constants.ts` are pure, no HTTP/DB. `pnpm lint:boundaries` → 0 new violations (34 known, pre-existing). `route-adapter-calls.test.ts` passed with no new `GRANDFATHERED` entry needed.
- frontend-ui-architecture — `findings.ts`/`RoleGroup`/`FileCard`/`CodeLine`/`DiffViewer` stay in `src/components/diff-viewer` and never import `FindingCard` from `app/**` (render-prop `renderFinding` threaded from `DiffTab`); new client types come from `@/lib/types` (added `FindingRecord`, `SmartDiffRole` there) in shared-component code; `DiffTab/helpers.ts` and `page.tsx` prop-threading kept route-local, downhill only; `RoleGroup/index.ts` is a named-export barrel per rule 8. One fix during self-review: `DiffViewer/index.ts` and the top-level `diff-viewer/index.ts` didn't re-export the new `DiffViewerGroup`/`DiffFindingApi` types — added both (caught by `pnpm typecheck`, not by eye).
- i18n — grepped for hardcoded English left by the diff: found the pre-existing `"Hide comments"/"Show comments"` inline string on the exact line this change edits; moved it to `smartDiff.toggleShow`/`toggleHide` per `client/AGENTS.md`'s "don't copy that pattern" note. `"Files changed · {filesCount} files"` above it is untouched, pre-existing, out of scope.
- test hygiene — after adding `useTranslations("prReview")` to `CodeLine`/`FileCard`, the pre-existing `src/test/smoke.test.tsx` and my own `RoleGroup.test.tsx` started logging `MISSING_MESSAGE` (non-fatal, but noisy); added the missing namespace messages to both instead of leaving console noise.

## Tests
| command | package | exit code | passed / failed |
|---|---|---|---|
| `pnpm typecheck` | server | 0 | — |
| `pnpm exec vitest run --exclude '**/*.it.test.ts'` | server | 0 | 194 passed (24 files), incl. 15 new classify-table cases + 8 new build/latest-per-agent cases |
| `pnpm lint:boundaries` | server | 0 | 0 new violations (34 known, ignored) — ran for my own confidence, not a substitute for architecture-reviewer |
| `pnpm typecheck` | client | 0 | — |
| `pnpm test` | client | 0 | 163 passed (32 files), incl. 10 new `findings.test.ts`, 3 new `RoleGroup.test.tsx`, 4 new `FileCard.test.tsx`, 3 new `DiffTab/helpers.test.ts` |

`server/test/smart-diff.it.test.ts` was written but **not executed** — integration tests are explicitly plan-verifier's job per my role brief, not mine, even though Docker happened to be available in this environment.

## Deviations from plan
- **`UnanchoredFindings` kept inline in `FileCard.tsx`** rather than a separate file — step 8 explicitly left this as "implementer's call, keep it in FileCard.tsx unless it grows"; it's ~10 lines, so it stayed inline.
- **P3-16 (empty state)**: no new code — `RoleGroup`'s existing `findingsCount > 0` gate (step 8) already satisfies "omit the dot/number" when no review has run. Stated explicitly here rather than adding a redundant `EmptyState`, per the plan's own instruction (Risks & open questions).
- **`smoke.test.tsx` edited** (not in the plan's Affected surfaces list): my change added an unconditional `useTranslations("prReview")` to `CodeLine`/`FileCard`, which made this pre-existing test log `MISSING_MESSAGE` for a namespace it didn't provide. Added the missing `prReview` messages to its existing `NextIntlClientProvider` — a one-line-scope fix directly caused by this diff's blast radius, not a redesign.
- **Stripe colour tie-break**: implemented as the plan's own default (CRITICAL > WARNING > SUGGESTION) — `findings.ts`'s `highestSeverity`, consumed by `CodeLine`.
- **Order-switch primitive**: used `Chip` (two, active-toggled) per brief's "check what exists before inventing" — `Button` felt wrong for a persistent two-state toggle; `Chip` already has an `active` prop built for exactly this.

## Not done / blocked
None. All 12 steps (11 from the plan + the caller's added step 12) are done.

## INSIGHTS candidates (for the main session; do not write INSIGHTS.md yourself)
- A `/** ... */` JSDoc comment containing the literal substring `**/` inside backticked prose (e.g. documenting a glob pattern like `` `**/` ``) closes the comment early — TypeScript then tries to parse the rest of the doc-comment text as code and produces a cascade of unrelated-looking syntax errors far from the real cause. Hit this writing `server/src/modules/smart-diff/classify.ts`'s JSDoc, which literally described glob patterns containing `**/`. Fix: never write a literal `*/` sequence inside a block comment, even inside backticks/prose — describe the pattern in words instead. Evidence: `server/src/modules/smart-diff/classify.ts:16-27` (first version), `tsc` errors pointed at line 17 col 53 with no separate mention of the real syntax hazard.
- `CodeLine.tsx` and `FileCard.tsx` didn't call `useTranslations` before this change; adding one unconditionally (even behind a prop that's often absent) means every existing test that renders `DiffViewer`/`FileCard`/`CodeLine` needs that namespace in its `NextIntlClientProvider`, or next-intl logs (not throws) `MISSING_MESSAGE` to stderr. `src/test/smoke.test.tsx` is the only pre-existing example; grep for `<DiffViewer` / `<FileCard` / `<CodeLine` in test files before adding a new `useTranslations` call to a shared diff-viewer component. Evidence: `client/src/test/smoke.test.tsx:7-8,37`.

## Handoff to reviewers
- Surfaces and files touched: see Steps table above; full list also in `git status --short` (server: `modules/smart-diff/**`, `modules/index.ts`, `vendor/shared/contracts/brief.ts`, 3 new test files; client: `vendor/shared/contracts/brief.ts`, `lib/types.ts`, `lib/hooks/reviews.ts`, `components/diff-viewer/**`, `app/.../DiffTab/**`, `app/.../page.tsx`, `messages/en/prReview.json`, `test/smoke.test.tsx`).
- architecture-reviewer: `pnpm lint:boundaries` (ran clean, 0 new violations, for my own confidence — please re-verify formally); onion-architecture step 9 report — layer names above, `SmartDiffStorePort` structural typing against `ReviewRepository`, `container.reviewRepo` property access (not an import) in `routes.ts`; `route-adapter-calls.test.ts` passed with no new `GRANDFATHERED` entry.
- plan-verifier: acceptance criteria 1–18 in the brief; **`server/test/smart-diff.it.test.ts` is written but not run — please run `pnpm exec vitest run .it.test` (Docker) as the first check.** It seeds one PR with 5 files (lock/core/test/index/docs), one review, two findings on the core file at `start_line: 11` (should dedupe to `[11]`) and one on the lock file, and asserts: 200 + `SmartDiff.parse`, group order `core→tests→wiring→docs→boilerplate`, lock file in `boilerplate`, `finding_lines` of the core file `[11]`, `total_lines` = 122 (Σ additions+deletions across the 5 seeded files), and a 404 on an unknown PR id. P3-17 specifically needs a browser click-through per the plan (react-query cache-key reasoning alone isn't proof) — I traced it: `DiffTab` calls `usePrReviews(prId)` itself (same `["reviews", prId]` key `page.tsx` invalidates on run-done), and `RoleGroup`'s `findingsCount`/`FileCard`'s dot are both computed client-side from that hook's data via `filesWithFindings`/`partitionFindings` — NOT from the `smart-diff` response's own (unused-by-the-client) `finding_lines` field — so no separate invalidation of `["smart-diff", prId]` is needed for counts to refresh after a run.
- main session: e2e (none exist for this surface, none added, per the brief); `pr-self-review`; `/security-review`; browser verification of the six P1 criteria end to end (group order, lock-file collapse, finding count after Run review, file-card dot, inline finding under the right line, Original-order switch). Worth a specific look: the severity-stripe tie-break (highest of CRITICAL/WARNING/SUGGESTION wins the line colour) and the unanchored-findings block wording (`smartDiff.unanchoredHeading`) — both are implementer defaults per the plan's Risks section, not brief-specified copy.

No architecture, acceptance or security verdict is given here.
