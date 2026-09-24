# Analyst E2 — house-rule case construction, no-skills baseline

## Answer

Four new cases were added under `evals/cases/` in Analyst E's harness format, all
built against the real house facts in `research/r3-api-contract-domain.md` §3 and
the actual repo files they cite, all diffs verified to `git apply --check` cleanly
against the real worktree tip. The no-skills arm was run at n=6 on `parasail/fp8`
and `open-inference/fp8` for all four; `deepinfra/fp8` was attempted at n=6 across
all four cases and came back **24/24 (100%) HTTP 429** — per the brief's own
stop condition (more than half rate-limited after the harness's retry/timeout
handling) I stopped using it and did not retry further. Total spend across every
call in this task: **$0.0317** of the $0.30 cap.

**Only one of the four cases clears the pre-registered bar** ("usable for skill
uplift only if the baseline finds it ≤ 1/6 on BOTH providers"):

- **`h-optional-in-llm-schema` qualifies cleanly: 0/6 on both parasail and
  open-inference.** Adding `related_finding_ids` to the `Finding` zod schema with
  `.optional()` instead of `.nullish()`/`.nullable()` — even though `Finding` is
  also the LLM's own strict structured-output schema — was missed by every single
  run on both providers; every response was a clean `approve`. This is the
  cleanest confirmation in this whole investigation of research finding #6 (a
  fact about OpenAI/OpenRouter structured-output semantics applied to this
  repo's specific schema is genuinely un-inferable from the diff, which just
  looks like a normal additive, backward-compatible field).
- **`h-mirror-one-side` is a near-miss, not a clean qualifier**: open-inference
  misses cleanly (0/6), but parasail found the mirror-drift 2/6 times (both
  grounded, both genuinely about the missing client copy — "Client copy of
  shared contract not updated"). 2/6 is above the ≤1/6 bar, so by the letter of
  the pre-registration this case does not qualify, though it's far from a
  "catches" rate (≥5/6) either — there may still be room to show uplift, just
  not from a clean 0-baseline.
- **`h-get-sync-moved` and `h-camelcase-field` are already caught at high rates
  by BOTH providers and do not qualify** — see "Baseline surprises" below for
  why, including one genuine construction bug I found and fixed mid-task.

## Construction proof

These cases reuse Analyst E's already-verified harness mechanism unchanged — same
`assemblePrompt` import, same no-repo-map/no-callers construction for non-verify
runs, same `run.ts run` command, same `review_schema.json` and pinned-provider
OpenRouter call. I re-ran `run.ts verify` before touching anything and it still
passes both arms:
```
[all5]     rebuilt user md5: efe2022466b3f37b599e4cb3147db454 expected: ... PASS
[no-skills] rebuilt user md5: 9e5e904263dbd110be65fbee12c77b0a expected: ... PASS
PASS — both arms verified
```
That check validates the prompt-assembly mechanism itself (which does not change
per case); the new-case-specific proof is that every `diff.patch` applies to the
real files at the repo tip. I built each diff by copying the real file(s) into a
scratch git repo (`casebuild/<id>/`, one per case), editing them, and taking
`git diff` (so hunk headers, `diff --git a/... b/...` lines, and context lines
are byte-real, not hand-typed), then confirmed:
```
$ git apply --check evals/cases/h-mirror-one-side/diff.patch        -> OK
$ git apply --check evals/cases/h-optional-in-llm-schema/diff.patch -> OK
$ git apply --check evals/cases/h-get-sync-moved/diff.patch         -> OK
$ git apply --check evals/cases/h-camelcase-field/diff.patch        -> OK
```
run from the actual worktree root (read-only check, nothing applied to the repo).
Each `found_regex` was also unit-tested against one synthetic true-positive and
one synthetic true-negative finding text before spending any OpenRouter budget
on it (all four discriminated correctly), and every regex match reported below
was additionally spot-checked by reading the actual `matched_title` — none are
regex coincidences.

## What each case is and where its house fact comes from

1. **`h-mirror-one-side`** — adds `merge_conflict: z.boolean().nullish()` to
   `PrMeta` in `server/src/vendor/shared/contracts/platform.ts` only, no edit to
   `client/src/vendor/shared/contracts/platform.ts`. Contrast case to the
   existing `clean-optional-field` (which mirrors both sides and must stay
   unflagged). House fact: `.claude/rules/shared-contracts.md` — the two copies
   are hand-mirrored with no sync script.
2. **`h-optional-in-llm-schema`** — adds `related_finding_ids:
   z.array(z.string()).optional()` to `Finding`, identically mirrored on both
   server and client (so mirror-drift is not in play). House fact:
   `.claude/rules/shared-contracts.md` — `Finding`/`Review` are sent to the LLM
   with `strict: true`, under which `.optional()` silently becomes required.
3. **`h-get-sync-moved`** — splits the GitHub sync out of `GET /pulls/:id`
   (`server/src/modules/pulls/routes.ts`) into a new explicit
   `POST /pulls/:id/refresh`, reusing the file's own `resolvePrAndRepo` helper;
   client gets a `useRefreshPull` mutation hook and a "Refresh" button in
   `PrDetailHeader.tsx`. House facts: `server/AGENTS.md` /
   `client/AGENTS.md` gotchas and `.claude/rules/review-runs.md` ("`pr_files` is
   rewritten by `GET /pulls/:id`... A PR never opened in the UI can have no
   patches").
4. **`h-camelcase-field`** — adds `reviewUrl: z.string().nullish()` to `PrMeta`
   (both copies, mirrored) and populates it inline in the `GET /repos/:id/pulls`
   handler's `rows.map()`, alongside existing snake_case siblings
   (`head_sha`, `files_count`, `cost_usd`, ...). House fact: root `CLAUDE.md` —
   JSON fields are snake_case, mapped through a helper, not inline.

## Results table (no-skills arm, n=6 requested per cell)

| Case | Provider | ok/attempts | found | blocks | grounded (of found) | verdicts | median prompt tok |
|---|---|---|---|---|---|---|---|
| h-mirror-one-side | parasail/fp8 | 6/6 | 2/6 | 0/6 | 2/2 | comment×5, approve×1 | 1313 |
| h-mirror-one-side | open-inference/fp8 | 6/6 | 0/6 | 0/6 | n/a | approve×6 | 1313 |
| h-mirror-one-side | deepinfra/fp8 | 0/6 | — | — | — | all HTTP 429 | — |
| h-optional-in-llm-schema | parasail/fp8 | 6/6 | **0/6** | 0/6 | n/a | approve×6 | 1505 |
| h-optional-in-llm-schema | open-inference/fp8 | 6/6 | **0/6** | 0/6 | n/a | approve×6 | 1505 |
| h-optional-in-llm-schema | deepinfra/fp8 | 0/6 | — | — | — | all HTTP 429 | — |
| h-get-sync-moved (pre-fix desc.) | parasail/fp8 | 6/6 | 6/6 | 4/6 | 6/6 | comment×2, request_changes×4 | 3561 |
| h-get-sync-moved (pre-fix desc.) | open-inference/fp8 | 8/9¹ | 5/8 | 5/8 | 5/5 | request_changes×8 | 4888 |
| h-get-sync-moved (**hint removed**, re-run) | parasail/fp8 | 4/6² | 4/4 | 1/4 | 4/4 | comment×3, request_changes×1 | ~3560 |
| h-get-sync-moved (**hint removed**, re-run) | open-inference/fp8 | 6/6 | 5/6 | 5/6 | 5/5 | request_changes×6 | ~4880 |
| h-get-sync-moved | deepinfra/fp8 | 0/6 | — | — | — | all HTTP 429 | — |
| h-camelcase-field | parasail/fp8 | 6/6 | 6/6 | 0/6 | 6/6 | comment×6 | 1713 |
| h-camelcase-field | open-inference/fp8 | 6/6 | 4/6 | 1/6 | 4/4 | comment×4, approve×1, request_changes×1 | 1713 |
| h-camelcase-field | deepinfra/fp8 | 0/6 | — | — | — | all HTTP 429 | — |

¹ 6 requested + 1 `AbortError` (150s wall-clock timeout, not a rate limit) + 3
topped up via `run.ts topup --target 6`, giving 8 usable samples instead of 6.
² 6 requested, 2 `AbortError` timeouts, not topped up (direction was already
unambiguous; see "What I did not check").

Grounding: every finding that matched a case's `found_regex` on parasail was
grounded to the real diff hunk in every case; open-inference's `h-get-sync-moved`
and `h-camelcase-field` hits were also grounded this time (contrast with Analyst
E's report, where open-inference's citations on the four F-cases were mostly
`start_line:1`/wrong-file — this batch it correctly cited
`server/src/modules/pulls/routes.ts:203-289/290` and
`{server,client}/src/vendor/shared/contracts/platform.ts:180-182`).

Representative quoted findings (one per qualifying/near-miss/surprising case):

- `h-mirror-one-side`, parasail rep 4: **"Client copy of shared contract not
  updated"** — genuinely about the missing client-side `merge_conflict` field.
- `h-optional-in-llm-schema`: no finding on either provider ever mentioned
  `.optional()`/`.nullish()`/strict-schema semantics at all — every single
  response was a clean `approve` with no findings.
- `h-get-sync-moved` (hint removed), open-inference rep 4: **"New POST
  /pulls/:id/refresh route is not registered — the diff only rewrites the GET
  handler, so the client's refresh call will 404 and the GET no longer
  refreshes."** — this is actually a misreading of the diff (the POST route IS
  registered in the real diff, `app.post('/pulls/:id/refresh', ...)`), but it
  still correctly identifies and blocks on the underlying behavior change.
- `h-get-sync-moved` (hint removed), parasail rep 2: **"GET /pulls/:id no
  longer refreshes from GitHub – behavioral contract change"** — general
  "this is an observable behavior change" reasoning, not a citation of any
  repo-specific fact about who depends on it.
- `h-camelcase-field`, open-inference rep 3 (the one CRITICAL/blocks hit):
  **"New field `reviewUrl` violates the snake_case contract convention and will
  be rejected by strict clients"** — genuinely about casing, though the "will be
  rejected by strict clients" clause is a confabulated mechanism (nothing in
  this repo actually rejects unknown casing).

## Baseline surprises (reported, not tuned away)

1. **I found and fixed a real construction bug in my own `h-get-sync-moved`
   description.** My first draft said "Click it after force-pushing or right
   before running a review on a PR you haven't opened in a while" — that
   sentence directly hands the model the exact house fact (that a review
   depends on a fresh sync) instead of leaving it to be inferred, which
   violates the task's "no hint at the defect" requirement. I caught this on my
   own before writing this report, rewrote the sentence to "Click it whenever
   you think something changed on GitHub's side" (no mention of reviews or any
   downstream consumer), and **re-ran both providers from scratch**. The catch
   rate dropped somewhat (parasail's blocks: 4/6 → 1/4; found stayed high) but
   did **not** collapse — both providers still find it at ≥4/6-equivalent
   rates even with the hint gone. I'm reporting the corrected numbers as the
   real result and flagging the pre-fix numbers only for transparency; this is
   a fixed construction bug, not a tuned-away finding.
2. **`h-get-sync-moved` doesn't need the hidden repo fact to get caught, because
   the removal is visible in the diff itself.** A unified diff always shows the
   deleted `container.github()` call and DB writes as `-` lines directly above
   the new pure-read `+` lines — a reasoning model doesn't need to know that
   `pr_files` feeds the review pipeline (the actual un-inferable fact in
   `.claude/rules/review-runs.md`) to say "you removed a side effect from a GET
   handler, that's an observable behavior change, flag it." Every quoted
   parasail title is exactly this generic framing, not a citation of e2e/CI/the
   review pipeline specifically. This is a genuine limitation of trying to test
   a "semantics" house fact (catalogue row 18 in `r3-api-contract-domain.md`)
   via a diff-based fixture: if the defect requires deleting old behavior, the
   deletion itself is a visible signal, independent of whether the model knows
   *why* it matters.
3. **`h-camelcase-field` is caught because the diff's own context lines expose
   the convention**, not because of any hidden fact. `git diff`'s 3-line
   context window around the new `reviewUrl` field shows `cost_usd` and
   `latest_findings` immediately above it — the inconsistency is directly
   visible without knowing this repo's specific JSON-casing convention, just
   generic "match your neighbors" code-review instinct. Parasail (reasoning)
   catches it 6/6; open-inference (non-reasoning) still catches it 4/6. This
   matches this repo's own research doc's caution that a house fact must be
   genuinely invisible in the diff, not just undocumented in prose.
4. **`deepinfra/fp8` was 100% rate-limited for every one of the 24 attempts**
   across all four cases (6 each) — consistent with Analyst E's report from the
   same session window. I did not retry past the single n=6 attempt per the
   brief's explicit stop condition.

## What I did not check

- I did not top up `h-get-sync-moved`'s post-fix parasail cell past 4/6 (two
  timeouts) — the direction (high catch rate, doesn't qualify) was already
  unambiguous from 4/4 successful + the pre-fix 6/6, and chasing 2 more calls
  had low value against the time budget.
- I did not investigate why open-inference's `h-get-sync-moved` rep 4 claimed
  the new POST route "is not registered" when it is — flagged as a
  confabulation in the quotes above, not investigated further.
- I did not test any skills arm — the brief for this task was no-skills only.
  `h-optional-in-llm-schema` (and, with the caveat above, `h-mirror-one-side`)
  are the two candidates I'd hand to whoever builds the skill next.
- I did not re-verify `git apply --check` after generating each diff a second
  time (only once, right after construction) — no repo files were touched
  again afterward, so this should still hold, but I didn't re-run the check as
  a final step.
- I did not check whether `h-get-sync-moved`'s diff would pass the real
  `reviewer-core/src/grounding.ts` (only the same hunk-range re-implementation
  Analyst E used, inherited unchanged from `run.ts`).
