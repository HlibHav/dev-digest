# Development Plan: Blast Radius (homework L04)
Status: ready

## Goal
A reviewer opening a PR in DevDigest sees what else in the repo the change can break: the changed symbols, the code that calls them (`file:line`, one click to that exact line on GitHub) and the HTTP endpoints and cron jobs those callers sit behind. All of it is read from the repo-intel index that already exists, with no model call and no re-parse. When the index is incomplete, the page says so, gives the reason and offers a Resync. An agent in Claude Code gets the same map from the `devdigest_get_blast_radius` MCP tool, which replaces the hw4 stub.

## Acceptance criteria
Every count below follows **Count rules** (Contracts & data), which are shared by the server `summary`, the UI stat row and the MCP output.

**P1**
1. [P1] The Overview tab renders a "Blast radius" block for the PR, fed by `GET /pulls/:id/blast`, placed next to the Intent card. Proof: red-first unit `OverviewTab.test.tsx` › "renders the Blast radius block from GET /pulls/:id/blast". The side-by-side layout is checked in the browser (main session).
2. [P1] The summary row shows four counts (changed symbols, callers, endpoints, crons) using the `stat.*` labels. Proof: red-first unit `BlastRadiusCard/helpers.test.ts` › "blastStats counts per the count rules" and `BlastRadiusCard.test.tsx` › "summary row shows the four counts".
3. [P1] Under each changed symbol that has callers, the tree lists every caller as `file:line`. Below the callers come that symbol's endpoint chips. Proof: red-first unit `BlastTree.test.tsx` › "lists callers as file:line and the symbol's endpoints below them".
4. [P1] The server turns the facade's flat `callers` into `downstream`. There is one group per `viaSymbol`. Each group's `endpoints_affected` and `crons_affected` are the union, without duplicates, of `factsByFile[caller.file]` over the callers kept in that group, in first-seen caller order. When `factsByFile` is absent (fallback path), both are `[]`. Proof: red-first unit `server/test/blast-helpers.test.ts` › "groups flat callers by viaSymbol", "attributes endpoints and crons from factsByFile, deduplicated", "no factsByFile gives empty endpoints and crons".
5. [P1] On the test PR #27 of `HlibHav/dev-digest` (id `509f8039-0250-4bfa-ab54-b88dac0a20dc`), the `rowsToSettings` group has at least 2 callers in at least 2 distinct files and at least 1 HTTP endpoint, and the page shows them. The facade dedups callers per `file|enclosing|symbol` (`server/src/modules/repo-intel/service.ts:361`), so `settings/routes.ts:34` and `:65` may collapse into one caller. Proof: red-first integration `server/test/blast.it.test.ts` › "maps a PR #27-shaped index result: ≥2 callers in ≥2 files, ≥1 endpoint". Live check (main session): `curl :3201/pulls/509f…/blast` plus a browser screenshot.
6. [P1] Each caller `file:line` is an anchor to `https://github.com/<owner>/<repo>/blob/<sha>/<file>#L<line>` that opens in a new tab. `<sha>` is the index's `lastIndexedSha`, or the PR `head_sha` when that is empty. With neither SHA, or with no `repoFullName`, the caller renders as plain text. Proof: red-first unit `BlastTree.test.tsx` › "caller link points at exactly that line", `helpers.test.ts` › "pickLinkSha prefers lastIndexedSha, falls back to headSha, else null", `OverviewTab.test.tsx` › "link sha comes from GET /repos/:id/index-state, falls back to head_sha". Live check (main session): click a caller on #27 and confirm GitHub opens on that line.
7. [P1] With no callers (`downstream` empty), the card shows `noDownstream` with the changed-symbol count and renders no tree and no graph. Proof: red-first unit `BlastRadiusCard.test.tsx` › "no callers shows the noDownstream text".
8. [P1] With `degraded: true`, the card shows a separate "Incomplete index" mark with the reason text for that `reason` (all five values), above the map or the empty text. Proof: red-first unit `IndexNotice.test.tsx` › "shows the reason text for each reason" and `BlastRadiusCard.test.tsx` › "degraded result shows the notice above the map". Live check (main session): seeded `acme/payments-api` #482 shows `no_data`.
9. [P1] The MCP tool `devdigest_get_blast_radius` resolves repo → PR, calls `GET /pulls/:id/blast` once and returns the same map as the page, up to the MCP caps: `downstream` with symbol, callers (`name`, `file`, `line`), endpoints and crons in server order, plus `summary`, `degraded` and `reason`. Proof: red-first unit `mcp-server/test/get-blast-radius.test.ts` › "returns the API's map unchanged in content and order". Live check (main session): a Claude Code call with `DEVDIGEST_API_URL=http://localhost:3201` on #27, compared with the UI.

**P2**

10. [P2] Each request reads the index that is already built. The service makes exactly one `blast` call and one `indexStatus` call, its ports expose no indexing method, and it logs `blast: read repo-intel index` once with `{prId, repoId, source, degraded, reason, symbols, callers}`. `source` is `index` when the facade result is not degraded and `fallback` otherwise. Proof: red-first unit `server/test/blast-service.test.ts` › "one facade read, one index-state read, one log line with source index". Live check (main session) on #27: the API log has that line with `source: "index"` and no index or resync job line.
11. [P2] The route declares `schema.response[200] = BlastRadius`. A good body parses with `BlastRadius.parse`. A body that breaks the contract (a caller `line` of `1.5` from a fake facade) returns 500 `internal_error` instead of leaking the body. Proof: red-first integration `blast.it.test.ts` › "200 body parses as BlastRadius" and "a non-contract body is refused with 500".
12. [P2] The main path has no LLM and no indexer. No file under `server/src/modules/blast/` mentions `llm`, `resolveFeatureModel`, `indexRepo`, `refreshIndex` or `codeIndex`. Proof: red-first unit `server/test/blast-static.test.ts` › "blast module calls no LLM and no indexer".
13. [P2] A caller whose file declares a symbol of that name (any entry in `changedSymbols`) never appears among that symbol's callers. Proof: red-first unit `blast-helpers.test.ts` › "drops callers in the symbol's own declaring file".
14. [P2] The per-symbol caller cap is a parameter of the mapper. `blast/wiring.ts` supplies it from `MAX_CALLERS_PER_SYMBOL` in `repo-intel/constants.ts`. No numeric cap is written in `blast/helpers.ts`, `blast/service.ts` or any client component. Proof: red-first unit `blast-helpers.test.ts` › "caps callers per symbol at the limit passed in" and `blast-static.test.ts` › "wiring takes the cap from repo-intel constants". architecture-reviewer confirms with `lint:boundaries`.
15. [P2] `degraded` and `reason` pass through. If the facade result is degraded, the output is `degraded: true` with the facade's reason (`no_data` when it gives none). If the facade is not degraded and the index status is `partial`, the output is `degraded: true, reason: 'index_partial'`. Otherwise it is `degraded: false, reason: null`. The UI shows the result (AC8). Proof: red-first unit `blast-helpers.test.ts` › "degraded/reason pass-through, partial → index_partial, full → clean". Red-first integration `blast.it.test.ts` › "degraded fields reach the response".
16. [P2] The shared contract changes. `BlastRadius` gains `degraded: boolean.nullish()` and `reason: BlastDegradedReason.nullish()`. `BlastCaller` gains `rank: number.nullish()`. `BlastDegradedReason` is a zod enum of the five literals. A legacy payload without the new fields still parses, and an unknown `reason` is rejected. The client copy of `brief.ts` is byte-identical. Proof: red-first unit `server/test/contracts.test.ts` › "BlastRadius accepts degraded/reason/rank and legacy payloads" and "rejects an unknown reason". plan-verifier checks the identical copy with `diff`.
17. [P2] The MCP tool follows the lab rules:
    - its description is exactly the new verbatim text (≤300 chars, 2 sentences);
    - input is `{repo, pr, files?}` with the existing field descriptions;
    - annotations are `readOnlyHint: true`, `idempotentHint: true`, `destructiveHint: false`, `openWorldHint: false`;
    - `notice` is the first key of the output;
    - every repo-derived string goes through `sanitizeUntrusted` and a length cap;
    - worst-case output is ≤36,000 chars;
    - `tools/list` stays ≤10,240 bytes.

    Proof: red-first unit:
    - `server.test.ts` › "tool and field descriptions match the plan verbatim", "descriptions ≤300 chars and ≤3 sentences", "no instructions and tools/list ≤10,240 bytes";
    - `notice.test.ts` › "is the first key of BlastRadiusOut";
    - `get-blast-radius.test.ts` › "sanitises and caps repo-derived text", "worst case stays ≤36,000 chars and sets truncated".
18. [P2] MCP errors are useful:
    - unknown repo gives E1;
    - a PR not imported gives E2;
    - an API 404 on `/blast` gives E9;
    - an unreachable API gives E8.

    All of them come back as `isError` with no `structuredContent`. Proof: red-first unit `get-blast-radius.test.ts` › "unknown repo → E1", "unknown PR → E2", "API 404 → E9", "API down → E8".
19. [P2] The route answers 404 for an unknown PR id and for a PR in another workspace. Proof: red-first integration `blast.it.test.ts` › "unknown PR → 404".
20. [P2] File refresh:
    - a PR with no `pr_files` rows gets its files refreshed once through the pulls service, and the facade is called with the refreshed paths;
    - a PR that has files is never refreshed;
    - when files are still empty after the refresh, the facade is not called and `degraded` follows the index status only (no false `no_data`).

    Proof: red-first unit `blast-service.test.ts` › "refreshes files only when pr_files is empty", "no files after refresh: no facade call". Red-first integration `blast.it.test.ts` › "a never-opened PR is refreshed from GitHub before the read".

**P3**

21. [P3] The tree collapses. Each symbol header is a button with `aria-expanded`, and all headers start expanded. A click hides that symbol's callers and chips; a second click shows them again. Proof: red-first unit `BlastTree.test.tsx` › "symbol header collapses and expands its callers".
22. [P3] A Tree/Graph toggle made of two `Chip`s labelled `view.tree` and `view.graph`. Graph renders an `<svg>` with `aria-label` = `graph.ariaLabel` and three columns: symbols → callers → endpoints/crons, with one edge per link. With no downstream it shows `graph.empty`. Proof: red-first unit:
    - `BlastRadiusCard.test.tsx` › "Tree/Graph toggle swaps the view";
    - `BlastGraph.test.tsx` › "renders an svg with symbol, caller and endpoint nodes" and "empty graph text";
    - `helpers.test.ts` › "toGraphModel builds three columns and deduped edges".

    Visual check in the browser (main session).
23. [P3] Crons show separately from endpoints: in the tree as their own labelled chip row (`stat.crons`), in the graph as a distinct node kind. Proof: red-first unit `BlastTree.test.tsx` › "crons render in their own row, apart from endpoints".
24. [P3] Ordering:
    - groups are sorted by their highest caller `rank`, descending, with ties broken by symbol name ascending;
    - callers within a group are sorted by `rank` descending, then `file` ascending, then `line` ascending;
    - the UI and the MCP keep server order.

    Proof: red-first unit `blast-helpers.test.ts` › "orders symbols and callers by rank with deterministic ties" and `get-blast-radius.test.ts` › "keeps server order".
25. [P3] A Resync button next to the incomplete-index mark calls `POST /repos/:repoId/resync`. It is disabled while the call is pending and shows `resyncQueued` after it succeeds. Proof: red-first unit `IndexNotice.test.tsx` › "Resync calls onResync, disables while pending, shows queued" and `OverviewTab.test.tsx` › "Resync posts to /repos/:id/resync".
26. [P3] Every user-facing label in the card and its subcomponents comes from `client/messages/en/blast.json`. Proof: red-first unit. Every blast test renders `NextIntlClientProvider` with `messages={{ blast }}` and `onError={(e) => { throw e; }}`, so a missing key fails the test instead of only logging (`client/INSIGHTS.md:21`). plan-verifier greps the card folder for inline strings.

## Delivery (not code; main session owns these)
- Open the PR (base `feat/devdigest-mcp`) with:
  - an implementation description;
  - a "subagent → what it did" table (course P2);
  - known limitations (see Risks);
  - the demo video link, made with Playwright, ElevenLabs and ffmpeg. The video shows the summary, callers and endpoints, a click through to GitHub, the no-caller state, the degraded state on #482, and the MCP call matching the UI.
- Ask Glib before pushing.
- `server/docs/blast-radius.md` with a Mermaid flow (doc-writer), and INSIGHTS entries (engineering-insights).

## Red-first
Test-writer writes these before any implementer starts. The three MCP files marked "replaced" hold the hw4 stub tests. They are **rewritten against this plan's spec**, not loosened; see "Supersedes hw4".

- AC4, AC13, AC14, AC15, AC24 → `server/test/blast-helpers.test.ts`:
  - "groups flat callers by viaSymbol";
  - "attributes endpoints and crons from factsByFile, deduplicated";
  - "no factsByFile gives empty endpoints and crons";
  - "drops callers in the symbol's own declaring file";
  - "caps callers per symbol at the limit passed in";
  - "degraded/reason pass-through, partial → index_partial, full → clean";
  - "orders symbols and callers by rank with deterministic ties";
  - "summary string follows the count rules".
- AC10, AC20 → `server/test/blast-service.test.ts`:
  - "one facade read, one index-state read, one log line with source index";
  - "refreshes files only when pr_files is empty";
  - "no files after refresh: no facade call";
  - "unknown PR returns undefined".
- AC12, AC14 → `server/test/blast-static.test.ts`:
  - "blast module calls no LLM and no indexer";
  - "wiring takes the cap from repo-intel constants".
- AC5, AC11, AC15, AC19, AC20 → `server/test/blast.it.test.ts`. It uses a test-local fake `RepoIntel` through `ContainerOverrides.repoIntel` and `MockGitHubClient`:
  - "maps a PR #27-shaped index result: ≥2 callers in ≥2 files, ≥1 endpoint";
  - "200 body parses as BlastRadius";
  - "a non-contract body is refused with 500";
  - "degraded fields reach the response";
  - "unknown PR → 404";
  - "a never-opened PR is refreshed from GitHub before the read".
- AC16 → `server/test/contracts.test.ts`:
  - "BlastRadius accepts degraded/reason/rank and legacy payloads";
  - "rejects an unknown reason".
- AC2, AC6, AC22 → `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BlastRadiusCard/helpers.test.ts`:
  - "blastStats counts per the count rules";
  - "pickLinkSha prefers lastIndexedSha, falls back to headSha, else null";
  - "toGraphModel builds three columns and deduped edges".
- AC2, AC7, AC8, AC22, AC26 → `…/BlastRadiusCard/BlastRadiusCard.test.tsx`:
  - "summary row shows the four counts";
  - "no callers shows the noDownstream text";
  - "degraded result shows the notice above the map";
  - "Tree/Graph toggle swaps the view";
  - "loading and error states".
- AC3, AC6, AC21, AC23 → `…/BlastRadiusCard/_components/BlastTree/BlastTree.test.tsx`:
  - "lists callers as file:line and the symbol's endpoints below them";
  - "caller link points at exactly that line";
  - "no link without sha or repo";
  - "symbol header collapses and expands its callers";
  - "crons render in their own row, apart from endpoints".
- AC22 → `…/BlastRadiusCard/_components/BlastGraph/BlastGraph.test.tsx`:
  - "renders an svg with symbol, caller and endpoint nodes";
  - "empty graph text".
- AC8, AC25 → `…/BlastRadiusCard/_components/IndexNotice/IndexNotice.test.tsx`:
  - "shows the reason text for each reason";
  - "Resync calls onResync, disables while pending, shows queued".
- AC1, AC6, AC25 → `…/OverviewTab/OverviewTab.test.tsx`. It mocks `api` from `@/lib/api` at the boundary, keeps the real `ApiError` via `importOriginal`, and wraps the render in `QueryClientProvider` (retry off) plus `NextIntlClientProvider` with `intent` and `blast`:
  - "renders the Blast radius block from GET /pulls/:id/blast";
  - "link sha comes from GET /repos/:id/index-state, falls back to head_sha";
  - "Resync posts to /repos/:id/resync".
- AC9, AC17, AC18, AC24 → `mcp-server/test/get-blast-radius.test.ts` (replaced):
  - "returns the API's map unchanged in content and order";
  - "keeps server order";
  - "files filter keeps only symbols declared in those files";
  - "no downstream → M6";
  - "degraded → M7 with reason";
  - "sanitises and caps repo-derived text";
  - "worst case stays ≤36,000 chars and sets truncated";
  - "unknown repo → E1";
  - "unknown PR → E2";
  - "API 404 → E9";
  - "API down → E8".
- AC17 → `mcp-server/test/server.test.ts` (replaced row). The `TOOL_DESCRIPTIONS.devdigest_get_blast_radius` entry becomes the new verbatim text, and the sentence-count check at line 167 expects `2`.
- AC17 → `mcp-server/test/notice.test.ts` (replaced case). "is absent from BlastRadiusOut" becomes "is the first key of BlastRadiusOut", using the async `getBlastRadius(deps, input)`.
- AC9 → `mcp-server/test/http-api-client.test.ts` › "getBlastRadius GETs /pulls/<encoded id>/blast and expects an object".

## Review focus
- **PR with zero files even after a refresh.** The facade would return a false `no_data` (`repo-intel/service.ts:223-234`). Pinned by `blast-service.test.ts` › "no files after refresh: no facade call" in step 3.
- **The same symbol name declared in two changed files.** It yields one group, and self-exclusion checks every declaring file. Pinned by `blast-helpers.test.ts` › "drops callers in the symbol's own declaring file", which uses a two-declaration fixture, in step 2.
- **A caller file missing from `factsByFile`, or the whole map absent (fallback).** Chips come out empty with no crash. Pinned by `blast-helpers.test.ts` › "no factsByFile gives empty endpoints and crons" in step 2.
- **`lastIndexedSha` is `''` for a repo with no index.** The link falls back to `head_sha`; with both missing, the caller is plain text. Pinned by `helpers.test.ts` › "pickLinkSha…" and `BlastTree.test.tsx` › "no link without sha or repo" in step 5.
- **A second click on Resync while the call is pending.** The button is disabled. Pinned by `IndexNotice.test.tsx` in step 5.

## Context read
- `server/INSIGHTS.md:15`: only `GET /pulls/:id` fills `pr_files`. That is why the service has a `refreshFiles` port, so MCP and UI agree on a never-opened PR.
- `server/INSIGHTS.md:21-22`: `GRANDFATHERED` is exact-count, and a `build<X>Service(container)` factory in `wiring.ts` is not scanned. The blast route builds its service through `blast/wiring.ts` and makes zero adapter calls.
- `server/INSIGHTS.md:26`: `refreshPullDetail` never throws on a GitHub failure and serves stored rows. So "refreshed" does not mean "has files", which is behind AC20's no-files branch.
- `server/INSIGHTS.md:28`: a field added to a jsonb-backed contract is `.nullish()`, and clients treat `undefined` like `null`. That shapes AC16.
- `server/INSIGHTS.md:29`: the vendor/shared trees already differ in comments. Diff only the two `brief.ts` files.
- `client/INSIGHTS.md:21`: next-intl logs missing keys instead of throwing. Hence the throwing `onError` in AC26.
- `client/INSIGHTS.md:23`: the client imports shared **types** from the barrel, and any runtime value only by deep import. The client needs types only.
- `client/INSIGHTS.md:25`: `Chip` has no `aria-pressed`. Assert the toggle by what renders.
- `server/.dependency-cruiser.cjs:13-23,85-92,119`: application files can't import another module, and type-only imports count. `wiring.ts` and `routes.ts` are exempt. See Design conflicts 1–2.
- `server/src/modules/repo-intel/service.ts:220-304,315-391`:
  - the persistent path needs `full` or `partial` and returns `degraded:false` for `partial`;
  - the global `slice(0, MAX_CALLERS_PER_SYMBOL)` is at :386;
  - dedup is at :361;
  - the fallback reads the clone and returns `no_data` with no `factsByFile`.
- `server/src/modules/repo-intel/repository.ts:503-531`: callers are INNER JOINed to `file_rank` and not filtered against the declaring file, so the mapper's self-exclusion matters.
- `server/node_modules/fastify-type-provider-zod/dist/src/core.js:85-91` with `server/src/app.ts:130-133`: the response serializer `safeParse`s, throws `ResponseSerializationError` and becomes a 500. It emits `result.data`, so keys outside the contract are stripped, and `rank` has to be in `BlastCaller`. No researcher is needed.
- `server/src/modules/smart-diff/{routes,service}.ts`: the template (local store port satisfied structurally by `ReviewRepository`, `NotFoundError` on undefined).
- `server/src/modules/pulls/wiring.ts:14`: `buildPullsService(container, log)`.
- `client/messages/en/blast.json` already has `stat.*`, `view.*`, `callerCount`, `noDownstream` and `graph.*`. Extend it; don't rename.
- `client/src/lib/hooks/repo-intel.ts:31,41`: `useRepoIntelStatus` and `useResyncRepoIntel` already exist.
- `client/src/lib/github-urls.ts:24`: `githubBlobUrl` encodes path segments and hard-codes `https://github.com`.
- `mcp-server/AGENTS.md` "Rules": onion inside the package, `@devdigest/shared` type-only, descriptions verbatim from the plan table.
- `mcp-server/test/server.test.ts:79` and `notice.test.ts`: `emptySeed()` lists every `FakeSeed` field, so the new field is optional.
- `docs/homework-4/plan.md:18,59,380,414,427,448,482,570`: the stub decisions this plan supersedes.
- `.claude/skills/pr-self-review/SKILL.md:34-43`: the routing table. `mcp-server/**` has no row, and `typescript-expert` is excluded on purpose.

## Affected surfaces
- shared → contracts → contract ring → `server/src/vendor/shared/contracts/brief.ts` (changed), `client/src/vendor/shared/contracts/brief.ts` (changed, mirror)
- server → blast → application (pure mapper) → `server/src/modules/blast/helpers.ts` (new)
- server → blast → application (service and ports) → `server/src/modules/blast/service.ts` (new)
- server → blast → wiring (edge) → `server/src/modules/blast/wiring.ts` (new)
- server → blast → route (edge) → `server/src/modules/blast/routes.ts` (new)
- server → registry → `server/src/modules/index.ts` (changed)
- server → tests → `server/test/contracts.test.ts` (changed), `blast-helpers.test.ts`, `blast-service.test.ts`, `blast-static.test.ts`, `blast.it.test.ts` (new, test-writer)
- client → data → `client/src/lib/hooks/blast.ts` (new), `client/src/lib/hooks/index.ts` (changed, named export)
- client → i18n → `client/messages/en/blast.json` (changed)
- client → PR detail route → `…/pulls/[number]/page.tsx` (changed: pass `repoId`, `repoFullName`), `…/_components/OverviewTab/OverviewTab.tsx` and `styles.ts` (changed)
- client → OverviewTab → `_components/BlastRadiusCard/` (new): `BlastRadiusCard.tsx`, `index.ts`, `helpers.ts`, `constants.ts`, `styles.ts`, plus `_components/BlastTree/`, `_components/BlastGraph/` and `_components/IndexNotice/` (each `<Name>.tsx`, `index.ts`, `<Name>.test.tsx`)
- mcp-server → port → `src/ports/api-client.ts` (changed)
- mcp-server → adapter → `src/adapters/http-api-client.ts` (changed)
- mcp-server → double → `src/adapters/mocks.ts` (changed)
- mcp-server → application → `src/app/blast-radius.ts` and `src/app/present.ts` (changed)
- mcp-server → tool edge → `src/tools/devdigest-get-blast-radius.ts` (changed)
- mcp-server → docs → `mcp-server/README.md` (changed, line 15), `mcp-server/AGENTS.md` (changed, verbatim rule), `docs/homework-4/plan.md` (append-only pointer section)

## Constraints
- **Route handlers parse, call a service and map the result, with zero adapter calls.** Source: `.claude/rules/onion-boundaries.md:16-17`, `onion-architecture` step 2, `server/test/route-adapter-calls.test.ts`. The route calls `service.getBlastRadius` only and is built via `buildBlastService`. `GRANDFATHERED` is untouched.
- **Application code imports no other module, not even types.** Source: `server/.dependency-cruiser.cjs:85-92,119`. `helpers.ts` and `service.ts` declare local structural types. Only `wiring.ts` imports `../pulls/wiring.js` and `../repo-intel/constants.js`.
- **A new service takes ports, not `Container`.** Source: `onion-architecture` step 5. `BlastService(ports: BlastPorts)`.
- **Contracts change on the server first and are mirrored to the client in the same change.** Source: `.claude/rules/shared-contracts.md:9-14`. Step 1 edits both `brief.ts` files identically.
- **Optional contract fields are `.nullish()`.** Source: `shared-contracts.md:17-18`, `server/INSIGHTS.md:28`.
- **Never edit the dependency-cruiser config, its baseline or `GRANDFATHERED`.** Source: `onion-boundaries.md:24-27`. Nothing in this plan touches them.
- **Don't change the repo-intel facade.** Source: the approved design. Its quirks go to Known limitations.
- **Place client code next to its only consumer, as a folder only when it has a companion.** Source: `frontend-ui-architecture` rules 1 and 4. `BlastRadiusCard` lives under `OverviewTab/_components/`, and each subcomponent folder has its own test.
- **`constants.ts` holds label keys, never text.** Source: `frontend-ui-architecture` rule 5. The reason enum maps to a labelKey there.
- **Components never fetch.** Source: `frontend-ui-architecture` rule 6, `client/CLAUDE.md`. Data flows through `useBlastRadius`, then `api.get`. `BlastRadiusCard` is presentational, and `OverviewTab` wires the hooks.
- **No new `export *`.** Source: `frontend-ui-architecture` rule 8. The barrel gets `export { useBlastRadius } from "./blast";`.
- **New strings go through next-intl in `messages/en/<ns>.json`.** Source: `client/CLAUDE.md` Rules. Everything goes in `blast.json`. The UI does not display the server's English `summary`.
- **In the MCP, tools parse → app → ports, and only adapters fetch.** `@devdigest/shared` is type-only and the package's own schemas are zod v4. Source: `mcp-server/AGENTS.md`. The reason enum is re-declared in zod v4 inside `present.ts`.
- **MCP descriptions are verbatim from a plan.** Source: `mcp-server/AGENTS.md`. This plan is the revision: see "Supersedes hw4" and the new text under Contracts.
- **No schema change or migration.** Source: root `CLAUDE.md` Do-not-touch. None is needed.

## Skills for the implementer
- client/** → frontend-ui-architecture, next-best-practices, react-best-practices, react-testing-library, security, zod
- server/** → onion-architecture, fastify-best-practices, drizzle-orm-patterns (routed, but this change writes no query), security, zod
- mcp-server/** → **not in the routing table** (`pr-self-review/SKILL.md:34-41`). Use onion-architecture (named by `mcp-server/AGENTS.md`, "Read when"), security (untrusted text) and zod (v4 schemas). typescript-expert stays out, as the table excludes it deliberately.

## Steps
Implementer A does steps 1–3. After step 3 is committed, implementer B (steps 4–6) and implementer C (steps 7–8) run in parallel; they share no files. Commands run from the repo root.

1. [BE] shared contracts: extend `BlastRadius`
   - files: `server/src/vendor/shared/contracts/brief.ts` (changed), `client/src/vendor/shared/contracts/brief.ts` (changed, identical hunk)
   - layer: contracts (inner ring)
   - skills: zod, onion-architecture
   - turns green: `contracts.test.ts` › both AC16 cases
   - test first: none (covered by the red tests)
   - interfaces:
     - consumes nothing;
     - produces `export const BlastDegradedReason = z.enum(['flag_off','index_failed','index_partial','repo_too_large','no_data'])` and its type;
     - produces `BlastCaller.rank: z.number().nullish()`, plus `BlastRadius.degraded: z.boolean().nullish()` and `BlastRadius.reason: BlastDegradedReason.nullish()`, placed after `summary`.
   - verify: `pnpm --dir server typecheck && pnpm --dir client typecheck` → exit 0. Then `.claude/sandbox/run-tests.sh pnpm --dir server exec vitest run test/contracts.test.ts` → all pass.

2. [BE] server/blast: pure mapper
   - files: `server/src/modules/blast/helpers.ts` (new)
   - layer: application (pure)
   - skills: onion-architecture, zod, security
   - turns green: `blast-helpers.test.ts` (all 8)
   - test first: none beyond the red list
   - interfaces:
     - consumes `BlastRadius` and `BlastDegradedReason` (types) from `@devdigest/shared`;
     - produces these local types, structurally compatible with the repo-intel facade and not imported from it:
       - `export type BlastIndexStatus = 'full' | 'partial' | 'degraded' | 'failed'`
       - `export interface BlastFacadeResult { changedSymbols: { file: string; name: string; kind: string }[]; callers: { file: string; symbol: string; viaSymbol: string; line: number; rank: number }[]; factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>; degraded?: boolean; reason?: BlastDegradedReason }`
       - `export function toBlastRadius(result: BlastFacadeResult, indexStatus: BlastIndexStatus, limits: { maxCallersPerSymbol: number }): BlastRadius`
       - `export function blastSummary(radius: Pick<BlastRadius, 'changed_symbols' | 'downstream' | 'degraded' | 'reason'>): string`
     - rules: follow AC4, 13, 14, 15 and 24 and **Count rules**. `downstream` only holds symbols with at least one kept caller. `changed_symbols` holds all of them in facade order, as `{name, file, kind}`. Caller output is `{name: caller.symbol, file, line, rank}`.
   - verify: `.claude/sandbox/run-tests.sh pnpm --dir server exec vitest run test/blast-helpers.test.ts` → 8 passed.

3. [BE] server/blast: service, wiring, route, registration
   - files:
     - `server/src/modules/blast/service.ts` (new)
     - `server/src/modules/blast/wiring.ts` (new)
     - `server/src/modules/blast/routes.ts` (new)
     - `server/src/modules/index.ts` (changed: `import blast from './blast/routes.js'`, entry `blast`)
   - layer: application (service), edge (wiring and route)
   - skills: onion-architecture, fastify-best-practices, zod, security
   - turns green:
     - `blast-service.test.ts` (4);
     - `blast-static.test.ts` (2);
     - `blast.it.test.ts` (6), which is run by plan-verifier;
     - `route-adapter-calls.test.ts` stays green.
   - test first: none beyond the red list
   - interfaces:
     - consumes `toBlastRadius`, `BlastFacadeResult` and `BlastIndexStatus` (step 2); `buildPullsService` (`pulls/wiring.ts:14`); `MAX_CALLERS_PER_SYMBOL` (`repo-intel/constants.ts:30`); `container.reviewRepo` and `container.repoIntel`.
     - produces in `service.ts`:
       - `export const BLAST_LOG_MESSAGE = 'blast: read repo-intel index'`
       - `export interface BlastStorePort { getPull(workspaceId: string, prId: string): Promise<{ id: string; repoId: string } | undefined>; getPrFiles(prId: string): Promise<{ path: string }[]> }`
       - `export interface BlastLogFields { prId: string; repoId: string; source: 'index' | 'fallback'; degraded: boolean; reason: BlastDegradedReason | null; symbols: number; callers: number }`
       - `export interface BlastPorts { store: BlastStorePort; blast(repoId: string, changedFiles: string[]): Promise<BlastFacadeResult>; indexStatus(repoId: string): Promise<{ status: BlastIndexStatus }>; refreshFiles(workspaceId: string, prId: string): Promise<string[]>; log?(fields: BlastLogFields, message: string): void; limits: { maxCallersPerSymbol: number } }`
       - `export class BlastService { constructor(ports: BlastPorts); getBlastRadius(workspaceId: string, prId: string): Promise<BlastRadius | undefined> }`
     - produces in `wiring.ts`: `export function buildBlastService(container: Container, log: FastifyBaseLogger): BlastService`. `refreshFiles` maps `pullsService.refreshPullDetail(...).files` to paths, and `indexStatus` wraps `container.repoIntel.getIndexState`.
     - produces the route `GET /pulls/:id/blast`, with `schema: { params: IdParams, response: { 200: BlastRadius } }`. Workspace comes from `getContext`, and `undefined` becomes `NotFoundError('Pull request not found')`.
   - verify:
     - `pnpm --dir server typecheck` → exit 0. The wiring's facade-to-port assignment also type-checks that the facade's `DegradedReason` fits `BlastDegradedReason`.
     - `.claude/sandbox/run-tests.sh pnpm --dir server exec vitest run --exclude '**/*.it.test.ts'` → all pass.

4. [UI] client: hook and i18n keys
   - files: `client/src/lib/hooks/blast.ts` (new), `client/src/lib/hooks/index.ts` (changed), `client/messages/en/blast.json` (changed, keys under Contracts & data)
   - layer: data (`src/lib`), i18n
   - skills: frontend-ui-architecture, react-best-practices, zod
   - turns green: none alone (consumed by steps 5–6)
   - test first: none
   - interfaces:
     - consumes `api.get` and the `BlastRadius` type;
     - produces `export function useBlastRadius(prId: string | null | undefined)`: react-query key `["blast-radius", prId]`, `api.get<BlastRadius>(\`/pulls/${prId}/blast\`)`, `enabled: !!prId`.
   - verify: `pnpm --dir client typecheck` → exit 0.

5. [UI] client: `BlastRadiusCard` and subcomponents (presentational)
   - files: `…/OverviewTab/_components/BlastRadiusCard/` with `BlastRadiusCard.tsx`, `index.ts`, `helpers.ts`, `constants.ts`, `styles.ts`, `_components/BlastTree/{BlastTree.tsx,index.ts}`, `_components/BlastGraph/{BlastGraph.tsx,index.ts}` and `_components/IndexNotice/{IndexNotice.tsx,index.ts}` (all new; the test files come from test-writer)
   - layer: route-colocated component (`app/**/_components`)
   - skills: frontend-ui-architecture, next-best-practices, react-best-practices, react-testing-library, security
   - turns green: `helpers.test.ts`, `BlastRadiusCard.test.tsx`, `BlastTree.test.tsx`, `BlastGraph.test.tsx`, `IndexNotice.test.tsx`
   - test first: none beyond the red list
   - interfaces:
     - consumes the `BlastRadius` and `BlastDegradedReason` types, `githubBlobUrl`, `@devdigest/ui` (`SectionLabel`, `Card`, `Chip`, `MonoLink`, `EmptyState`, `Skeleton`, `ErrorState`, `Button`) and `useTranslations("blast")`.
     - produces from `helpers.ts`:
       - `blastStats(b: BlastRadius): { symbols: number; callers: number; endpoints: number; crons: number }`
       - `pickLinkSha(lastIndexedSha: string | null | undefined, headSha: string | null | undefined): string | null`
       - `toGraphModel(b: BlastRadius): { symbols: GraphNode[]; callers: GraphNode[]; targets: GraphNode[]; edges: { from: string; to: string }[] }`, where `GraphNode = { id: string; label: string; kind: 'symbol' | 'caller' | 'endpoint' | 'cron' }` and ids are `sym:<name>`, `caller:<file>:<line>`, `ep:<s>`, `cron:<s>`
     - produces from `constants.ts`: `REASON_LABEL_KEY: Record<BlastDegradedReason, string>` (`no_data` → `reason.noData`, and so on)
     - produces the component props:
       - `BlastRadiusCard({ blast, isLoading, isError, onRetry, link, resync })`, where `link: { repoFullName: string; sha: string } | null` and `resync?: { onResync(): void; pending: boolean; queued: boolean }`
       - `BlastTree({ downstream, link })`
       - `BlastGraph({ blast })`
       - `IndexNotice({ reason, resync })`
     - the graph is plain SVG, with no new dependency.
   - verify:
     - `pnpm --dir client typecheck` → exit 0;
     - `.claude/sandbox/run-tests.sh pnpm --dir client test` → all pass, and no `MISSING_MESSAGE` output from the blast tests.

6. [UI] client: wire into Overview
   - files: `…/OverviewTab/OverviewTab.tsx` (changed), `…/OverviewTab/styles.ts` (changed: two-column grid for Intent and Blast), `…/pulls/[number]/page.tsx` (changed: `<OverviewTab … repoId={repoId} repoFullName={repoFullName} />`)
   - layer: route component
   - skills: frontend-ui-architecture, next-best-practices, react-best-practices, react-testing-library
   - turns green: `OverviewTab.test.tsx` (3)
   - test first: none beyond the red list
   - interfaces:
     - consumes `useBlastRadius`, `useRepoIntelStatus(repoId)` and `useResyncRepoIntel(repoId)`, plus `pickLinkSha` and `BlastRadiusCard`;
     - `OverviewTabProps` gains `repoId: string` and `repoFullName: string | null`;
     - `resync.queued` = `mutation.isSuccess` (derived, not stored).
   - verify: `pnpm --dir client typecheck` → exit 0; `.claude/sandbox/run-tests.sh pnpm --dir client test` → all pass.

7. [BE] mcp-server: port, adapter, double
   - files: `mcp-server/src/ports/api-client.ts`, `src/adapters/http-api-client.ts`, `src/adapters/mocks.ts` (all changed)
   - layer: port, adapter, test double
   - skills: onion-architecture, security
   - turns green: `http-api-client.test.ts` › "getBlastRadius GETs /pulls/<encoded id>/blast and expects an object"
   - test first: none beyond the red list
   - interfaces:
     - `ApiClient.getBlastRadius(prId: string): Promise<BlastRadius>` (type-only import);
     - `HttpApiClient` calls `request('GET', \`/pulls/${encodeURIComponent(prId)}/blast\`, 'object')`;
     - `FakeSeed.blastByPr?: Record<string, BlastRadius>` (**optional**);
     - `FakeApiClient.getBlastRadius` records the call and throws `ApiError` 404 `not_found` when the seed has no entry.
   - verify: `pnpm --dir mcp-server typecheck` → exit 0.

8. [BE] mcp-server: use case, output schema, tool, docs
   - files: `src/app/blast-radius.ts`, `src/app/present.ts`, `src/tools/devdigest-get-blast-radius.ts`, `mcp-server/README.md` (line 15), `mcp-server/AGENTS.md` (verbatim rule) and `docs/homework-4/plan.md` (append a `## Superseded by homework-5 (2026-09-28)` section that points at `docs/homework-5/plan.md` "Supersedes hw4"; existing text untouched), all changed
   - layer: application, tool edge, docs
   - skills: onion-architecture, security, zod
   - turns green: `get-blast-radius.test.ts` (all), `server.test.ts` (all), `notice.test.ts` (all), `untrusted-text*.test.ts` stay green
   - test first: none beyond the red list
   - interfaces:
     - consumes `resolveRepo`, `resolvePr`, `toToolError`, `ToolError`, `sanitizeUntrusted`, `truncate`, `UNTRUSTED_NOTICE` and `ApiClient.getBlastRadius`;
     - produces `export async function getBlastRadius(deps: ServerDeps, input: { repo: string; pr: number; files?: string[] }): Promise<BlastRadiusOut>` (replaces the sync stub);
     - produces the new `BlastRadiusOut` (Contracts & data);
     - the tool handler uses the try/catch → `isError` shape of `devdigest-get-conventions.ts`; annotations unchanged; new verbatim description.
   - verify: `pnpm --dir mcp-server typecheck` → exit 0; `.claude/sandbox/run-tests.sh pnpm --dir mcp-server exec vitest run --exclude test/stdio.test.ts` → all pass.

## Contracts & data

**Shared contract** (step 1; both `brief.ts` copies byte-identical):
- `BlastDegradedReason = z.enum(['flag_off','index_failed','index_partial','repo_too_large','no_data'])`
- `BlastCaller = { name, file, line: int, rank: number.nullish() }`
- `BlastRadius = { changed_symbols, downstream, summary, degraded: boolean.nullish(), reason: BlastDegradedReason.nullish() }`

The route always emits `degraded` (a boolean) and `reason` (a value or `null`). ADR: `/Users/Glebazzz/Claude/PROJECTS/NEO/decisions/2026-09-28-blast-radius-contract.md`.

**Count rules** (one definition, tested on both sides):
- symbols = `changed_symbols.length`
- callers = number of distinct `file:line` pairs across all `downstream[].callers`
- endpoints = number of distinct strings across all `endpoints_affected`
- crons = number of distinct strings across all `crons_affected`
- server `summary` = `` `${symbols} changed symbol(s) · ${callers} caller(s) · ${endpoints} endpoint(s) · ${crons} cron/job(s)` ``, plus `` ` · index incomplete (${reason})` `` when `degraded`

**i18n** (`client/messages/en/blast.json`; keep every existing key and add):
- `title`: "Blast radius"
- `loading`: "Loading blast radius…"
- `errorTitle`: "Couldn't load the blast radius"
- `incomplete`: "Incomplete index"
- `reason.noData`: "No code index for this repo yet, so callers come from a text search or are missing."
- `reason.indexPartial`: "The code index stopped early, so some callers may be missing."
- `reason.indexFailed`: "The last indexing run failed, so callers may be missing."
- `reason.repoTooLarge`: "The repo is too large to index fully, so callers may be missing."
- `reason.flagOff`: "Code indexing is turned off on this server."
- `resync`: "Resync index"
- `resyncing`: "Resyncing…"
- `resyncQueued`: "Resync queued. Reload in a minute to see the new map."

Tree row labels reuse `stat.endpoints` and `stat.crons`, and the symbol header uses `callerCount`.

**MCP tool description (verbatim, 247 chars, 2 sentences):**
`Get the blast radius of a pull request: each changed symbol with its callers as file:line and the HTTP endpoints and cron jobs they reach, read from DevDigest's code index. Call it before reviewing or merging to see what else the change can break.`

Title stays `Get blast radius`. Input `{repo, pr, files?}` keeps the existing `fields.ts` schemas and descriptions.

**`BlastRadiusOut`** (zod v4, in this key order, with no `.describe()` on output fields so `tools/list` stays small):
- `notice`: string, `UNTRUSTED_NOTICE`
- `repo`: string
- `pr`: int
- `summary`: string, server string, sanitised, ≤200. It describes the whole PR even when `files` filters `downstream`.
- `degraded`: boolean (`?? false`)
- `reason`: `enum(5) | null`
- `changed_symbol_count`: int, after the `files` filter
- `downstream`: array of `{ symbol, callers: {name, file, line}[], endpoints: string[], crons: string[] }`
- `truncated`: boolean
- `message`: `string | null`

**MCP caps** (constants in `app/blast-radius.ts`):
- ≤10 symbols;
- ≤8 callers per symbol;
- ≤5 endpoints and ≤5 crons per symbol;
- `file` ≤160, `symbol` and `name` ≤80, endpoint and cron ≤100, each after `sanitizeUntrusted`;
- `truncated: true` when any cap cuts something.

The worst-case JSON stays ≤36,000 chars (the hw4 AC21 budget). `files` keeps a group when any file declaring its symbol, per the API's `changed_symbols`, is in `files`.

**Non-error messages:**
- `M6` `No callers of the changed symbols were found for PR #<pr> in <repo>.` Used when not degraded and `downstream` is empty.
- `M7` `The code index for <repo> is incomplete (<reason>), so callers may be missing. Resync the repo in DevDigest, then retry.` Used whenever `degraded`.
- Otherwise `message: null`.

Errors reuse E1, E2, E8 and E9.

No migration, no seed change, no new dependency.

## Checks for the implementer
- server (A): `pnpm --dir server typecheck` · `.claude/sandbox/run-tests.sh pnpm --dir server exec vitest run --exclude '**/*.it.test.ts'`
- client (B): `pnpm --dir client typecheck` · `.claude/sandbox/run-tests.sh pnpm --dir client test`
- mcp-server (C): `pnpm --dir mcp-server typecheck` · `.claude/sandbox/run-tests.sh pnpm --dir mcp-server exec vitest run --exclude test/stdio.test.ts`

## Checks for reviewers
- **architecture-reviewer:**
  - `pnpm --dir server lint:boundaries` exits 0 with no new violation (only `blast/wiring.ts` crosses modules);
  - the onion step 9 report for `server/src/modules/blast/`;
  - `route-adapter-calls.test.ts` green, with `blast/routes.ts` at zero calls and `GRANDFATHERED` unchanged;
  - a manual onion check of the `mcp-server` diff (tools → app → ports, fetch only in adapters, shared imports type-only);
  - frontend placement under `frontend-ui-architecture`.
- **plan-verifier:**
  - AC1–AC26;
  - `pnpm --dir server exec vitest run .it.test` with Docker, including `blast.it.test.ts`. Skipped counts as not passed;
  - `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` → empty;
  - `npm --prefix reviewer-core run typecheck` (`shared-contracts.md:22`);
  - a grep for inline user-facing strings in `BlastRadiusCard/**`.
- **security-reviewer:**
  - workspace scoping of `GET /pulls/:id/blast`, and that it is a GET which can write (the `pr_files` refresh);
  - repo-derived text in the UI: JSX escaping, `href` only via `githubBlobUrl` (https host, encoded path);
  - repo-derived text in the MCP: `sanitizeUntrusted`, `notice`, caps;
  - the log line carries no secrets.
- **main session:**
  - `pnpm --dir mcp-server test` unsandboxed (for `stdio.test.ts`), then Inspector `tools/list`;
  - live checks for AC5, 6, 8, 9 and 10 (curl on #27, API log, GitHub click, #482 `no_data`, Claude Code MCP call vs UI, screenshot);
  - `npm --prefix e2e run e2e:hermetic` as a regression check, since the Overview layout changed and flows assert visible text;
  - `pr-self-review` (pre-PR);
  - the Delivery items.

## Supersedes hw4
This plan is the "plan revision" that `mcp-server/AGENTS.md` requires for a description change. It supersedes these parts of `docs/homework-4/plan.md`, and only these:
- **AC17 (`:59`)**: the stub that returns `not_implemented` with zero API calls. Replaced by AC9, AC17 and AC18 here. The tool now makes `listRepos`, `listPulls` and `getBlastRadius` calls.
- **Decision G (`:18`)**: the stub's normal non-error result. Replaced by a real result, with `isError` on E1, E2, E8 and E9.
- **The Tool descriptions row (`:380`) and the length table row (`:400`)**: replaced by the verbatim text above (247 chars, 2 sentences).
- **The Contracts row (`:414`) and the `BlastRadiusOut` schema (`:427`)**: replaced by the `BlastRadiusOut` above. Input is unchanged.
- **M5 (`:448`)**: retired. M6 and M7 are added.
- **Revision 2.2 "`BlastRadiusOut` carry no notice" (`:570`)**: reversed. The output now carries repo-derived text (paths, symbol names), so `notice` is its first key and those fields are sanitised.
- **Out of scope "Implementing blast radius" (`:482`)**: now in scope.

The replaced tests are `mcp-server/test/get-blast-radius.test.ts` (whole file), `server.test.ts:33-37,167` and `notice.test.ts:250-253`. They are rewritten against this spec, not weakened. README line 15 and the `mcp-server/AGENTS.md` verbatim rule are updated in step 8.

## Design conflicts
1. **`toBlastRadius(result: BlastResult, …)` can't import `BlastResult`.**
   - The problem: the design types the mapper against `repo-intel/types.ts`. `application-no-cross-module` (`server/.dependency-cruiser.cjs:85-92`) forbids `blast/helpers.ts` importing another module, and `tsPreCompilationDeps: true` (`:119`) counts type-only imports.
   - Resolution: a local structural `BlastFacadeResult` in `blast/helpers.ts`. Only `wiring.ts`, which is exempt (`:13-23`), touches the facade.
2. **`z.enum([...DegradedReason])` can't compile.**
   - The problem: `DegradedReason` is a TS union type (`server/src/modules/repo-intel/types.ts:27`), not a runtime array, and `vendor/shared` may not import a module.
   - Resolution: the contract spells out the five literals as `BlastDegradedReason`. The name avoids a clash in the barrel. Drift shows up as a typecheck error in `wiring.ts`.
3. **Where the P2 cap comes from.**
   - The problem: under the same rule, the mapper can't import `MAX_CALLERS_PER_SYMBOL`.
   - Resolution: the mapper takes `limits.maxCallersPerSymbol`, and `wiring.ts` imports the constant (AC14).
4. **Store port `getRepo`.**
   - The problem: the design lists it, but no criterion needs it (the service needs `pull.repoId` only).
   - Resolution: dropped.
5. **Server `summary` in the UI.**
   - The problem: the design builds an English `summary` on the server, but client strings must come from next-intl (`client/CLAUDE.md` Rules).
   - Resolution: the UI renders its own stat row from `blast.json` using the same Count rules. `summary` serves API and MCP consumers.
6. **Worktree.**
   - The problem: the design's pipeline switches to the `review-agent-skills-b833b9` worktree before spawning, but the caller reports `feat/blast-radius` checked out in `dev-digest-mcp-tools-prs-326eb8`.
   - Resolution: the main session confirms which worktree the subagents' cwd points at before spawning. Every path in this plan is repo-relative.

## Out of scope
- Architecture review (architecture-reviewer), acceptance verification (plan-verifier), security review (security-reviewer) and e2e (main session)
- The P3 item "Prior PRs touching these files"
- Any change to the repo-intel facade, its caps or `BFS_DEPTH`
- A new e2e flow
- `server/docs/blast-radius.md` and INSIGHTS entries (doc-writer, engineering-insights)

## Risks & open questions
Known limitations, which go into the PR description:
- **Global caller cap.** `MAX_CALLERS_PER_SYMBOL` (20) is applied **globally** by the facade (`repo-intel/service.ts:386`), so the per-symbol cap rarely bites.
- **Direct callers only.** `BFS_DEPTH` is unused, so there are no transitive callers.
- **Changed symbols are file-level.** They are every symbol declared in a changed file (#27 may show several `helpers.ts` symbols).
- **Endpoints are file-level.** They come from `factsByFile[caller.file]`, so every route in `settings/routes.ts` is listed, not only the handlers that call the symbol.
- **Callers without a rank are dropped.** The INNER JOIN on `file_rank` (`repository.ts:517`) drops callers that have no rank row.
- **Callers collapse per enclosing symbol.** Dedup keeps one representative line.
- **The fallback path attributes no endpoints**, and it reads the clone. "No re-parse" holds on the `source: index` path only, so the live check for AC10 must run on #27.
- **The GET can write.** `GET /pulls/:id/blast` can write `pr_files` for a never-opened PR through the refresh (a design choice), which puts it next to `GET /pulls/:id` in `server/CLAUDE.md` Gotchas.

Risks for the run:
- **`tools/list` size.** The nested `outputSchema` grows `tools/list` toward the 10,240-byte cap (`server.test.ts:173`). If it overflows, flatten `callers` to `"file:line name"` strings. That needs a plan revision, so the implementer can't decide it alone.
- **Links need a pushed SHA.** GitHub links open only if `lastIndexedSha` (`c6af1e45…`) is pushed to `HlibHav/dev-digest`. The main session checks this before recording.
- **Degraded demo.** `acme/payments-api` #482 has no clone. Resync there returns 202 but changes nothing, which is acceptable for showing `no_data`.
- **`mcp-server/**` is unrouted** in `pr-self-review`'s table, so the gate's review of that surface loads no skill. The owner may want a row added; that is not part of this task.
- **No external facts are open,** so no researcher run is needed. The response-serializer behaviour was verified in `server/node_modules/fastify-type-provider-zod/dist/src/core.js:85-91`.

## Revision 5.1 (2026-09-28): `tools/list` budget

Implementer C's first build put `tools/list` at 10,563 bytes, 323 over the 10,240 cap (`server.test.ts` › "no instructions and tools/list ≤10,240 bytes"). The nested caller object in `BlastRadiusOut` was 1,274 bytes of JSON Schema, and each `z.number().int()` adds ~52 bytes of safe-integer bounds. The Risks section named flattening `callers` as the fallback; the main session takes that decision here, plus two smaller cuts, so the cap holds with margin and the map's content is unchanged.

- **`downstream[].callers` becomes `string[]`**, each `"<file>:<line> <name>"` (for example `server/src/modules/settings/routes.ts:65 settingsRoutes`). `file` is sanitised and capped at 160 and `name` at 80 before joining. Order and caps are unchanged (≤8 per symbol). Supersedes the `callers: {name, file, line}[]` shape in "Contracts & data" → `BlastRadiusOut` and in AC9.
- **`changed_symbol_count` is removed** from `BlastRadiusOut`. `summary` already carries the changed-symbol count for the whole PR; with `files`, the agent counts `downstream`.
- **The tool description becomes (verbatim, 194 chars, 2 sentences):**
  `Get a pull request's blast radius from DevDigest's code index: each changed symbol, its callers as file:line and the HTTP endpoints and cron jobs they reach. Call it before reviewing or merging.`
  Supersedes the 247-char text in "Contracts & data".

Tests updated against this revision (rewritten, not weakened): `mcp-server/test/get-blast-radius.test.ts` (caller shape, key list, files filter now asserts `downstream` only), `server.test.ts` (description constant). The byte-cap assertion itself is unchanged.
