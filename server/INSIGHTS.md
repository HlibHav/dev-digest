# server — insights

Findings that are true about this code but not visible in it. Maintained by the
`engineering-insights` skill: read before working here, add an entry after a
non-trivial task, skip routine changes. Append-only — never rewrite or delete an
entry; correct a stale one with a dated sub-bullet beneath it. Sections are
fixed — add to the one that fits.

## What Works

## What Doesn't Work

- **2026-09-20** — A review of a PR nobody has opened sees an **empty diff**, completes, and costs money: it reports 0 findings with `Reviewing 0 changed file(s)` in the run log. `loadDiff` tries `git diff base...head` in the clone first, but `fetchPullHead` has no production caller, so an unmerged PR's head sha is never in the clone and the call throws; the fallback reconstructs the diff from `pr_files.patch`, which only `GET /pulls/:id` fills (it refreshes from GitHub). Open the PR in the UI once — or call `GET /pulls/:id` — before measuring anything about a review. Evidence: `server/src/modules/reviews/diff-loader.ts:20`, `server/src/modules/pulls/routes.ts:227`, `server/src/adapters/git/simple-git.ts:72`

- **2026-09-20** — A `JobRunner` handler that throws takes the **whole API process down**. `enqueue` records the failure on the `jobs` row and then rethrows (`jobs.ts:96`), which rejects `EnqueuedJob.done` — and no route awaits `done`, so it surfaces as an unhandled rejection and node exits. The trigger here was the timeout: providers apply `timeoutMs` **per attempt** inside their own retry loop, so `maxRetries: 1` at 90s overran the runner's 120s. A job handler that calls an LLM needs all three — bound the whole call below 120s yourself, catch inside the handler so the paid call is not retried, and `void job.done.catch(() => {})` at the enqueue site. Note the catch has a cost: the runner then sees the handler resolve and stamps `done` over your `failed`, so the truthful status has to be derived from the error column. Evidence: `server/src/platform/jobs.ts:96`, `server/src/adapters/llm/openai.ts:108`, `server/src/modules/conventions/routes.ts:118`

- **2026-09-16** — In `*.it.test.ts`, `expect(row.newColumn).not.toBeNull()` passes before the column exists: a drizzle row has no such key, so the value is `undefined`, not `null`, and the test goes green without the feature. Assert the type instead (`toEqual(expect.any(String))`) or a value (`toBeGreaterThan(0)`). Evidence: `server/test/reviews.it.test.ts:214`

- **2026-09-25** — `test/route-adapter-calls.test.ts`'s `GRANDFATHERED` map is an exact-count assertion, so it breaks the same way on a LEGITIMATE fix as on a new violation: moving one `container.github()` call out of a grandfathered route file (e.g. `pulls/routes.ts` 4→3, extracting `GET /pulls/:id`'s refresh logic into a service per onion-architecture) fails the test just like adding one would, and the map itself is off-limits to edit (`.claude/skills/onion-architecture/SKILL.md` step 9: "never ... the test's `GRANDFATHERED` list"). A count-lowering refactor of a grandfathered file needs a human/architecture-reviewer to update that one entry — implementer agents cannot land it green on their own. Evidence: `server/test/route-adapter-calls.test.ts:150`, `server/src/modules/pulls/routes.ts:1`
  - **2026-09-25** — Refined: a route file ABSENT from `GRANDFATHERED` must have zero adapter calls, so a `new XService({ adapter: () => container.adapter() })` written inline in two such route files (`pulls/routes.ts`, `reviews/routes.ts`) is safe to consolidate into one `build<X>Service(container)` factory in the owning module (e.g. `pulls/wiring.ts`) without touching the map — the factory file itself isn't scanned as a route, and `pulls/routes.ts`'s own grandfathered count is untouched because its 3 counted calls live in the route body, not in the service construction that moved out. Evidence: `server/src/modules/pulls/wiring.ts:1`, `server/src/modules/reviews/routes.ts:11`

## Codebase Patterns

- **2026-09-16** — `GET /runs/:id/trace` returns the `run_traces.trace` jsonb as stored, with no zod parse, so a field added to `RunStats` is simply absent on traces written before the change. Declare it `.nullish()` and make the client treat `undefined` like `null` (e.g. `stats.cost_usd` → "—"). Evidence: `server/src/modules/reviews/repository/run.repo.ts:190`, `server/src/vendor/shared/contracts/trace.ts:69`
- **2026-09-16** — `diff -rq server/src/vendor/shared client/src/vendor/shared` is not clean even on `main`: `adapters.ts`, `eval-ci.ts`, `knowledge.ts`, `productionize.ts` and `trace.ts` already differ in comments. After mirroring a contract change, diff the files you touched and ignore that pre-existing comment drift instead of "fixing" it. Evidence: `server/src/vendor/shared/contracts/trace.ts:44`, `client/src/vendor/shared/contracts/trace.ts:44`

## Tool & Library Notes

- **2026-09-22** — dependency-cruiser 17.4.3 rejects a rule whose regex nests quantifiers, e.g. `node_modules/(\.pnpm/[^/]+/node_modules/)?drizzle-orm/`, with `has an unsafe regular expression. Bailing out.`, and rejects `enhancedResolveOptions.extensionAlias` with `must NOT have additional properties`. Neither is needed: a plain `node_modules/(pkg)/` matches pnpm-resolved paths, and TS `.js` imports resolve to `.ts` with only `tsConfig` set. Its exit code is the violation count (3 planted edges → 3, one → 1), so treat any non-zero as a failure. Evidence: `server/.dependency-cruiser.cjs:25`, `server/package.json:11`

- **2026-09-20** — A test whose code resolves its provider from the **shared registry** (`resolveFeatureModel`) must register its `MockLLMProvider` under **every** provider id, not the one the feature defaults to today. Pinning the mock to `openai` and later moving the registry default to `openrouter` routed the scan past the mock into a real, paid OpenRouter call; the test then asserted against whatever the live model returned and failed on the count, with nothing in the output saying a network call had happened. Tests that create their own agent row with an explicit `provider` are not exposed. Evidence: `server/test/conventions.it.test.ts:89`, `server/src/modules/settings/feature-models.ts:51`

- **2026-09-20** — Structured output is where cheap OpenRouter models diverge, and the failures do not look alike. On the conventions extraction (a strict `json_schema` call, ~24k chars of prompt): `google/gemini-2.5-flash` answers `400 Provider returned error` in seconds, `deepseek/deepseek-v4-flash` accepts it and then runs past a 100s budget without returning, and `openai/gpt-4.1-mini` completes in ~12s. Pick a model for a structured feature by trying it, not by price — and keep the failure visible, because a timeout and a schema rejection arrive through completely different paths. Evidence: `server/src/modules/conventions/constants.ts:47`, `server/src/modules/conventions/service.ts:160`

- **2026-09-16** — drizzle's `sum()` helper returns a **string** (`sql\`sum(...)\`.mapWith(String)`), so a money or count total built with it breaks a `z.number()` contract and `toBeCloseTo`. Write the aggregate raw as `sql<number | null>\`sum(${col})\``: postgres-js already returns `double precision` as a number, and drizzle never runs a decoder on `null`, so an all-null sum stays `null` rather than `0`. Evidence: `server/node_modules/drizzle-orm/sql/functions/aggregate.js:17`, `server/src/modules/pulls/routes.ts:137`

## Recurring Errors & Fixes

## Session Notes

- **2026-09-22** — onion-architecture skill v2 plus the `pnpm lint:boundaries` import check (dependency-cruiser, 34 known violations as the baseline) → Tool & Library Notes. Evidence: `server/.dependency-cruiser.cjs:34`

- **2026-09-20** — Conventions Extractor (sample by code → one model call → verify evidence by code → human triage) plus the four API-contract skills → What Doesn't Work, Tool & Library Notes ×2. Evidence: `server/src/modules/conventions/service.ts:1`

- **2026-09-20** — Skills for review agents: skills module, file/archive import, and the query that feeds an agent's prompt → What Doesn't Work. Evidence: `server/src/modules/agents/repository.ts:212`

- **2026-09-16** — Run Cost Badge (persist `agent_runs.cost_usd` + `batch_id`, surface cost on PR list / timeline / trace) → What Doesn't Work, Codebase Patterns; e2e → Recurring Errors & Fixes
  - **2026-09-16** — Refined: the session's main code change, the run cost persisted when a run completes. Evidence: `server/src/modules/reviews/run-executor.ts:253`
- **2026-09-16** — PR-list cost switched to the sum of all completed runs (SQL `SUM … GROUP BY pr_id`), docs/specs written per package → Codebase Patterns, Tool & Library Notes
  - **2026-09-16** — Refined: the session's main code change, the per-PR `sum(cost_usd)` query. Evidence: `server/src/modules/pulls/routes.ts:155`

- **2026-09-25** — Intent Layer (PR motivation → review prompt): `pr_intent` schema extension, `IntentService`, `GET /pulls/:id/intent`, `PullsService.refreshPullDetail` extraction [D6], `uses_intent` per agent [D5], reviewer-core `renderIntentBlock` → What Doesn't Work. Evidence: `server/src/modules/reviews/intent-service.ts:1`

- **2026-09-25** — Intent Layer review-fix iteration (F1 derive gating, F1b hermetic mocks, F2 commit sanitising, F4 malformed-link handling, F5 pure input-hash helper, F7 one `PullsService` factory) → What Doesn't Work (comment). Evidence: `server/src/modules/pulls/wiring.ts:1`

## Open Questions
