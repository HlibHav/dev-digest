# Architecture Review: uncommitted changes in .claude/worktrees/notebooklm-connection-setup-12e635 (vs HEAD = main)
Verdict: pass

## Surfaces
- `server` → `modules/smart-diff` (new: `routes.ts`, `service.ts`, `classify.ts`, `constants.ts`) → route → service (port) → domain (pure classify/build)
- `server` → shared contract → `server/src/vendor/shared/contracts/brief.ts` (`SmartDiffRole` 3→5 values)
- `server` → wiring → `server/src/modules/index.ts` (one import, one registry entry)
- `server` → tests → `server/test/smart-diff-{classify,build}.test.ts`, `smart-diff.it.test.ts` (new, unrun — plan-verifier's job, not architecture)
- `client` → shared contract mirror → `client/src/vendor/shared/contracts/brief.ts`
- `client` → shared component module → `src/components/diff-viewer/{findings.ts (new), constants.ts, RoleGroup/ (new), FileCard/, CodeLine/, DiffViewer/, index.ts}`
- `client` → hook → `src/lib/hooks/reviews.ts` (`useSmartDiff`)
- `client` → types → `src/lib/types.ts` (`FindingRecord`, `SmartDiffRole` added, type-only)
- `client` → route-local → `.../pulls/[number]/_components/DiffTab/{DiffTab.tsx, helpers.ts (new)}`, `.../pulls/[number]/page.tsx`
- `client` → i18n → `client/messages/en/prReview.json`

## Checks run
| command | exit | key line |
|---|---|---|
| `cd server && pnpm lint:boundaries` | 0 | `✔ no dependency violations found (166 modules, 549 dependencies cruised)` · `‼ 34 known violations ignored` (baseline unchanged) |
| `cd server && pnpm exec vitest run test/route-adapter-calls.test.ts` | 0 | `✓ test/route-adapter-calls.test.ts (8 tests)` — no new `GRANDFATHERED` entry needed |
| `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` | 0 | empty output (clean) |

## Step 9 report
`server/src/modules/smart-diff/`: route (`routes.ts`) → service (`service.ts`, port-typed) → domain (`classify.ts`, `constants.ts`, pure). Imports added: `service.ts` imports only `@devdigest/shared` (type) + its own `constants.ts`/`classify.ts` — no `fastify`, `drizzle-orm`, `src/db/**`, or `../reviews/*`. `routes.ts` imports `SmartDiffService` (inward, same module) and platform helpers (`getContext`, `IdParams`, `NotFoundError`) — same set `reviews/routes.ts` already imports. `container.reviewRepo` is read as a property at plugin scope (`routes.ts:20`), not inside the handler, and not an import of `../reviews/repository.js`. `lint:boundaries` and `route-adapter-calls.test.ts` both pass with 0 new violations/entries.

## Findings
| # | severity | verified / plausible | rule | `path:line` | evidence |
|---|---|---|---|---|---|
| — | — | — | — | — | none |

Zero findings. Specifically checked and clean:
- Route runs no query, calls no adapter member — `server/src/modules/smart-diff/routes.ts:14-27` builds `new SmartDiffService(container.reviewRepo)` once at plugin scope (mirrors `skills/routes.ts:82-83`), the handler only calls `getContext` and `service.getSmartDiff`.
- Service takes a port, not `Container` — `service.ts:76-82` declares `SmartDiffStorePort` as a local interface; `SmartDiffService`'s constructor (`service.ts:85`) takes `SmartDiffStorePort`, not `Container`.
- No cross-module import — `service.ts` and `routes.ts` import nothing from `../reviews/`; `ReviewRepository` never appears by name, only structurally via `container.reviewRepo`'s already-typed return.
- No `drizzle-orm`/`src/db/**` import in application code — `service.ts:1-3` imports only `@devdigest/shared` (type-only) and its own sibling files.
- Contract edited server-first, mirrored verbatim, verified with `diff -rq` on the touched file only (per `.claude/rules/shared-contracts.md`) — both `brief.ts` copies are byte-identical after the edit.
- `src/components/diff-viewer` never imports `FindingCard` or anything from `app/**` — grepped the whole directory; the only textual match is a comment in `findings.ts:5` stating the rule. The real finding card is threaded in via `renderFinding` (`DiffFindingApi`), supplied by `DiffTab`.
- `DiffTab.tsx` (route-local, `app/**`) imports `FindingCard` as `"../FindingCard"` — a sibling under the same route's `_components/`, the same relative pattern `FindingsPanel.tsx` already uses, not an upward import into `src/components`.
- Barrels: `RoleGroup/index.ts` → `export { RoleGroup } from "./RoleGroup";` (named export only); `diff-viewer/index.ts` and `DiffViewer/index.ts` add `DiffViewerGroup`/`DiffFindingApi` as named type exports, no new `export *`.
- Types from contract: `client/src/lib/types.ts` adds `FindingRecord`, `SmartDiffRole` as `export type { ... } from "@devdigest/shared"` — type-only, consistent with `client/INSIGHTS.md`'s barrel-values gotcha (a runtime value needs a deep import; neither of these is used as a value).
- `DiffViewer` renders `groups` in the array order it receives (`DiffViewer.tsx:33-49`) and never imports `ROLE_ORDER` (a server-only module) — matches plan step 10's constraint; `client/src/components/diff-viewer/constants.ts`'s `COLLAPSED_BY_DEFAULT`/`ROLE_COLOR_VAR` are separate, client-local constants.

## Not checked
- `reviewer-core/` — untouched by this diff, no boundary check needed.
- Server integration test `smart-diff.it.test.ts` and the acceptance criteria (P1–P18) — plan-verifier's scope, not architecture.
- Correctness of the `latestReviewFindings`/`latestReviewPerAgent` rule duplication, the severity tie-break, and dynamic i18n key construction (`t(\`smartDiff.${role}Label\`)`) — logic/correctness, not layering.

## Out of scope, noticed
- `DiffTab.tsx` builds i18n keys dynamically (`` t(`smartDiff.${g.role}Label`) ``, `` t(`smartDiff.${g.role}Hint`) ``) instead of a lookup table — works, but a missing/renamed key in `prReview.json` would fail silently at runtime with no type check catching it. Correctness/i18n concern, not architecture.
