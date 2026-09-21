# Analyst F — API Contract Reviewer fixture pre-screen

## Answer

None of the three candidates shows "misses without skills, catches with skills" on all
three providers. The closest is **F2** (a new client API helper that bypasses `ApiError`
normalization): it **misses cleanly without skills on all three providers** (found 0/6 on
deepinfra/fp8, parasail/fp8, and open-inference/fp8), but it **only catches with skills on
one of the three, parasail/fp8** (found 6/6, all WARNING severity, **blocks 0/6** — found
but never CRITICAL, exactly the pattern expected of a warning-level rule). On deepinfra/fp8
and open-inference/fp8 the all-five-skills arm still misses it entirely (0/6 each), so F2
does not generalize across the app's unpinned routing. Practically: F2 cannot serve as the
demo fixture as-is — the app runs unpinned, and among just the three providers tested here an
unpinned run has roughly 1-in-3 odds (1-in-2 among the two "clean" providers, deepinfra and
parasail, per the brief's own background) of landing somewhere the all-skills arm finds
nothing either.

**F1** (a `needs_discussion` member added to the shared `Verdict` enum, mirrored in `server`
only) fails outright: on parasail/fp8 the **no-skills** baseline already finds *and blocks*
the defect 6/6 (CRITICAL, `request_changes` every time) — general reasoning alone infers
"you extended a shared enum and nothing else in the diff touches a consumer" without needing
the skill. Skills do have a real, secondary effect here: they correctly recalibrate severity
down to WARNING (matching `response-schema`'s own rubric — "warning: … a server/client mirror
drift"), which is a calibration improvement, not a detection uplift. On open-inference/fp8 the
all-skills arm's raw "found" rate is 5/6, but every one of those findings cites
`start_line: 1, end_line: 1` — ungrounded, so all five would be **dropped by the app's real
grounding gate** and effectively count as zero in production. On deepinfra/fp8 both arms miss
it entirely (0/6 each).

**F3** (a new client hook that calls `res.json()` against an endpoint that explicitly returns
204) was **dropped at n = 4 per the pre-registered rule**: the no-skills arm already found it
≥3/4 on all three providers (4/4, 4/4, 4/4), not just two, so it was not topped up to n = 6.
The reason is structural, not a fixable wording problem: "`res.json()` on an empty/204 body
throws a `SyntaxError`" is general JavaScript knowledge, independent of the
`repo-conventions` skill's specific 204-handling rule. An earlier, more ambiguous version of
the same fixture (no server-side diff showing the route returns 204, so the model could not be
sure of the response shape) was **missed by both arms** on deepinfra/fp8 — see "Two F3 variants"
below. Making the defect certain enough to grade also made it generic-knowledge-catchable; the
two pulls work against each other for this specific rule.

Total spend: **$0.0502** of the $0.30 cap, across 112 pinned OpenRouter calls (16 exploratory/
smoke calls + 72 for the n = 4 matrix + 24 topping F1/F2 up to n = 6; F3 stayed at n = 4 since
it was dropped, not topped up).

## Prompt construction — proof

Read all five skill bodies from the dev DB (`agent_skills` ordered by `"order"` for agent
`3291d6c0-241b-4d8d-9a14-fbf3d2f6bdb0`): `breaking-change`, `response-schema`,
`semver-discipline`, `deprecation-policy` (imported, rendered inside an `<untrusted>` block per
`renderSkillsBlock`), `repo-conventions`. Confirmed the two response-schema facts and the two
repo-conventions facts quoted in the brief verbatim, plus the severity rubrics.

Re-implemented `wrapUntrusted` / `renderSkillsBlock` / `assemblePrompt`'s user-section join
(`reviewer-core/src/prompt.ts`) in Python (`assemble.py`), extracting the raw, unwrapped `task`,
`pr_description`, `skills_block`, `repo_map`, `callers`, and `diff` pieces out of the real
`prompt_all5.json` / `prompt_no_skills.json` (PR #8, exactly as the app sent them), then
rebuilding the user message from those pieces.

**Proof passed exactly**: rebuilding with PR #8's own description/diff (repo map and callers
included) reproduced both prompts byte-for-byte —
`md5(rebuilt_all5.user) = efe2022466b3f37b599e4cb3147db454` (matches the value given in the
brief) and `md5(rebuilt_no_skills.user) = 9e5e904263dbd110be65fbee12c77b0a` (matches the
original file). Only after that match did I drop the repo-map and callers sections and
substitute the three candidates' descriptions and diffs. `system` is byte-identical between the
two source prompts (md5 `0353de0b1c7cc59311f15c1edc625e17`) and is reused unchanged for every arm.

**Known limitation of this construction, by the brief's own instruction**: "replace ONLY the
PR description and diff sections" means the **task line keeps PR #8's own title**,
`"refactor(agents): tidy the agents module and add an optional tag"`, even though none of my
three candidates are refactors and none share that title. This is a real mismatch between the
task line and the substituted content in every prompt I sent. I checked for the specific
`semver-discipline` risk this creates — its "Do not flag: an internal refactor … is a patch"
exemption firing on the stray word "refactor" — by grepping all 112 summaries for the word;
it appears once (`F2_noskills#1`, parasail/fp8), as a generic "no skills were provided, falling
back to general judgment" disclaimer, not an invoked refactor exemption. I did not find evidence
this confound changed an outcome, but I did not run a controlled A/B on the task line itself, so
I can't rule out a smaller effect.

The six prompts are saved as `prompt_F_F1_noskills.json`, `prompt_F_F1_all5.json`,
`prompt_F_F2_noskills.json`, `prompt_F_F2_all5.json`, `prompt_F_F3_noskills.json`,
`prompt_F_F3_all5.json` in this scratchpad. Per instruction, the repo map and callers sections
are omitted from all of them; **a real app run against these files would include repo-map/callers
context for the newly touched files**, which I did not attempt to reconstruct.

## Candidates

### F1 — mirror drift (`Verdict` enum)

A real, small, non-refactor feature: add a fourth verdict, `needs_discussion`, to
`server/src/vendor/shared/contracts/findings.ts`'s `Verdict` enum, and update the map-reduce
severity ranking in `reviewer-core/src/review/reduce.ts` — **with no matching edit to
`client/src/vendor/shared/contracts/findings.ts`**. Chosen because it's exactly the shape the
brief asked for (new enum member, not a removed/renamed/retyped field, not an optional field
added to a response) and because the client actually consumes `Verdict` non-trivially
(`VerdictBanner`'s `VERDICT_META[verdict] ?? VERDICT_META.comment` — a `needs_discussion`
review would silently render as a neutral "comment" banner with the wrong color/icon, which
could read as "nothing to worry about" on a review that the agent meant as a flag). Result:
disqualified because parasail/fp8's no-skills baseline already infers the drift from general
reasoning about shared types, at CRITICAL severity.

### F2 — error-normalization bypass (best candidate)

**Description** (as sent, framed as a normal feature PR, no hint at the defect):

> Add CSV export for a PR's findings
>
> Reviewers who want to triage findings outside the studio — pasting them into a spreadsheet
> for a stakeholder without studio access, or running their own filters — currently have no
> way to get them out of the UI except copy-paste per card.
>
> This adds a small "Export CSV" action next to the existing severity filters in the findings
> panel. Clicking it fetches the PR's findings as CSV from the new
> `/pulls/:prId/findings.csv` endpoint and triggers a browser download. Kept it as a plain
> `fetch` since the response is a file blob, not JSON, so it doesn't go through the usual
> typed hooks.

**Diff** (against `client/src/lib/api.ts` and `FindingsPanel.tsx` at repo tip):

```diff
diff --git a/client/src/lib/api.ts b/client/src/lib/api.ts
--- a/client/src/lib/api.ts
+++ b/client/src/lib/api.ts
@@ -71,3 +71,11 @@ export const api = {
   patch: <T>(path: string, body?: unknown) =>
     apiFetch<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
   del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
 };
+
+/** Export a PR's findings as CSV for use outside the studio. */
+export async function downloadFindingsCsv(prId: string): Promise<Blob> {
+  const res = await fetch(`${API_BASE}/pulls/${prId}/findings.csv`);
+  if (!res.ok) {
+    throw new Error(`Export failed: ${res.status} ${res.statusText}`);
+  }
+  return res.blob();
+}
diff --git a/client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx b/client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx
--- a/client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx
+++ b/client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx
@@ -6,6 +6,7 @@ import React from "react";
 import { useTranslations } from "next-intl";
 import { Toggle, EmptyState, Chip, SEV } from "@devdigest/ui";
 import type { FindingRecord, Severity } from "@devdigest/shared";
+import { downloadFindingsCsv } from "../../../../../../../lib/api";
 import { FindingCard } from "../FindingCard";
 import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
 import { KEY_TO_ACTION, SEVERITY_FILTERS } from "./constants";
@@ -85,6 +86,17 @@ export function FindingsPanel({
         <div style={s.toggleGroup}>
           {t("panel.hideLowConfidence")}
           <Toggle on={hideLow} onChange={changeHideLow} size={16} />
+          <button
+            type="button"
+            onClick={async () => {
+              const blob = await downloadFindingsCsv(prId);
+              const url = URL.createObjectURL(blob);
+              const a = document.createElement("a");
+              a.href = url;
+              a.download = `findings-${prId}.csv`;
+              a.click();
+              URL.revokeObjectURL(url);
+            }}
+          >
+            {t("panel.exportCsv")}
+          </button>
         </div>
       </div>
 
```

The defect: on a non-2xx response this throws a plain `Error` instead of the app's `ApiError`
(status/code/details), the exact convention `repo-conventions` names at `client/src/lib/api.ts:50`.
A caller that expects `ApiError` (e.g. code that branches on `.status` for toast/inline/
full-screen error UX, per `client/CLAUDE.md`) gets an untyped error instead.

**What a real PR would still need**: the server-side `GET /pulls/:id/findings.csv` route itself
(not in this diff — it doesn't exist yet, which is why the no-skills arm's *other*, off-target
finding on some runs was "endpoint doesn't exist" rather than the error-normalization issue);
the `panel.exportCsv` i18n key in `client/messages/en/*.json` (client convention: new
user-facing strings go through `next-intl`); a unit test for `downloadFindingsCsv`
(client package convention: colocated `.test.ts`); and — to actually fix the planted defect —
routing the non-2xx branch through `ApiError` (or extending `apiFetch` to support a `blob`
response mode) before merge. CI (client typecheck + `pnpm test`, server typecheck) would need
to be green; none of that was run since this is a fixture, never applied to the repo.

### F3 — 204 handling (dropped)

Two variants were tried:

1. **Ambiguous** (client-only diff, no server route shown): a new `useDismissAllSuggestions`
   hook posts to `/pulls/:id/findings/dismiss-suggestions` and calls `res.json()`
   unconditionally. Smoke-tested at n = 1 on deepinfra/fp8: **both** arms missed the specific
   204/`res.json()` issue — no-skills hallucinated "server route doesn't exist" (true, since
   the diff has no server change) and "no response-status check" (generic); all-skills found
   "bypasses the API fetch wrapper" but framed it as the *error-normalization* rule (F2's
   rule), not the 204 rule. Neither arm was ever confident the endpoint returns 204, because
   nothing in the diff said so.
2. **Explicit** (adds the server route with `reply.code(204)`): removes that ambiguity, but
   then "calling `.json()` on a body-less response throws" is plain JavaScript knowledge — no
   skill needed. This is the version that was formally run and dropped per the pre-registered
   rule (found ≥3/4 without skills on all three providers at n = 4).

I did not find a middle ground that keeps the defect certain and repo-specific at the same
time; I don't think one exists for this exact rule, because the rule itself
("`apiFetch` returns undefined for 204") is a thin wrapper around a fact any capable model
already knows once it's sure the response is empty.

## Results table (n, found = about the planted defect per a manual title/rationale read,
blocks = found AND ≥1 CRITICAL among those findings, median prompt tokens, citation grounding
= cited (file, line-range) intersects a real diff hunk)

| Candidate | Arm | Provider | n | Found | Blocks | Verdicts (n) | Median prompt tok | Grounded citations |
|---|---|---|---|---|---|---|---|---|
| F1 | no-skills | deepinfra/fp8 | 6 | 0/6 | 0/6 | approve×6 | 1496 | n/a |
| F1 | all5 | deepinfra/fp8 | 6 | 0/6 | 0/6 | approve×6 | 3478 | n/a |
| F1 | no-skills | parasail/fp8 | 6 | 6/6 | 6/6 | request_changes×6 | 1496 | 6/6 (findings.ts:26) |
| F1 | all5 | parasail/fp8 | 6 | 6/6 | 1/6 | comment×5, request_changes×1 | 3478 | 9/9 |
| F1 | no-skills | open-inference/fp8 | 6 | 4/6 | 1/6 | comment×5, request_changes×1 | 1496 | 4/4 |
| F1 | all5 | open-inference/fp8 | 6 | 5/6 | 0/6 | comment×6 | 4805 | **0/5 — all cite `start_line:1,end_line:1`, would be dropped by the app's grounding gate** |
| F2 | no-skills | deepinfra/fp8 | 6 | 0/6 | 0/6 | approve×6 | 1753 | n/a |
| F2 | all5 | deepinfra/fp8 | 6 | 0/6 | 0/6 | approve×5, ERROR×1 (HTTP 429, excluded) | 3735 | n/a |
| F2 | no-skills | parasail/fp8 | 6 | 0/6 | 0/6 | request_changes×1, approve×3, comment×2 | 1753 | n/a |
| F2 | all5 | parasail/fp8 | 6 | **6/6** | **0/6** | request_changes×4, comment×2 | 3735 | 7/7 (api.ts:74–81) |
| F2 | no-skills | open-inference/fp8 | 6 | 0/6 | 0/6 | comment×4, request_changes×2 | 1753 | n/a |
| F2 | all5 | open-inference/fp8 | 6 | 0/6 | 0/6 | approve×6 | 5062 | n/a |
| F3 (dropped, n=4 only) | no-skills | deepinfra/fp8 | 4 | 4/4 | 0/4 | comment×4 | 2192 | 4/4 |
| F3 | all5 | deepinfra/fp8 | 4 | 3/4 | 0/4 | ERROR×1 (HTTP 429), comment×3 | 4174 | 3/3 |
| F3 | no-skills | parasail/fp8 | 4 | 4/4 | 3/4 | request_changes×3, comment×1 | 2192 | 4/4 |
| F3 | all5 | parasail/fp8 | 4 | 3/4 | 1/4 | comment×2, approve×1, request_changes×1 | 4174 | 3/3 |
| F3 | no-skills | open-inference/fp8 | 4 | 4/4 | 4/4 | request_changes×4 | 2192 | 5/5 |
| F3 | all5 | open-inference/fp8 | 4 | 0/4 | 0/4 | approve×4 | 5501 | n/a |

Two HTTP 429 (rate-limited-upstream) errors landed in the deepinfra/fp8 columns (F2 all5 rep 6,
F3 all5 rep 1); both are counted in `n` but excluded from `found`/`blocks` since there was no
model output to read, so those two cells slightly understate the true rate rather than
overstate it.

An earlier version of the F2 classifier flagged two open-inference/fp8 no-skills findings as
"found" on keyword match alone ("bypasses the typed API layer / shared contract types"); on
manual read their rationale was about missing zod validation of the CSV response shape, not
about error normalization, so I tightened the classifier and they are correctly excluded above
— the corrected F2 no-skills row is a clean 0/6 on every provider.

## What I did not check

- Only the three pinned providers named in the brief; OpenRouter's other ~12 endpoints for this
  model (StreamLake, GMICloud, Venice, DigitalOcean, SiliconFlow, Alibaba, Baidu, Novita,
  AtlasCloud, NextBit, Mancer, Azure) were not tested, and the real app runs unpinned.
- No run above n = 6 for any (candidate, arm, provider) cell; F3 was never topped up past n = 4
  since it was dropped by the pre-registered rule.
- Citation "grounding" was checked against the diff hunks I wrote, by hand-encoded line ranges
  in `score.py`'s `HUNKS` table, not against the app's actual `groundFindings` implementation in
  `reviewer-core`. I did not run that function.
- None of the three diffs were applied to the repo, typechecked, or run through CI — they are
  fixture text only, per the read-only constraint on this task.
- I did not test whether reordering the five skills within the `all5` arm changes which rule
  the model reaches for, or whether dropping to fewer than five skills changes these specific
  results (that's the subject of the parallel analyst's track, per the shared brief).
- I did not investigate *why* open-inference/fp8 cites `start_line:1, end_line:1` for F1 (a
  structured-output/schema-in-prompt artifact is my best guess, consistent with this repo's own
  prior finding that OpenInference "behaves worst," but I didn't verify a mechanism).
- The task-line/refactor-title mismatch (see above) was checked only by grepping summaries for
  the literal word "refactor," not by re-running any arm with a corrected task line.
