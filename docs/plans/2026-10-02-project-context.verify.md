# Plan Verification: Project Context

- Target: branch `feat/project-context` at HEAD `9cf429f`, worktree `/Users/Glebazzz/Claude/PROJECTS/NEO/dev-digest/.claude/worktrees/worktree-pr-changes-61aa24`
- Base: `origin/chore/implementation-planner`, diffed as `origin/chore/implementation-planner...HEAD` (95 files, +9359/-48)
- Date: 2026-10-02
- Plan: `docs/plans/2026-10-02-project-context.md` (Status: ready)
- Spec: `specs/2026-10-02-project-context.md` (Status: implemented)
- Ledger: `docs/plans/2026-10-02-project-context.state.md`
- **Overall: gaps.** Every gate that was runnable is green, and 40 of the 44 ACs are met. The gaps are:
  - one accepted deviation (PV-3: duplicate-path PUT answers 422, not 400);
  - one step placed differently from the plan (S11: nav group);
  - two ACs with an untested sub-behaviour (AC-36 cancelled run, AC-38 expand);
  - changes that map to no plan item (listed below).
- **Counts:** 33 met · 4 partial · 0 not met · 7 unverifiable (K-items with a named owner, plus one read-only limit) · 12 unmapped groups.
  - Items counted: 16 steps, 44 ACs, 6 contracts and 13 checks, so 79 items. Some ACs are met only in combination with their steps.
  - Contracts and ACs are tallied once each, with the S-rows they depend on.
- Red-first run history is out of scope for this pass, as instructed. `git status --porcelain` reads `?? docs/retro/` before and after my run (that entry was already there).

## Gates

All run from the worktree root. Test commands went through `.claude/sandbox/run-tests.sh`, except the integration suite.

| gate | command | exit | result line | verdict |
|---|---|---|---|---|
| server typecheck | `pnpm --dir server typecheck` | 0 | `tsc --noEmit -p tsconfig.json`, no diagnostics | met |
| server unit | `vitest run --exclude '**/*.it.test.ts'` | 0 | `Test Files 35 passed (35) · Tests 343 passed (343)` | met |
| server integration | `pnpm --dir server exec vitest run .it.test` (Docker up, sandbox off) | 0 | `Test Files 15 passed (15) · Tests 100 passed (100)`, none skipped | met |
| server `lint:boundaries` | `pnpm --dir server lint:boundaries` | denied by hook | not run here; owner is architecture-reviewer. The ledger has `no dependency violations (183 modules)` on the R3 tree and `0 violations` at `231440d+batch`, not at HEAD | unverifiable |
| client typecheck | `pnpm --dir client typecheck` | 0 | `tsc --noEmit`, no diagnostics | met |
| client tests | `pnpm --dir client test` | 0 | `Test Files 50 passed (50) · Tests 270 passed (270)` | met |
| reviewer-core typecheck | `npm --prefix reviewer-core run typecheck` | 0 | no diagnostics | met |
| reviewer-core tests | `npm --prefix reviewer-core test` | 0 | `Test Files 6 passed (6) · Tests 64 passed (64)`; `prompt-project-context.test.ts` has 7 tests, as the plan expects | met |
| route adapter calls | `vitest run test/route-adapter-calls.test.ts` (run incidentally with other files) | 0 | 8 passed; `test/route-adapter-calls.test.ts` has no hunk in the diff, so `GRANDFATHERED` is untouched | informational (owner: architecture-reviewer) |
| shared mirror | `diff -rq server/src/vendor/shared client/src/vendor/shared` | 1 (files differ) | 5 differing files, all pre-existing drift: `adapters.ts`, `contracts/trace.ts`, `eval-ci.ts`, `knowledge.ts`, `productionize.ts` | met |

On the shared mirror:
- I diffed `adapters.ts` and `trace.ts` directly. The differences are the older `sessionId`, `commitFiles` and `sync` members, and comment wording.
- None of them is in the Project Context hunks.
- `platform.ts` is identical in both copies.

## Steps

| item | verdict | evidence |
|---|---|---|
| S1 contracts and `RepoDocs` port | met | `server/src/vendor/shared/{contracts/platform.ts,contracts/trace.ts,adapters.ts}` carry every listed schema and the `RepoDocs`/`RepoDocEntry` port, with the same hunks (+96/+20/+15) in the client mirror. Typechecks exit 0 and `diff -rq` shows only pre-existing drift. |
| S2 attachment tables | met | `server/src/db/schema/project-context.ts:10-32` has both tables, with cascade FKs and composite primary keys. Migration `0014_youthful_steve_rogers.sql:15-16` has `ON DELETE cascade`. `schema.ts` exports the tables, and the journal and snapshot are generated. |
| S3 client hooks | met | `client/src/lib/hooks/project-context.ts` has `useContextDoc`, `useAgentContext`, `useSetAgentContext`, `useSkillContext` and `useSetSkillContext`. The query keys and invalidations match the plan. `core.ts:126` types `useContextFiles` as `ContextDocList`. |
| S4 reviewer-core rendering | met | `reviewer-core/src/prompt.ts` has `renderProjectContextBlock`, `PromptSpec`, `RenderedProjectContext`, `neutraliseUntrusted`, `PROJECT_CONTEXT_RULES` and `PROJECT_CONTEXT_REMINDER`. `index.ts` exports the three public names. `run.ts` retypes `specs`. reviewer-core 64 passed; `prompt-structured` and `prompt-callers` pass in the server unit run. |
| S5 `FsRepoDocs`, double, container | met | `fs-repo-docs.ts:50-125` uses `lstat`, never descends into symlinked or excluded directories, and checks `realpath` containment. `mocks.ts` has `MockRepoDocs {files, failures}`. `container.ts` has `ContainerOverrides.repoDocs` and `get repoDocs()`. Integration: "AC-3: does not follow directory symlinks" passes. The adapter also applies a hidden-file rule and a realpath-target rule beyond the plan's wording (ledger CR-1, SR-3, closed). |
| S6 pure helpers | met | `helpers.ts:8-49` has `categorizeDocPath` and `buildEffectiveDocList`. `project-context-helpers.test.ts` passes 7 tests, including `[a,b]+[b,c]+[d,a] -> [a,b,c,d]` and "keeps the agent origin". |
| S7 repository | met | `repository.ts:53-61` deletes then inserts in one transaction, with order = index. `:86-116` `enabledSkillDocs` filters on `skills.enabled` and the workspace predicates, ordered by `agent_skills.order` then doc order. `:119-145` `usedByCounts` uses raw `sql<number>` distinct counts. |
| S8 service and wiring | met | `service.ts:70-232` has all eight methods. `resolveForRun` never throws. Statuses and log strings match the plan (`:199`, `:215`, `:221`, `:225`). `wiring.ts` builds the service from the container. `project-context-service.test.ts` has 12 tests passing, including "marks a path in changedPaths modified_by_pr and keeps its base text". It counts tokens with `container.boundedTokenizer`, not `container.tokenizer` as the plan states: a user-approved ceiling (ledger SR-1/PV-5, ADR token-estimate-ceiling, state log line "Glib: ceiling on counting only"). |
| S9 routes and registration | partial | `routes.ts:32-96` has all seven routes, each with a response schema. `POST .../reindex` has `rateLimit {max: 10, timeWindow: '1 minute'}`. The routes make no adapter call: they only parse, call the service and return. `modules/index.ts` registers `projectContext`. The "rejects duplicate paths" test asserts **422** (`project-context.it.test.ts:321`), where the plan's Review focus and step 9 say 400. **Accepted deviation PV-3.** "Attachments are workspace-scoped" returns 404 as planned. |
| S10 run-time injection and trace | met | `run-executor.ts:272-299` resolves, renders, overwrites each snapshot's `text` and `tokens` from `rendered.docs`, and sets `specsTokens` and `specsRead`. `:313` passes `specs` only when non-empty. The success trace sets `specs_tokens`, `specs_read` and `specs_docs` (`:403-413`). The catch path passes all four values to `traceFromBuffer` (`:444-456`). `ProjectContextResolver` is declared in `run-executor.ts`, wired in `reviews/service.ts` and `reviews/routes.ts`. Token counts use `boundedTokenizer` (ledger SR-1, user-approved). `project-context-run.it.test.ts` has 10 tests passing, including the plan's two test-first cases ("uncloned repo", "traversal path is not_found"). |
| S11 sidebar item | partial | `nav.ts` adds `{ key: "context", label: "Project Context", icon: "Folder", href: "/repos/:repoId/context" }` with no `gKey`. The plan says to add it to the **SKILLS LAB** group. It sits in **WORKSPACE** (ledger MS-1, aligned to design-1/2, closed R1). `ProjectContextNav.test.tsx` asserts the link, the href, the WORKSPACE group and the active marker, and passes. |
| S12 Project Context page | met | `ProjectContextView.tsx`, `helpers.ts`, `DocTree` and `DocPreview` exist. `context.json` is rewritten. `helpers.test.ts` passes ("groups three docs into two folders"). The footer shows the file count, "≈ N tokens total" and the scan time (`ProjectContextView.tsx:63-72`). |
| S13 shared doc list | met | `components/context-doc-list/{ContextDocList.tsx,helpers.ts,index.ts,styles.ts}` and `DocPreviewModal` exist. 13 helper tests and 10 component tests pass, including "keyboard reorder moves a row". |
| S14 agent Context tab | met | `constants.ts` adds the `context` tab. `AgentEditor.tsx` renders `ContextTab`. `agents/[id]/page.tsx` adds `"context"` to `VALID_TABS`, which the plan missed (see Unmapped). The agent `ContextTab.test.tsx` has 11 tests passing. |
| S15 skill Context tab | met | `SkillDetailView.tsx` adds `"context"` to `TABS` and renders `ContextTab`. The skill `ContextTab.test.tsx` has 6 tests passing. |
| S16 trace row and label | met | `TraceBody.tsx` renders `SpecsReadRow` and passes `specs_tokens` to the specs `PromptBlock`. `runs.json` has `trace.prompt.specs` = "Project context — attached specs (untrusted)" and `specStatus.*`. `SpecsReadRow` has 6 tests and `RunTraceDrawer` has 5 tests, all passing. |

## Acceptance criteria

Test files are named in short form. Server ones live in `server/test/`; client ones next to their component.

| item | verdict | evidence |
|---|---|---|
| AC-1 | met | `project-context.it.test.ts` "AC-1: lists exactly the four non-excluded docs with size, category and tokens". Passes in the integration run. |
| AC-2 | met | `project-context-helpers.test.ts` `categorizeDocPath` group, 4 cases, passes. |
| AC-3 | met | Integration: "does not follow directory symlinks" and "leaves out a .md symlink that resolves outside the clone" (the file route also answers 404). A further case covers `notes.md -> .git/config`. |
| AC-4 | met | Integration: "AC-4: serves a listed doc and answers 404 for traversal and non-listed paths". The service unit test "readDoc refuses a path outside the scan before reading it" covers "reads no file". |
| AC-5 | met | Integration: "AC-5: rescans the clone as it is on disk, without any git call". It asserts `git.cloned`, `git.syncs` and the `fetchPullHead` spy are all empty or zero. See Open items: the page's Refresh button renders only when the list is non-empty. |
| AC-5a | met | `ProjectContextView.test.tsx` "AC-5a" asserts "scanned 10:00". The code renders `scanned_at` (`ProjectContextView.tsx:69-71`). `useReindexContext` invalidates `["context", repoId]` (`core.ts`). The service unit "rescan … refreshes the cache" covers the new scan time. |
| AC-6 | met | "AC-6" test: 2 folders, 3 files, "3 files", "≈ 600 tokens total". |
| AC-7 | met | "AC-7" test: the Markdown heading renders on selection. |
| AC-8 | met | "AC-8" test: no `script`, `img` or `[onerror]`, and no `javascript:` href. |
| AC-9 | met | Integration "AC-9 / AC-41" asserts `{agents: 2, skills: 1}`. The UI test asserts "Used by 3 agents · 1 skills". |
| AC-10 | met | "AC-10" test: no edit, new, folder, upload or delete button, and no file input. |
| AC-11 | met | Agent `ContextTab.test.tsx`: 7 checkboxes, 1 checked, "1 of 7 attached", 7 Preview buttons. |
| AC-12 | met | Integration "AC-12: an agent keeps the attached order across a reload" (PUT, GET, reorder, GET). The client test asserts a toggle saves the full ordered paths. Keyboard drag is covered in the `ContextDocList` test, but not wired end to end in the tab test. |
| AC-13 | met | `helpers.test.ts` "filterDocs > matches the path case-insensitively" and the agent tab's filter test. |
| AC-14 | met | `helpers.test.ts` "contextTotals > dedups by path (own wins)". The agent tab test shows "≈ 180 tokens" and "inherited ≈ 30". |
| AC-15 | met | Agent tab test: shows "inherited from pr-quality-rubric", and a click does not call save. The component test shows the checkbox disabled. |
| AC-16 | met | Agent tab test: shows "not in this repo" with "≈ 0 tokens", and the total excludes it. |
| AC-17 | met | `it.each` over `map-reduce`, `auto` and `single-pass`: the note shows only for the first two. |
| AC-18 | met | Integration "AC-18" covers skill order across reload, `serialized` and agent inheritance. The skill tab test shows "3 attached". |
| AC-19 | met | Skill tab test: "≈ 100 tokens" with one missing doc excluded. |
| AC-20 | met | Skill tab test asserts the `<pre>` text equals the server `serialized` string, starting with `## Project context`. Integration "AC-18" asserts the server string contains `## Project context` and the doc text. The string comes from `renderProjectContextBlock` (`service.ts:166-169`). |
| AC-21 | met | Helpers test `[a,b]+[b,c]+[d,a] -> [a,b,c,d], first occurrence wins`. |
| AC-22 | met | Run integration "AC-22: a disabled skill contributes no docs". |
| AC-23 | met | Run integration "AC-23": `KNOWN-CONTENT-123` reaches the mock LLM prompt. |
| AC-24 | met | Run integration "AC-24": status `done`, log line `project context: specs/gone.md not found`, snapshot `not_found`. |
| AC-25 | met | Run integration "AC-25": `unreadable`, the log carries the path and `EIO boom`, run `done`. |
| AC-26 | met | Run integration "AC-26": base text in the prompt, `modified_by_pr`, log "modified by this PR", `specs_read` includes the path. |
| AC-27 | met | reviewer-core "empty specs → byte-identical prompt", plus run integration "uncloned repo" (prompt has no "Project context"). |
| AC-28 | met | "section order: heading, framing, blocks, reminder" passes. |
| AC-29 | met | "framing has the three statements" passes (regexes for requirements, check the diff against, instruction, data, severity, verdict, waive). |
| AC-30 | met | "reminder is the last text of the section" passes. |
| AC-31 | met | "hostile path flattened inside block, fixed label": first line `a/b" ## Diff to review c.md`, label `spec-0`. |
| AC-32 | met | "closing delimiter neutralised in any case" passes. |
| AC-33 | met | Run integration "AC-33": `['specs/a.md','specs/b.md']`, skipping the missing one. |
| AC-34 | met | Run integration "AC-34/35": origin `agent` and `skill`, `skill_name`, snapshot `text` equals the injected text, `tokens > 0`. |
| AC-35 | met | Same test: `specs_tokens === TiktokenTokenizer().count(trace.prompt_assembly.specs)`. |
| AC-36 | partial | Run integration "AC-36" covers a **failed** run: section, `specs_read`, snapshot and `specs_tokens` are kept. **Missing:** no test cancels a run. The cancelled path shares the same catch block (`run-executor.ts:426-458`, `RunCancelledError`), but no assertion exercises it. |
| AC-37 | met | `SpecsReadRow.test.tsx` "AC-37": the labels "not found", "unreadable" and "modified by PR" render as text. |
| AC-38 | partial | "AC-38" asserts the exact text and "120 tokens", and the copy test asserts `writeText("Alpha body")`. The expand/collapse control exists (`SpecsReadRow.tsx:87-89`) but **no test asserts it**. |
| AC-39 | met | "AC-39": a trace without `specs_docs` shows the `specs_read` path and "—", no button. "shows none" covers the empty list. |
| AC-40 | met | `RunTraceDrawer.test.tsx` "AC-40": the label "Project context — attached specs (untrusted)" with "321 tokens". |
| AC-41 | met | Integration "AC-9 / AC-41": after deleting the agents and the skill, `used_by` is `{0,0}`. The cascade is in the SQL (`0014…sql:15-16`). The test deletes through the DB, not an agent-delete route. |
| AC-42 | met | Judged from the main session's browser evidence, which I did not re-run. State row "AC-42 browser": run `70b1dfb6` done, `specs_read` 2 paths, `specs_tokens` 3019. I viewed three of the five screenshots in `docs/plans/2026-10-02-project-context.assets/`: `ac42-02` (agent Context tab, "2 of 13 attached"), `ac42-03` (trace "Specs read" with both paths marked "injected") and `ac42-04` (a doc opened, "1,226 tokens", full text, "collapse"). Not opened: `ac42-01` and `ac42-05`. The row's sha is `6476dac` and the screenshots show the post-batch UI ("≈ tokens"), so they were re-shot later. |
| AC-43 | met | `ProjectContextNav.test.tsx`: the link `/repos/r1/context`, the active marker (`fontWeight` 600) on `/context`. |

## Contracts and data

| item | verdict | evidence |
|---|---|---|
| C1 `platform.ts` contracts | met | `ContextDocCategory`, `ContextUsedBy`, extended `SpecFile`, `ContextDocList`, `ContextDocContent`, `ContextDocQuery`, `ContextRepoQuery`, `ContextAttachment`, `InheritedContextDoc`, `AgentContext`, `SkillContext` and `ContextAttachmentsInput` exist with same-name types. The unique-path refine carries the message "duplicate path". Identical in the client copy (`diff -rq` does not list `platform.ts`). |
| C2 `trace.ts` contracts | met | `PromptAssembly.specs_tokens`, `SpecDocStatus`, `SpecDocOrigin`, `SpecDocSnapshot` and `RunTrace.specs_docs` are all `.nullish()` where the plan says so. They are mirrored in the client; the only `trace.ts` difference left is pre-existing comment drift. |
| C3 `adapters.ts` | met | `RepoDocEntry` and `RepoDocs` exist in both copies. The JSDoc describes the exclusions in words, not as a glob. |
| C4 migration | met | `0014_youthful_steve_rogers.sql` is generated (journal and `meta/0014_snapshot.json` present). It creates both tables with cascade FKs. The integration suite migrates fresh containers and passes. |
| C5 i18n | met | `client/messages/en/{context,agents,skills,runs}.json` are in the diff. The tests load those namespaces and match the strings. |
| C6 seed | met | No change to `seed.ts` or `e2e.sh`. The plan says none. |

## Checks assigned by the plan

| item | command | exit | result line | verdict |
|---|---|---|---|---|
| K1 plan-verifier: AC-1..41, 43 and the integration suite | `vitest run .it.test` | 0 | 15 files, 100 passed, none skipped (includes `project-context.it.test.ts` 23, `project-context-run.it.test.ts` 10, `reviews.it.test.ts` 10) | met |
| K2 architecture-reviewer: `lint:boundaries` | none (denied) | n/a | owner: architecture-reviewer | unverifiable |
| K3 architecture-reviewer: onion-architecture step 9 report | none | n/a | owner: architecture-reviewer | unverifiable |
| K4 architecture-reviewer: `route-adapter-calls` test | `vitest run test/route-adapter-calls.test.ts` | 0 | 8 passed (informational) | unverifiable (owner: architecture-reviewer) |
| K5 architecture-reviewer: placement of `components/context-doc-list` and the single `nav.ts` exception | none | n/a | owner: architecture-reviewer | unverifiable |
| K6 security-reviewer: the security review of the diff | none | n/a | owner: security-reviewer | unverifiable |
| K7 main session: `/code-review` | none | n/a | state log records 4 issues (CR-1..4); CR-1, CR-3, CR-4 closed, CR-2 accepted | unverifiable (owner: main session) |
| K8 main session: AC-42 browser check | none | n/a | see AC-42 | met (see AC-42) |
| K9 main session: `pr-self-review` | none | n/a | state log: "ready (0 critical/major)" | unverifiable (owner: main session) |
| K10 main session: `engineering-insights` for server, reviewer-core, client | none | n/a | diff has `server/INSIGHTS.md` (+6) and `client/INSIGHTS.md` (+2); no `reviewer-core/INSIGHTS.md` hunk | unverifiable (owner: main session) |
| K11 implementer, per lane: lane checks | the lane commands, via the gates above | 0 | all green at HEAD | met |
| K12 main session, after each DAG level: server, reviewer-core and client gate | the three package gates | 0 | all green at HEAD | met |
| K13 read-only limit: the sandbox-off integration run | `vitest run .it.test` | 0 | `git status --porcelain` unchanged | met |

## Accepted deviations (user-accepted, still deviations from the plan text)

- **PV-3.** A duplicate or invalid path in a PUT body answers 422, not 400, because of the app-wide zod mapping. Evidence: `project-context.it.test.ts:321` and `:330`. Affects S9 and the Review-focus bullet.
- **SR-2.** The prompt size is uncapped (Q8: display-only). The tokenizing half was fixed under SR-1. Affects S10 and the plan's Risks section.
- **CR-2.** The per-repo scan cache is not invalidated on repo sync. It is replaced only by Refresh or a restart, per R55. Evidence: `service.ts:254-268`.
- **Residual SR-4 (minor).** An adversarial 255 KB doc of 256-character runs costs about 3.4 s once per scan (ledger measurement).

## Unmapped changes

Changes that map to no plan step, AC or contract:

- `server/src/adapters/tokenizer/index.ts:24-55`, `server/src/platform/container.ts` (`boundedTokenizer`, +24-line hunk) and `server/test/project-context-tokenizer.test.ts`. A byte ceiling and a run-length guard for token counting. Ledger PV-5, SR-1, SR-4 and the ADR, not the plan.
- `server/src/vendor/shared/contracts/platform.ts` (the `DOC_EXCLUDED_SEGMENTS` set, `isServableDocPath`, and the per-path `.refine` in `ContextAttachmentsInput`), and the same hunk in `client/src/vendor/shared/contracts/platform.ts`. PUT paths are validated as servable. The user-requested batch of 2026-10-02, state log, last line.
- `server/test/project-context-fs-docs.test.ts`. Unit tests for the hidden-file and unreadable-directory rules (CR-1, CR-3). The plan lists no such file.
- `client/src/app/agents/[id]/page.tsx:17` and `client/src/app/agents/[id]/page.test.tsx`. `"context"` added to `VALID_TABS`. The plan did not list the file; the main session granted it (state log, L1).
- `client/src/components/context-doc-list/ContextDocList.test.tsx` cases for checkbox names, disabled inherited rows, token units and the `title` on long paths (ledger MS-3, MS-4). They go beyond the plan's single test-first case.
- `server/src/modules/project-context/service.ts:115-133`. De-duplication of the inherited list (ledger CR-4). The plan's S8 does not mention it, though AC-14 requires "each path counted once".
- `client/INSIGHTS.md` and `server/INSIGHTS.md`. Entries from the plan's main-session `engineering-insights` task, not code.
- `docs/plans/2026-10-02-project-context.md` and `docs/plans/2026-10-02-project-context.state.md`. The plan and its run state.
- `specs/2026-10-02-project-context.md` and `specs/README.md`. The spec and its index line. `specs/README.md` still says "Status: draft" while the spec file says "implemented".
- `docs/plans/2026-10-02-project-context.assets/ac42-0{1..5}-*.png`. Screenshots that serve AC-42.

Not unmapped: `RunTraceDrawer/styles.ts` (+29) maps to S16, and `DocPreviewModal` maps to S13.

## Open items

- AC-36: no test cancels a run, so only the failed-run half has an assertion.
- AC-38: the expand control has no test.
- S11 and ledger MS-1: the nav item is in WORKSPACE, where the plan text says SKILLS LAB.
- PV-3, SR-2, CR-2 and residual SR-4: accepted deviations, listed above.
- `lint:boundaries`, the onion step-9 report, security review, `/code-review` and `pr-self-review` were not run by me. Their owners are in the Checks table.
- The page's Refresh button renders only when the doc list is non-empty (`ProjectContextView.tsx:42-60`). In the empty-state and not-cloned views there is no Refresh control.
- `buildProjectContextService` is called in two places (`project-context/routes.ts:30` and `reviews/routes.ts`), giving two service instances with separate scan caches. The run resolver reads from the clone directly and does not use the cache.
- No `reviewer-core/INSIGHTS.md` entry is in the diff, though the plan names reviewer-core for the insights step.

## Delta re-verification

- **Target:** HEAD `01eee54` on `feat/project-context`.
- **Delta:** `git diff 5471c4e..HEAD`, which is bb675cd, 749c035 and 01eee54. It changes 6 files (+62/-5).
- **Date:** 2026-10-02.

### Gates

| gate | command | exit | result line |
|---|---|---|---|
| server typecheck | `pnpm --dir server typecheck` | 0 | `tsc --noEmit -p tsconfig.json`, no diagnostics |
| client typecheck | `pnpm --dir client typecheck` | 0 | `tsc --noEmit`, no diagnostics |
| server unit | `.claude/sandbox/run-tests.sh pnpm --dir server exec vitest run --exclude '**/*.it.test.ts'` | 0 | `Test Files 35 passed (35) · Tests 343 passed (343)` |
| server integration | `pnpm --dir server exec vitest run .it.test` (Docker up, sandbox off) | 0 | `Test Files 15 passed (15) · Tests 101 passed (101)`. `project-context-run.it.test.ts` shows `(11 tests)`, and both AC-36 tests are listed as passed. |
| client tests | `.claude/sandbox/run-tests.sh pnpm --dir client test` | 0 | `Test Files 50 passed (50) · Tests 271 passed (271)`. `SpecsReadRow.test.tsx` shows `(7 tests)`. |

- **Targeted integration run:** the hook refused a targeted `vitest run test/project-context-run.it.test.ts` outside the wrapper. Through the wrapper the file reported `11 skipped`, because Docker is not available there. The full `.it.test` run above is the evidence for that file.
- **Compared with 9cf429f:** the integration count is 100 → 101 (the new AC-36 test) and the client count is 270 → 271 (the new AC-38 test). The server unit count is unchanged.

### Verdicts

| item | verdict | evidence |
|---|---|---|
| AC-36 (failed or cancelled run keeps section, `specs_read`, snapshot, `specs_tokens`) | met | **Failed half:** the existing test "AC-36: a failed run keeps…" passes in the integration run above. **Cancelled half:** the new test "AC-36: a cancelled run keeps the section, specs_read, snapshots and specs_tokens" (`server/test/project-context-run.it.test.ts`, hunk `@@ -305,+318`, test at about line 321) passes in the same run (376 ms). The test does the following. 1. It starts the run through the real route `POST /pulls/:id/review` and takes `runs[0].run_id`. 2. It cancels through the real route `POST /runs/${runId}/cancel` and asserts `statusCode` 200. A `GatedRepoDocs` holds `read()` until `release()`, so the cancel lands before the first checkpoint. 3. It reads the `agentRuns` row and asserts `status === 'cancelled'`. 4. It asserts `llm.calls` has length 0. 5. It asserts `trace.specs_read` equals `['specs/a.md']`. 6. It asserts `specs_docs` holds one `injected` entry with text `A-DOC`. 7. It asserts `prompt_assembly.specs` contains `A-DOC`. 8. It asserts `prompt_assembly.specs_tokens` is above 0. |
| AC-38 (copy and expand) | met | The previous report noted that copy was covered by `writeText("Alpha body")` and expand was not tested. The new test "AC-38: expand lifts the height cap on the sent text, collapse restores it, a new doc opens collapsed" (`SpecsReadRow.test.tsx`, hunk `@@ -57,+57`, test at about line 60) passes in the client run. It asserts `maxHeight` `"160px"` when collapsed, `""` after the "expand" click, and `"160px"` after the "collapse" click. It then opens `specs/d.md` while expanded and asserts the text shows "Delta body", `maxHeight` is back to `"160px"`, and the button reads "expand" again. It matches the implementation: `SpecsReadRow.tsx:87-92` toggles `expanded` and sets `{ ...s.specPre, maxHeight: 160 }` when not expanded. Text-and-tokens and copy are covered by the existing tests, which still pass. |
| `specs/README.md` status line | met | The hunk at `specs/README.md:47` changes `Status: draft` to `Status: implemented`. It now matches the spec file's own status, which the previous report recorded as `implemented`. |

On the red-first claim in the spec row ("red on the cancel-flag bug"): I did not re-run the test against the pre-fix `sse.ts`. The evidence I have is the green run at HEAD and the `sse.ts` hunk (`server/src/platform/sse.ts:75-84`). A red-first check on the original `sse.ts` is not part of this delta pass.

### Hunk map

| hunk | maps to |
|---|---|
| `server/src/platform/sse.ts:75-84` (`RunBus.complete` no longer calls `this.cancelled.delete(runId)`, and the doc comment is updated) | **Unmapped.** `platform/sse.ts` is not in the plan's step list (S1 to S16) or its expected files. It serves AC-36: `cancelRun` calls `complete()` right after setting the cancel flag, so the cleared flag meant the runner never saw a cancel. The new AC-36 test depends on this change. |
| `server/test/project-context-run.it.test.ts` (the `eq` import, the `GatedRepoDocs` class and the cancelled-run test) | Previous open item "AC-36: no test cancels a run". Plan S10 and AC-36. |
| `client/.../SpecsReadRow/SpecsReadRow.test.tsx` (new AC-38 test) | Previous open item "AC-38: the expand control has no test". Plan S16 and AC-38. |
| `specs/2026-10-02-project-context.md` (AC-36 and AC-38 rows of the proof table, lines 331-333) | Spec traceability table. It records the two new tests and points the cancelled and expand cells at "this PR". It belongs to the already-listed unmapped group `specs/…project-context.md` and `specs/README.md`. |
| `specs/README.md:47` | Previous open item (the status line the previous report flagged). Resolved. |
| `server/INSIGHTS.md` (+2 entries, Codebase Patterns and Session Notes) | Plan K10 (`engineering-insights` for server). It is documentation, not code. |

The delta has one unmapped code hunk: `sse.ts`. The rest map to plan items or to previous open items.

### Updated counts

- **Overall: gaps.** Two of the previous four partials are now met: AC-36 and AC-38. S9 (PV-3, an accepted deviation) and S11 (nav group in WORKSPACE, not SKILLS LAB) remain partial. The unmapped list also remains.
- **Counts:** 35 met · 2 partial · 0 not met · 7 unverifiable · 13 unmapped groups.
  - Previously 33 met · 4 partial · 0 not met · 7 unverifiable · 12 unmapped groups.
  - The unmapped total is the previous 12 plus the `sse.ts` hunk.
- **Previous open items closed by this delta:** AC-36 (no cancel test), AC-38 (no expand test) and the `specs/README.md` status line.
- **Previous open items still open:**
  - S11 and ledger MS-1 (nav item in WORKSPACE, not SKILLS LAB).
  - Accepted deviations PV-3, SR-2, CR-2 and residual SR-4.
  - The Refresh button renders only when the doc list is non-empty (`ProjectContextView.tsx:42-60`).
  - `buildProjectContextService` is called in two places, so there are two service instances with separate scan caches.
  - No `reviewer-core/INSIGHTS.md` entry.
  - `lint:boundaries`, the onion step-9 report, security review, `/code-review` and `pr-self-review` stay with their named owners.

### Main-session note on the red-first claim

Before the `sse.ts` fix, the new cancelled-run test ran against the original `RunBus.complete` and failed: `AssertionError: expected 'done' to be 'cancelled'` (`pnpm exec vitest run test/project-context-run.it.test.ts`, 1 failed | 10 passed). After bb675cd it passes. The AC-38 test was a backfill. With the expand toggle forced off (`style={false ? s.specPre : …}`), it failed (1 failed | 6 passed), and the component was restored afterwards. At HEAD, `pnpm lint:boundaries` reports `no dependency violations found (183 modules, 624 dependencies cruised)`.
