# Round 2 — looking for a fixture where skills show real uplift (2026-09-21)

Goal: a fixture where the no-skills baseline misses a defect and the same agent with its
current skills catches it, across providers, since the app runs unpinned. Two analysts ran in
parallel (reports `T-pr6-test-quality.md`, `F-api-fixture-prescreen.md`, shared brief
`BRIEF.md`), then the orchestrator ran two follow-ups (R, P). The orchestrator re-tallied the
numbers below from `receipts/`. 205 pinned calls in total, about $0.12. Nothing was written to
the dev DB, the repo's code or GitHub.

**Result: no existing or candidate fixture shows robust "misses without, catches with" with the
agents as configured today.** There is one clean case, but only on a reasoning provider and
only at WARNING.

## Test Quality Reviewer, PR #6 — the recorded uplift does not reproduce

Result 1 of `docs/skills-control-experiment.md` (0 findings without skills, 6 with) ran on the
agent's old system prompt. T rebuilt that prompt byte-exactly with the real `assemblePrompt`
(4 md5s matched), then re-ran with today's prompt. Today's baseline already catches the
untested code: DeepInfra 5/6, OpenInference 6/6, Parasail 4/6. Skills do not raise it.

The reason is in the prompt, and it is by design. PR #7 says the rewrite removed the "what to
look for" sections and kept severity bands that "describe impact instead of restating the
rules". That is what today's prompt does. But the impact band it kept is enough to decide this
fixture on its own: "CRITICAL — an untested path that swallows an error, skips an
authorization or tenancy check… This is the ONLY level that blocks merge."
(`agents.system_prompt` of the Test Quality Reviewer, lines 23–25). On an obvious defect like
PR #6's, the skills have nothing left to add.

## API Contract Reviewer — three candidates built on the only repo-specific rules it carries

Of 56 rules in the seeded skills, three are facts a model cannot infer, and all three sit in
the API Contract Reviewer's current skills: server/client contract mirroring
(`response-schema`, warning) and the two rules the Conventions Extractor produced
(`repo-conventions`, no severity): 204 handling and `ApiError` normalisation in
`client/src/lib/api.ts`. The prompts reuse PR #8's system prompt and skills block, with the PR
description and diff replaced and repo map/callers removed. The construction was proven by
round-tripping PR #8 to md5 `efe20224…`.

| Candidate | No skills, found | All five skills, found / blocks | Verdict |
|---|---|---|---|
| F1: new enum member mirrored server-only | Parasail 6/6 (blocks 6/6) | — | general knowledge, dropped |
| F3: `res.json()` on a 204 | 4/4 on all three | — | general knowledge, dropped |
| F2: client helper throws plain `Error`, not `ApiError` | **0/6 on all three** | Parasail **6/6** / 0; DeepInfra 0/5; OpenInference 0/6 | provider-dependent |

F2 is the only defect the baseline misses everywhere under the strict reading (the finding
names `ApiError`; see P for the broad reading). With skills, only the reasoning provider
applies the rule.

## R — why F2 is missed with skills on DeepInfra and OpenInference

| Arm (n = 6) | DeepInfra found | OpenInference found | Parasail found |
|---|---|---|---|
| all five, as the app renders them (F) | 0/5 | 0/6 | 6/6 |
| R1: `repo-conventions` alone | 3/6 | 2/6 | — |
| R2: all five, `repo-conventions` rendered as explicit checks | 2/6 | 1/6 | 3/3 |

Both levers help a little and neither is enough: all four R cells sit in the inconclusive band.
Removing the four other skills lifts the catch from ~0 to 2–3 of 6. Rewriting the extracted
rule as an explicit check ("Flag: new or changed code that handles this case another way",
severity, "a rule applies to every file") lifts it to 1–2 of 6. On a provider that reasons,
the rule works as rendered today. Found findings cite `client/src/lib/api.ts:74–78`, inside
the diff, so the grounding gate would keep them.

## P — the description's license sentence, and R1 on Parasail

F2's description pre-justifies the defect: "Kept it as a plain `fetch` since the response is a
file blob, not JSON, so it doesn't go through the usual typed hooks." P removes only that
sentence (a single-span change, asserted in `receipts/p_run.py`). Two readings of "found":
**strict** means the finding names `ApiError` or error normalisation. **Broad** also accepts
"raw `fetch` instead of `apiFetch`".

| Arm (n = 6) | DeepInfra strict / broad | OpenInference strict / broad | Parasail strict / broad |
|---|---|---|---|
| no skills, sentence kept (F) | 0 / 0 | 0 / 3 | 0 / 1 |
| no skills, sentence removed (P) | 0 / 3 | 0 / 3 | — |
| all five, sentence kept (F) | 0 / 0 (n = 5) | 0 / 0 | 6 / 6 |
| all five, sentence removed (P) | 1 / 1 | 0 / 0 | — |
| `repo-conventions` alone (R1) | 3 / 3 | 2 / 2 | 5 / 5 |

- The sentence is not why the skills miss: removing it leaves all five at 1/6 and 0/6.
- The sentence does hide the pattern from the baseline. Without it, the no-skills arm notices
  the raw `fetch` in 3 of 6 runs on both providers. It then blames missing auth headers or
  CSRF, which `apiFetch` does not add in this app. It does not blame error normalisation,
  except once in passing ("error serialization"). So the baseline sees the smell and
  misreads it. The skill's contribution is the right reason, and only on a reasoning
  provider.
- Fewer skills catch more, on both non-reasoning providers: `repo-conventions` alone 3/6
  and 2/6 against 0/5 and 0/6 for all five. Parasail catches either way. This is the same
  direction as round 1 (`breaking-change` alone 5/6, all five 0/6 on OpenInference), on a
  different fixture and a different rule. R1 removes four skills and also shortens the block,
  so competition and volume are not separated here. Round 1's D5 put volume alone at 4/12.

## What this means

1. Uplift exists only where three things meet: a rule the model cannot know, a fixture that
   breaks exactly that rule, and a backend that reasons. The first two are rare in the current
   skills (3 of 56 rules), and the third is not controlled today.
2. For the Test Quality Reviewer, the role prompt competes with its skills: it states the
   blocking rubric itself, so the skills have nothing left to add on an obvious defect.
3. Measuring "blocks" (CRITICAL) cannot show uplift from convention rules. Every
   repo-specific rule in the current skills is warning-level or unrated.

## Decisions waiting for Glib

1. What counts as "catches" for the homework: any finding about the defect, or a block? With
   "any finding", F2 on a reasoning provider is a clean 0/6 → 6/6. With "blocks", no current
   rule can produce it.
2. Provider for demo and experiments: pin a reasoning provider (Parasail behaved cleanly) or
   ask for reasoning in the request. This is a vendor choice (ADR, research gate). Unpinned, F2
   is a coin flip weighted by routing.
3. Whether to build F2 as a real fixture PR (`demo/…` branch, CI green). A real PR also needs
   the server route, an i18n key and a test (see report F). P settled the description
   question: keep the sentence. It keeps the baseline from noticing the raw `fetch`, and
   removing it does not help the skills.
4. For the Test Quality Reviewer, whether a fixture should target something its impact band
   does not already state, or the band should say less. One candidate is `test-smells`'
   Drizzle fact: on a row, a missing column reads as `undefined`, so `not.toBeNull()` passes
   before the feature exists.
