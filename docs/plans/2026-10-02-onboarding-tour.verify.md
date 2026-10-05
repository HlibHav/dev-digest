# Plan Verification: Onboarding Tour (five-part guided tour of a repo)
Target: 73d4922...ab9de07 (branch feat/onboarding-tour, head ab9de07)
Overall: gaps (AC-15 is partial, and 7 planning-artifact files map to no plan step)
Counts: 58 met · 1 partial · 0 not met · 12 unverifiable · 7 unmapped files

Working tree: `git status --porcelain` was empty before and after my run.

## Checks I ran (all at head ab9de07)
| item | command | exit | result line | verdict |
|---|---|---|---|---|
| Integration suite (all `.it.test`, Docker) | `pnpm --dir server exec vitest run .it.test` | 0 | `Test Files 19 passed (19) / Tests 128 passed (128)`, 0 skipped. This includes onboarding.it 15, onboarding-service.it 9, onboarding-review-isolation.it 1 and repo-intel-onboarding-reads.it 2. | met |
| Server unit | `.claude/sandbox/run-tests.sh pnpm --dir server exec vitest run --exclude '**/*.it.test.ts'` | 0 | `37 passed / 362 passed` | met |
| Client unit | `.claude/sandbox/run-tests.sh pnpm --dir client test` | 0 | `53 passed / 307 passed` | met |
| Server typecheck | `pnpm --dir server typecheck` | 0 | no errors | met |
| Client typecheck | `pnpm --dir client typecheck` | 0 | no errors | met |
| Targeted verbose server | `vitest run test/onboarding-helpers.test.ts test/fs-clone-scanner.test.ts --reporter=verbose` | 0 | 19 passed (14 helpers, 5 scanner) | met |
| Targeted verbose client | `vitest run 'src/app/repos/[repoId]/onboarding' src/components/app-shell --reporter=verbose` | 0 | 37 passed | met |
| Red-first integrity | `git diff e84d133 ab9de07 --stat` on the 6 red-first files | 0 | Only `server/test/onboarding-helpers.test.ts` changed: 137 insertions, 0 deletions. The other five are unchanged. | met |
| Contracts mirror | `diff -rq server/src/vendor/shared client/src/vendor/shared`, then `diff` of `knowledge.ts` and `adapters.ts` | 1 (differences) | The five differing files differ only in older drift. Every difference is in code that predates this work (AgentVersion, CommitFiles, sessionId and the like). The new `Onboarding*` and `CloneScan` blocks are identical in both copies. | met |
| Migration | `git diff 73d4922...ab9de07 --stat -- server/src/db` | 0 | empty, so no schema change and no migration | met |

Note: my first `.it.test` run came back 128 skipped (`docker info` probe in `server/test/helpers/pg.ts` timed out under load). The second run, with Docker idle, ran everything. A targeted run through the sandbox wrapper also skipped, so only the unwrapped `.it.test` run counts.

## Steps
| item | verdict | evidence |
|---|---|---|
| S1 contracts and CloneScanner port | met | Commit 39a41c7. `knowledge.ts` and `adapters.ts` in both server and client; the new blocks are identical (`diff`). Client typecheck exit 0. |
| S2 repo-intel facade types | met | `server/src/modules/repo-intel/types.ts` in 39a41c7. Server typecheck is green. |
| S3 client hooks | met | `client/src/lib/hooks/onboarding.ts` in 39a41c7. The view test mocks it and passes. |
| S4 repo-intel reads | met | repo-intel-onboarding-reads.it passed (2 tests, in the 128). `service.ts`, `repository.ts` and `README.md` changed in a8f56c1. |
| S5 FsCloneScanner, MockCloneScanner, container | met | fs-clone-scanner.test 5/5 pass. `container.ts` has the `cloneScanner` override and getter. |
| S6 helpers, schema, constants | met | onboarding-helpers 14/14 pass. `llm-schema.ts:8-14` uses `.nullable()` for `diagram`. `helpers.ts` has every named function. |
| S7 repository | met | `repository.ts:29-65`: workspace-scoped `getRepo`, `readTour`, upsert `saveTour` returning `'repo_gone'` on 23503. |
| S8 service, wiring, prompt | met | `service.ts:134-154`: `generate` never throws, removes the repo from `inFlight` in `finally`, logs once. `service.ts:240-253`: one call, `timeoutMs` 90000, `maxRetries` 0. `service.ts:295-309`: AC-25 keep-and-record. `wiring.ts` holds the ports. onboarding-service.it 9/9 pass. |
| S9 routes and registration | met | `routes.ts:25,35-36`: both routes declare `response`, POST rate limit is 10 per minute with `reply.code(202)`, `IdParams` on both. `modules/index.ts` registers `onboarding`. onboarding.it 15/15 pass. |
| S10 nav and activeKey | met | `nav.ts` entry between `pulls` and `context`, no `gKey`. `helpers.ts` uses the `^/repos/[^/]+/onboarding` regex. OnboardingTourNav.test 2/2 pass and ProjectContextNav stays green. |
| S11 page helpers | met | `OnboardingTourView/helpers.ts` plus helpers.test 6/6 pass, including all four named tests. |
| S12 page | met | `page.tsx`, the 8 subcomponents and `onboarding.json` rewritten. View test 28/28 pass. |

## AC → task → test → commit matrix
Commits: e84d133 = red-first tests; 39a41c7 = contracts and hooks; a8f56c1 = helpers, scanner, repo-intel reads, nav, client page; ab9de07 = service, routes, prompt. `OT.it` = `server/test/onboarding.it.test.ts`, `SVC.it` = `onboarding-service.it.test.ts`, `H` = `onboarding-helpers.test.ts`, `V` = `OnboardingTourView.test.tsx`, `N` = `OnboardingTourNav.test.tsx`. Integration test names come from the test-writer report and the plan. The verbose vitest output truncated some of them, but each file's full count passed.
| AC | step | proving test | proving-code commit | verdict |
|---|---|---|---|---|
| AC-1 | 10 | N "links to the repo's tour page in WORKSPACE and is active there" | a8f56c1 | met |
| AC-2 | 10 | N "add-repository screen marks nothing as Onboarding Tour" | a8f56c1 | met |
| AC-3 | 12 | V "five headings and five anchors in order" | a8f56c1 | met |
| AC-4 | 12 | V "anchor click scrolls First tasks into view" | a8f56c1 | met |
| AC-5 | 12 | V "header collapses and expands Critical paths" | a8f56c1 | met |
| AC-6 | 7,8,9,12 | OT "cloned repo without tour → state none, 0 calls"; V "empty state shows Generate onboarding tour" | ab9de07, a8f56c1 | met |
| AC-7 | 8,9,12 | OT "not cloned → 409 not_cloned, 0 calls"; V "not cloned notice, no Generate" | ab9de07, a8f56c1 | met |
| AC-8 | 12 | V "generating → status and disabled Regenerate" and "generating with no tour yet disables Generate" | a8f56c1 | met |
| AC-9 | 3,8,9 | OT "gated mock: 202 generating, then ready" | ab9de07 (polling hook in 39a41c7) | met |
| AC-10 | 8 | OT "1 call on success, 1 on throw" | ab9de07 | met |
| AC-11 | 8,9 | OT "second POST → 409 already_generating, calls still 1" | ab9de07 | met |
| AC-12 | 7,8 | OT "persisted; two reads equal, calls still 1" | ab9de07 | met |
| AC-13 | 6,8 | SVC "one log line with llm_calls=1, tokens 1200/300, $0.0021, complete"; "null price → —" | ab9de07, a8f56c1 (`formatGenerationLog`) | met |
| AC-14 | 11,12 | V "subline 1 LLM call · $0.0021 · openrouter/…; — for null; 0 LLM calls" | a8f56c1 | met |
| AC-15 | 5,6,8,11,12 | V "index of 812 files, generated 2h ago; partial 5,000 of 12,450"; OT "self-reported full index with 5 of 7 supported files → partial 5 of 7" | a8f56c1, ab9de07 | partial (see below) |
| AC-16 | 8 | `onboarding-review-isolation.it` "tour marker never reaches a review prompt" (passes; the main session confirmed the controls) | ab9de07 | met |
| AC-17 | 6,8,12 | SVC "throw and malformed → skeleton llm_failed, calls 1"; V "llm_failed status line" | ab9de07, a8f56c1 | met |
| AC-18 | 8,12 | SVC "never-resolving and retried-60 s mocks → timed_out, cost null, one log line, ready"; V "timed_out status line" | ab9de07, a8f56c1 | met |
| AC-19 | 6,8,12 | OT "degraded index → 0 calls, index_unavailable"; V "index_unavailable status line" | ab9de07, a8f56c1 | met |
| AC-20 | 6,8 | OT "partial index 3 of 5 → 1 call, partial, only indexed files" | ab9de07 | met |
| AC-21 | 5,6,8,12 | OT "py-only clone → 1 call, unsupported_languages, notices"; V "section notice rendered" | ab9de07, a8f56c1 | met |
| AC-22 | 6 | H "buildSkeleton from fixed facts" | a8f56c1 | met |
| AC-23 | 6,8,12 | SVC "index read throws → ready skeleton, reason error, 0 calls, error log, health 200"; V "error status line" | ab9de07, a8f56c1 | met |
| AC-24 | 8 | SVC "recreated service never reads generating" | ab9de07 | met |
| AC-25 | 8,12 | SVC "failed regenerate keeps LLM tour, records last_failure, logs llm_failed"; V "Last regeneration failed banner" | ab9de07, a8f56c1 | met |
| AC-26 | 11,12 | V "stale banner when commits differ, none when equal" (helpers.test "isStale false when either sha is empty") | a8f56c1 | met |
| AC-27 | 6,8 | OT "invented command dropped, note kept on pnpm install"; H "mergeTour drops an invented command…" | ab9de07, a8f56c1 | met |
| AC-28 | 6 | H "deriveCommands order, no lint; npm run and bun run forms" | a8f56c1 | met |
| AC-29 | 12 | V "note rendered apart; copy puts cp .env.example .env only, Copied" | a8f56c1 | met |
| AC-30 | 12 | V "empty command list → notice" | a8f56c1 | met |
| AC-31 | 4,6 | H "orderReadingPath rank, tie by path, tests out" | a8f56c1 | met |
| AC-32 | 12 | V "reading path states its ordering" | a8f56c1 | met |
| AC-33 | 6,8 | OT "LLM cannot add or reorder critical files; fallback reason"; H "mergeTour keeps index order and fills missing reasons…" | ab9de07, a8f56c1 | met |
| AC-34 | 11,12 | V "Open → github blob at abc123, new tab"; helpers.test "githubBlobUrl encodes each segment" | a8f56c1 | met |
| AC-35 | 6,12 | H "mergeTour stores two valid tasks", "skeleton without a test command stores three checklist items"; V "renders stored first-task items, no checklist of its own" | a8f56c1 | met |
| AC-36 | 5,6,8 | OT "ghost task dropped; all ghosts → checklist items stored"; fs-clone-scanner "exists rejects traversal, absolute and escaping symlink" | ab9de07, a8f56c1 | met |
| AC-37 | 12 | V "overview sanitised, path as code" | a8f56c1 | met |
| AC-38 | 11,12 | V "5-node diagram shown", "syntax error dropped, prose kept", "13 nodes dropped, prose kept" | a8f56c1 | met |
| AC-39 | 12 | V "Share link copies page URL, Link copied" | a8f56c1 | met |
| AC-40 | all | the main session's browser demo (hono) | n/a | unverifiable (main-session browser check, pending) |
| AC-41 | 6 | H "buildModelInput caps 50 routes, 4,000 chars, 20 folders" | a8f56c1 | met |

AC-15 partial: `TourHeader.tsx` builds the index half of the subline only when `index.status` is `full` or `partial`. For `unavailable` and `unsupported_languages` it shows only "generated <age>". The AC says "WHEN a tour is shown, the subline shall show 'Generated from index of <N> files'", with no exception. Lane 6 listed this as a deviation (its report, "index half appears only when full or partial"). No test covers the other two statuses. The full and partial cases pass.

Red-first: criteria on the plan's list have tests committed in e84d133 before any code, and the test files are unchanged except the append-only addition to H. Lane 4 recorded a red run for the integration files before writing code (15 failed in `onboarding.it`; the other two failed at load on `wiring.js`). Lane 1 and lane 6's `helpers.test.ts` also recorded red runs. Lanes 5 and 6 recorded no red run of their own for N and V, so their red state rests on test-writer's e84d133 runs in the state file.

## Contracts & data
| item | verdict | evidence |
|---|---|---|
| C1 shared contracts (`Onboarding*`, `CloneScanner`, mirrored to the client) | met | 39a41c7. `diff` shows the new blocks identical on both sides. Typechecks are green. |
| C2 module facade (`RankedFileRow`, `getRankedFiles`, `getRoutes`) | met | `types.ts` in 39a41c7. Implementation in a8f56c1. repo-intel-onboarding-reads.it passes. |
| C3 HTTP codes (GET 200/404/422; POST 202/409 `not_cloned` or `already_generating`/404/422) | met | `routes.ts`, `service.ts:122-131`. OT passes, including its 404/422 test. |
| C4 migration: none | met | `git diff --stat` on `server/src/db` is empty. |
| C5 i18n in `client/messages/en/onboarding.json` | met | The diff adds every key the status lines, banners and subline need. The old empty-state body is replaced. The client suite shows no MISSING_MESSAGE. |
| C6 seed: none | met | No seed file in the stat. |

## Checks (plan's "Checks for reviewers")
| item | command | exit | result line | verdict |
|---|---|---|---|---|
| K1 plan-verifier: ACs and `.it.test` | `pnpm --dir server exec vitest run .it.test` | 0 | 128 passed, 0 skipped | met |
| K2 `pnpm lint:boundaries` | not run | n/a | n/a | unverifiable: architecture-reviewer |
| K3 onion-architecture step 9 report | not run | n/a | n/a | unverifiable: architecture-reviewer |
| K4 `test/route-adapter-calls.test.ts` | not run on its own | n/a | It passed in the full server unit run (8 tests), but the plan assigns it to the reviewer. | unverifiable: architecture-reviewer |
| K5 rule-6 deviation stays inside `modules/onboarding/` | not run | n/a | n/a | unverifiable: architecture-reviewer |
| K6 AC-16 grep for `modules/onboarding` and `t.onboarding` | not run | n/a | The stat shows no file outside the module changed except `modules/index.ts`; `modules/reviews`, `reviewer-core` and `src/db` have no diff. | unverifiable: architecture-reviewer |
| K7 frontend placement and the single `nav.ts` edit | not run | n/a | `nav.ts` diff is one added line. | unverifiable: architecture-reviewer |
| K8 security review | not run | n/a | n/a | unverifiable: security-reviewer |
| K9 `/code-review` | not run | n/a | n/a | unverifiable: main session |
| K10 AC-40 browser check | not run | n/a | n/a | unverifiable: main session (pending) |
| K11 `pr-self-review` | not run | n/a | n/a | unverifiable: main session |
| K12 `engineering-insights` | not run | n/a | n/a | unverifiable: main session |

## Rows that are NOT met (to show the user before merge)
1. **AC-15: partial.** The subline omits "Generated from index of N files" when the index status is `unavailable` or `unsupported_languages`. Evidence: `TourHeader.tsx` `indexPart` is null for those statuses. The AC states no exception, and no test covers these cases.
2. **AC-40: unverifiable (main-session browser check, pending).**
3. Not-run reviewer checks K2–K12 (architecture-reviewer, security-reviewer, main session). These are unverifiable by assignment, not failures.

## Ledger items
**PROC-1: lane 3's 8 appended helper tests, never run red.** I did not run mutations; this is reasoning against `helpers.ts`. All 8 pass at head. Seven of the eight can fail; one has a redundant guard.
- "mergeTour ignores reasons and notes outside the deterministic lists": it can fail only if `mergeTour` appends or renders LLM entries that are not in the deterministic lists. Removing the `allowed.has(...)` check at `helpers.ts:328` or the `commands.includes(...)` check at `:347` would NOT make it fail. Output rows are built by mapping over the deterministic lists, so a ghost path or command can never be rendered. Those two checks are redundant with that structure. The test pins the structure, not the checks.
- "mergeTour drops an invented command and keeps the note on pnpm install": fails if the note is not attached, attached to the wrong row, or the invented command is appended. It uses an exact `toEqual`, including `reason_source`.
- "mergeTour keeps index order and fills missing reasons with imported by N files": fails if the LLM order replaces the index order, if the fallback `importerReason` is removed, or if `reason_source` is wrong.
- "mergeTour flattens multi-line reasons": fails if `oneLine` is removed from `reasonMap` (`helpers.ts:327`).
- "buildModelInput caps oversized critical and reading lists to 5 and 10": fails if `MAX_CRITICAL` or `MAX_READING` changes, or the caps inside `pickCriticalFiles` and `orderReadingPath` are removed. Removing only the extra `.slice` calls in `buildModelInput` (`:200`, `:203`) would NOT fail it, because the inner functions already cap.
- "formatGenerationLog…": fails on any change to the `repo=`, `llm_calls=`, `tokens in/out`, cost format (for example `toFixed(4)`), `outcome=` or the `—` fallbacks.
- "toIndexStatus": fails if the order of the checks changes, or on the `filesIndexed < sourceFiles` rule or the `max` clamp. It covers all five unavailable and unsupported branches plus 5-of-7 and 812-of-812.
- "orientationChecklist drops each step…": fails if any prerequisite gate is removed or the titles change.

Net: no appended test is vacuous, but two guard-level mutations (the allow-list checks in `reasonMap`/`notes`, and the extra slices in `buildModelInput`) are not caught. In both cases an inner structure already enforces the same invariant.

**PROC-2: plan-named skills not invoked by lanes (zod, security, drizzle-orm-patterns, fastify-best-practices, next/react-best-practices, react-testing-library, postgresql-table-design).** No acceptance criterion or step depends on a skill having been invoked. Plan steps list skills for the implementer, but none of the ACs, contracts or "turns green" lines mention them. The outcomes those skills were meant to protect each have a test or a quoted line:
- zod nullable (`llm-schema.ts:10`), `response` declared on both routes (`routes.ts:25,35`), the rate limit (`routes.ts:36`).
- Containment in `exists`: the test "exists rejects traversal, absolute and escaping symlink" passes.
- The drizzle left-join: repo-intel-onboarding-reads.it passes.
- Markdown sanitising: V "overview sanitised, path as code" passes.
- Fencing, security skill territory: `renderModelInput` uses `wrapUntrusted` (`helpers.ts:211`). Whether the fencing and the `exists` containment are sufficient is the security-reviewer's call.

## Unmapped changes (hunks that map to no plan step)
All are planning or design artifacts, with no production or test code:
- `docs/plans/2026-10-02-onboarding-tour.md` (808 lines): the plan itself.
- `docs/plans/2026-10-02-onboarding-tour.state.md` (42 lines): orchestration state file.
- `docs/plans/2026-10-02-onboarding-tour.cross-review.md` (143 lines): cross-model review.
- `specs/2026-10-02-onboarding-tour.md` (420 lines): the spec.
- `specs/README.md` (+1 line): spec index entry.
- `specs/designs/onboarding-tour/tour-top.png` and `tour-run-and-reading.png`: design frames.
Implementation-side extras that are inside a step's files but beyond the plan's list, noted for completeness (not counted as unmapped): `OnboardingTourView/constants.ts` (`COPIED_RESET_MS`), extra client helper tests `diagramAllowed: header and 12-node cap` and `formatCost`, test-writer's extra view tests, and `onboarding.json` dropping the old keys `sections`, `sectionCount` and `regenerating`.

## Insight candidates
- Server `.it.test` files skip silently when the `docker info` probe in `server/test/helpers/pg.ts` (5 s timeout) runs under load. My first full run reported 128 skipped with Docker up. An idle re-run ran all 128. A green exit with every file skipped is not evidence.
- A "drops entries outside the list" test passes whether or not an explicit allow-list check exists, when the output is built by mapping over the deterministic list. The test only pins the structure.

## Delta pass at c20c73b
Range: ab9de07...c20c73b (head c20c73b). Working tree clean before and after (`git status --porcelain` empty).

### 1. Updated matrix rows
| AC | step | proving test | proving-code commit | verdict |
|---|---|---|---|---|
| AC-15 | 5,6,8,11,12 | V "index of 812 files, generated 2h ago; partial 5,000 of 12,450"; V "AC-15 subline index text only for full or partial" (2 cases: `unavailable` and `unsupported_languages`, expecting "generated 2h ago" and no "index of", "Generated from index of" or "partial index"); OT "self-reported full index with 5 of 7 supported files → partial 5 of 7" | a8f56c1, ab9de07, ee9af1e | met |
| AC-22 | 6,12 | H "buildSkeleton from fixed facts"; V "skeleton architecture shows stack and folder rows with counts" | a8f56c1, 5c40012 | met |
| AC-37 | 12 | V "overview sanitised, path as code"; V "overview renders no image and no external link, link text stays visible" | a8f56c1, 183697a | met |
| AC-38 | 11,12 | V "5-node diagram shown", "syntax error dropped, prose kept", "13 nodes dropped, prose kept"; `helpers.test.ts` "labeled edges do not count as nodes (both label forms)" and "13 distinct nodes with labels still rejected" | a8f56c1, 5c40012 | met |
| AC-40 | all | Demo evidence on disk, judged below | 0a8861b | partial |

- **AC-15:**
  - The spec text now matches the built behaviour: spec diff, commit 66982e4 (index text only for `full`/`partial`, age only for `unavailable`/`unsupported_languages`).
  - `TourHeader.tsx` is unchanged and already did that.
  - The two backfill cases pass. They sit in the 32 view tests that ran green.
  - The main session's mutant (dropping the `status === "full"` guard fails both cases) is recorded in the state file. I did not re-run it.
  - The `5 of 7` integration case passed in the integration run below.
- **AC-22:**
  - The CR-1 fix passes `items` through `TourSection.tsx:26` into `OverviewBody`. Stack chips render for title-only items. Path items render as a mono path plus the count text.
  - The new test asserts "TypeScript", "src/" and "40 files".
- **AC-37:**
  - `OverviewBody` no longer uses the vendored `Markdown`. It uses its own `ReactMarkdown` with `remarkGfm`, plus `a` rendering as `<span>` and `img` rendering as `<span>{alt}</span>`.
  - The old test still passes, and the new one covers inline, bare-autolink and reference-style images and links.
- **AC-38:** The CR-2 fix strips labeled edges (`A -- calls --> B`) before counting nodes. The test expects 10 where it previously got 12, and still rejects 13 distinct nodes.
- **AC-40:** `partial`.
  - **On disk, as required:**
    - `hono-api-log.txt`: `onboarding generation repo=honojs/hono model=openrouter/openai/gpt-4.1-mini llm_calls=1 tokens 2441/718 $0.0021 outcome=complete duration_ms=4521`. That is one generation line with the call count and the cost.
    - `hono-2-tour.png`: the "On this page" rail lists all five titles. The Architecture overview section is rendered with prose, file paths as code, and a diagram. The subline reads "1 LLM call · $0.0021 · openrouter/openai/gpt-4.1-mini / Generated from index of 423 files · generated just now".
    - `hono-3-run-and-reading.png`: How to run locally (pnpm install, build, test) and the Guided reading path, with its ordering line.
  - **Not on disk:** no screenshot shows the rendered Critical paths or First tasks sections, and I did not open `hono-1-empty-state.png`.
  - Two of the five sections therefore rest only on the state-file claim "five sections rendered". The log line and the other three sections are met.

### 2. Regression run at head c20c73b
| command | exit | result line |
|---|---|---|
| `pnpm --dir server exec vitest run .it.test`, first run | 0 | `18 passed, 1 skipped (19) / 121 passed, 7 skipped`. `agents-versions.it` skipped ("Docker not available"), the same docker-probe timeout flake as before; all onboarding files ran. Not counted as a pass. |
| `pnpm --dir server exec vitest run .it.test`, second run | 0 | `Test Files 19 passed (19) / Tests 128 passed (128)`, 0 skipped. This includes onboarding.it 15, onboarding-service.it 9, onboarding-review-isolation.it 1 and repo-intel-onboarding-reads.it 2. |
| server unit (wrapper) | 0 | `37 files / 365 tests passed`. Previously 362, plus the 3 new scanner tests. |
| client unit (wrapper) | 0 | `53 files / 313 tests passed`. Previously 307, plus the 6 new tests. |
| `pnpm --dir server typecheck` and `pnpm --dir client typecheck` | 0 | no errors |

No test or assertion was edited or removed since ab9de07: `--numstat` shows 0 deletions on `OnboardingTourView.test.tsx`, `helpers.test.ts` and `fs-clone-scanner.test.ts`. No previously `met` row regressed. The earlier AC-15 `partial` is now `met`.

### 3. Delta hunks mapped
| file | maps to |
|---|---|
| `specs/2026-10-02-onboarding-tour.md` (AC-15 text, Traceability filled, 2 changelog rows) | PV-1 / AC-15 (66982e4, c20c73b) |
| `OnboardingTourView.test.tsx` +59, `helpers.test.ts` +20 | ee9af1e (AC-15), CR-1, CR-2, SR-1 tests |
| `TourSection.tsx` (1 line), `OverviewBody.tsx`, `OverviewBody/styles.ts` | CR-1 (AC-22) and SR-1 (AC-37), step 12 |
| `OnboardingTourView/helpers.ts` (+1 line) | CR-2 (AC-38), step 11 |
| `fs-clone-scanner.ts`, `fs-clone-scanner.test.ts` | SR-2, step 5. The scanner serves AC-15, AC-21 and AC-36. |
| `docs/plans/...assets/` (3 PNGs and the log) | AC-40 (0a8861b) |
| `docs/plans/...state.md`, `docs/plans/...verify.md` | orchestration records, not implementation |
| `client/INSIGHTS.md`, `server/INSIGHTS.md`, `e2e/INSIGHTS.md` | K12 (engineering-insights, main session) |

Unmapped to a plan item or finding: none in code or tests. The plan has no step for the INSIGHTS files or the assets folder. These are documentation and evidence artifacts, as are the planning artifacts already listed in the main report.

Two things the plan does not name, noted as facts:
- `FsCloneScanner` gained an optional `maxWalkEntries` constructor argument (test-only), plus the 64 KB read cap and the 200,000 walk cap, as adapter-local constants. The `CloneScanOptions` port is unchanged.
- The SR-1 fix imports `react-markdown` and `remark-gfm` directly into the tour; both are already dependencies.

### 4. Rows that are NOT met (final list)
1. **AC-40: partial.** Log line, cost, and the Architecture, How to run and Reading path sections are shown on disk. Critical paths and First tasks are not shown in any saved screenshot.
2. **K2–K8 (reviewer checks):** the architecture-reviewer and security-reviewer have since reported (state file, reports-delta.md). The state file records lint:boundaries clean and route-adapter-calls 8 passed at ab9de07, and the AC-16 grep at 0 hits. I did not re-run those checks myself, so they stay unverifiable-by-assignment in my matrix.
3. **K9, K11, K12 (main session):** the state file has no result lines for `/code-review` (beyond CR-1 and CR-2, now closed), `pr-self-review` or `engineering-insights`; the INSIGHTS entries are in the delta. Unverifiable by me; main session owns them.
4. **PROC-1** is confirmed in the main report: no appended helper test is vacuous. Two guard-level mutations (the allow-list checks and the extra slices in `buildModelInput`) are not caught. **PROC-2** has no plan item depending on it. Neither is a plan-item failure.

Net: 0 not met, 1 partial (AC-40). Everything else I verified is met.

### Main-session follow-up on AC-40 (after the delta pass)
The delta pass marked AC-40 `partial` only because no saved screenshot showed Critical paths and First tasks. Both were captured from the same generated tour (same run, dev stack still up at c20c73b): `docs/plans/2026-10-02-onboarding-tour.assets/hono-4-critical-paths.png` (5 paths with reasons and Open) and `hono-5-first-tasks.png` (5 tasks, each with a real path, reason and Open). With the log line and screenshots 2–3, all five sections and the call count and cost are on disk. AC-40: **met**.
Architecture delta (ab9de07...c20c73b): pass, 0 findings; `lint:boundaries` clean, route-adapter-calls 8/8. Security delta (5c40012...183697a): SR-1 and SR-2 closed, no regressions.

**Final: 41/41 ACs met · 0 not met · 0 partial.** Known, accepted by Glib for the PR body: the reading-path label "Ordered by how many files depend on it" describes in-degree while the order is PageRank × (1 + hotness); folders with no supported files show "0 files".
