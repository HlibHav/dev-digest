# Brainstorm Brief: tell the reviewer a PR is too big, and how to split it
Status: needs-answers

## What exists
- `buildSmartDiff` already computes `total_lines = Σ(additions + deletions)` over all files but hard-codes `too_big: false, proposed_splits: []` (`server/src/modules/smart-diff/service.ts:60-69`). The contract has room for this without a change: `split_suggestion { too_big, total_lines, proposed_splits: ProposedSplit[] }`, and `ProposedSplit` is `{ name, files[] }` (`server/src/vendor/shared/contracts/brief.ts:142-155`). The Smart Diff brief made "no model call when Smart Diff is viewed" an acceptance criterion (`docs/homework-3/brief.md:53-54`), and `server/test/smart-diff-build.test.ts:49-55` pins `total_lines === 222` and `too_big === false`.
- The client already has a size threshold. The PR list buckets S/M/L at `< 100` / `< 400` / `≥ 400` changed lines, counting every file including lock files (`client/src/app/repos/[repoId]/pulls/constants.ts:30-31`, `client/src/app/repos/[repoId]/pulls/helpers.ts:4-8`). The banner strings exist but nothing renders them: `smartDiff.largeTitle` "This PR is large ({lines} changed lines)" and `smartDiff.largeBody`, which ends with a colon and so expects a list after it (`client/messages/en/prReview.json:69-70`).
- `DiffTab` already fetches `useSmartDiff(prId)` and joins `groups[].files[].path` back to `pr.files` by path (`client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx:39,102-111`), so per-split line counts can be computed client-side. `@devdigest/ui` has no Banner or Callout primitive, only `Card` (`client/src/vendor/ui/primitives/index.ts:15`). Adding `useTranslations` to shared `diff-viewer` breaks existing `DiffViewer` tests silently (`client/INSIGHTS.md:21`).

## Problem
A reviewer opens a 1,500-line PR on the Files changed tab. They get five role groups and no signal that the PR is too large to review well, and nothing they could send back to the author. The simplest useful version: once a PR passes a line threshold, a banner above the diff says so, and when the files fall into separate areas it lists 2–5 suggested PRs (each with a name and its files) that the reviewer can paste into a comment to the author. It is computed from paths and line counts only, so it is free, instant, and available before any review runs.

## Question for the user
What should one "proposed split" be?
  a) **An area of the codebase, by directory, with no model** (tests, docs and config go with the code they belong to). Deterministic and free, and it fits the no-model rule. It can't see intent: two unrelated changes in one directory stay together.
  b) **One Smart Diff role group per PR** (core / tests / wiring / …). Takes a few lines of code, but it tells authors to ship code without its tests, which is advice a reviewer shouldn't give.
  c) **A semantic split from an LLM, via an on-demand "Suggest a split" button.** Best quality: it can split by concern, not directory. It costs money per click, needs its own endpoint, timeout and guardrails, and can't be part of the Smart Diff GET.
  d) **Warning only for now, no splits.** The smallest option. `proposed_splits` stays `[]` and the banner shows only the title.

## Approaches
### A. Deterministic area splits inside `buildSmartDiff` (answer a)
- how: A pure `proposeSplits(files)` groups `core` files into areas. Strip the longest common directory prefix of the core files; the area key is that prefix plus the next directory segment, and a directory path is used as the split `name` (data, never a sentence). Each tests/wiring/docs/boilerplate file joins the area whose last segment appears in its path, otherwise the largest area. Cap at `MAX_SPLITS`. `too_big` = non-boilerplate lines ≥ `SPLIT_THRESHOLD_LINES`, and `proposed_splits` is filled only when `too_big` and there are ≥ 2 areas.
- touches: server → domain: new `server/src/modules/smart-diff/split.ts` (pure, next to `classify.ts`), `constants.ts` (threshold, cap), one call in `service.ts` `buildSmartDiff`. No route, port, repository or contract change. client → route-local `DiffTab/_components/SplitSuggestion/` (component + `helpers.ts` for per-split line totals + test), rendered by `DiffTab` above `DiffViewer`. Strings from the existing `smartDiff.largeTitle` / `largeBody` / `filesCount`.
- pros: No model, no cost, works before a review. Zero contract or schema change, the same pure-function-plus-table-test shape as the classifier, one small server file and one small client folder.
- cons: A directory is a proxy for a concern. A 2,000-line refactor inside one directory gets the warning but no splits.
- riskiest part: The area heuristic on repos other than DevDigest (DevDigest reviews any GitHub repo). It needs a path → split test table with at least one foreign layout (e.g. a flat `src/`, a Python `pkg/` + `tests/`), and hard invariants: every file lands in exactly one split, and one area means `[]`.

### B. Role-group splits (answer b)
- how: When `too_big`, `proposed_splits = groups.map(g => ({ name: g.role, files }))`.
- touches: server → `service.ts` only; client → the same `SplitSuggestion` component.
- pros: About ten lines, fully predictable, reuses `classifyFile`.
- cons: It recommends separating code from tests and config from the code that needs it. Each resulting PR is unreviewable or unmergeable on its own, so it's bad advice with DevDigest's name on it.
- riskiest part: Reviewers pass it on to authors verbatim.

### C. LLM-proposed splits on demand (answer c)
- how: `POST /pulls/:id/split-suggestion` sends paths, line counts, role and (if present) the derived intent to a model with a strict `json_schema`. Code then drops any file not in the PR, adds missing files to a remainder split, and returns `ProposedSplit[]`. Smart Diff's GET keeps only the deterministic `too_big`.
- touches: server → new route + service method in `smart-diff` (or its own module), the LLM through `container` / `resolveFeatureModel`, a feature-model entry in `settings/feature-models.ts`, a mock in tests. client → a mutation hook in `lib/hooks/reviews.ts`, a button + result in `SplitSuggestion`. Follows the pattern of the recent intent re-derive (`server/src/modules/reviews/intent-service.ts`).
- pros: Splits by concern, can name splits meaningfully, and can use PR intent.
- cons: Paid and slow per click, not cached unless a DB column is added, and model-written split names are English prose that bypasses next-intl.
- riskiest part: The model inventing or dropping files (the server INSIGHTS already records schema-valid but invented content, `server/INSIGHTS.md:36`), and the timeout/retry handling that INSIGHTS says has taken the API process down before (`server/INSIGHTS.md:17`).

## Leave out
- Creating branches or PRs on GitHub from a split: the idea is to advise the reviewer, not to act on the repo.
- Persisting suggestions in the DB, and any schema change: approach A is recomputed on every GET for free.
- A settings UI for the threshold: a constant is enough until someone asks to tune it.
- A file-count threshold in addition to lines: one signal is enough for v1.
- Changing the PR list's S/M/L badge, or showing the banner anywhere but Files changed.
- `pseudocode_summary` and any other Smart Diff fields.

## Recommendation
A. It fills a slot the contract already reserves, with no contract, schema or model change, and it keeps the property the Smart Diff homework was built around: pure path classification with no model call on view (`docs/homework-3/brief.md:53-54`). It reuses the pure-function-plus-table-test shape of `classify.ts`, and the client already has the strings and the path join. If directory splits turn out too coarse in practice, C can be added later as a button on top of A's banner without undoing anything.

## Request for the planner
Fill Smart Diff's `split_suggestion` with a deterministic "too big" flag and directory-based split proposals, and show them on the Files changed tab.

Behaviour
- Server, in `server/src/modules/smart-diff/`: add `SPLIT_THRESHOLD_LINES = 400` and `MAX_SPLITS = 5` to `constants.ts`. Add a pure `split.ts` with `proposeSplits(files)` (no HTTP, no DB, no model). `buildSmartDiff` sets `too_big` = the sum of additions + deletions over non-`boilerplate` files ≥ `SPLIT_THRESHOLD_LINES`, and fills `proposed_splits` from `proposeSplits` only when `too_big`. `total_lines` keeps its current meaning (sum over all files).
- Area rule: take the `core` files, strip their longest common directory prefix, and make the area key the prefix plus the next directory segment. A split's `name` is that directory path (data, not prose); files at the repo root use `.`. Every non-core file joins the area whose last path segment appears in the file's path, otherwise the area with the most changed lines. If there are more than `MAX_SPLITS` areas, the smallest are merged into the last split. If the rule yields fewer than 2 areas, `proposed_splits` is `[]`.
- Client: a route-local `SplitSuggestion` component at `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/SplitSuggestion/` (plus `helpers.ts` and a test), rendered by `DiffTab` above `DiffViewer` in both Smart and Original order, only when `smartDiff.split_suggestion.too_big`. It shows `smartDiff.largeTitle` with `total_lines`. `largeBody` and the list render only when `proposed_splits` is non-empty. Each split shows its `name`, `smartDiff.filesCount` and its line total (joined from `pr.files` by path), and can be expanded to list its files. Not in shared `diff-viewer`.

Acceptance criteria
1. `SmartDiff.parse(buildSmartDiff(...))` succeeds for a too-big PR with splits.
2. Invariant tests: `too_big === false` ⇒ `proposed_splits` is `[]`. When `proposed_splits` is non-empty, every input file appears in exactly one split and no split has zero files.
3. A 1,000-line change to `pnpm-lock.yaml` plus 50 lines of code is not `too_big`. 400 non-boilerplate lines is.
4. A path → split table test covers: this repo's layout (server module + its `server/test/*` test + client component + `client/messages` → at least a server split and a client split, with the test in the server split); a flat `src/` + `tests/` layout from another repo; a single-directory PR (warning, `proposed_splits: []`); more than `MAX_SPLITS` areas (capped at 5).
5. The existing `server/test/smart-diff-build.test.ts` stays green unchanged (`total_lines` 222, `too_big` false).
6. `DiffTab` renders no banner when `too_big` is false. It renders title only when `too_big` and there are no splits, and title + body + one row per split otherwise. `DiffTab.test.tsx` fixtures include `split_suggestion`.
7. No new model call and no new DB query on `GET /pulls/:id/smart-diff`. `pnpm lint:boundaries` and `route-adapter-calls.test.ts` stay green without touching their baselines.
8. Checks: `server/` typecheck + unit + `lint:boundaries`, `client/` typecheck + test.

Out of scope: contract changes to `brief.ts` (either copy), DB schema, LLM calls, GitHub actions from a split (branches, PRs, comments), a threshold setting UI, file-count thresholds, changes to the PR list badge, `pseudocode_summary`.

## Open questions
- Should `too_big` exclude `boilerplate` lines? — default assumed: yes, so a lockfile bump isn't "too big". The consequence is that the PR list can show `L` (counts all lines, `pulls/constants.ts:30-31`) with no banner on the PR page. Accepted for v1; unify later if it confuses anyone.
- The threshold value. — default assumed: 400, matching the list's `L` bucket. Whether review quality really drops past ~400 LOC is an external fact → run `researcher` if the number needs a citation.
- Where leftover tests/docs/config files with no matching area go. — default assumed: the largest area (they ship with the main change). The alternative is a separate `.` split.
- `MAX_SPLITS` value. — default assumed: 5. More than that stops being a suggestion.
- The banner title shows `total_lines` including boilerplate while `too_big` excludes it. — default assumed: keep `total_lines` as is (it's pinned by a test and already in the contract). Add a `reviewable_lines` field only if the mismatch reads badly in the demo.
- Should the banner also appear on the Agent runs tab or the PR header? — default assumed: no, Files changed only.
