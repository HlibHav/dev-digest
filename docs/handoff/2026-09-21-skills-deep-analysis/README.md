# Why reviewer skills don't work as designed — synthesis (2026-09-21)

Four analysts ran in parallel (prompt anatomy, intent and fixtures, provider mechanics,
prompt-side arms). Their reports are next to this file; the raw call records are in
`receipts/`. The orchestrator re-tallied every number below from the raw records or the
dev DB. 155 OpenRouter calls in total, about $0.07. Nothing was written to the dev DB.

Continues `../2026-09-21-skills-dilution.md`. Fixture: PR #8, `POST /agents` 201 → 200.
"Caught" means a CRITICAL finding about the status code in the model's raw output.

## The answer in four layers

**1. The fixture has no headroom (design).** The baseline already catches the change: no
skills caught 5/6 pinned to OpenInference, and blocked 4/4 in the app. On PR #8 a skill can
only be neutral or harmful. Of 56 rules in the seven seeded skills, 59% restate general
engineering knowledge, 34% are severity policy, and about 4 are repo facts a model cannot
infer. None of those 4 touch the code PR #8 or PR #9 change. "Misses without, catches with"
is not reachable with these two fixtures, however the skills are embedded. (Report B. The
literal wording of homework criteria 17/18 was not found anywhere in the repo.)

One recorded counter-example exists: `docs/skills-control-experiment.md`, Result 1, the Test
Quality Reviewer on PR #6 (0 findings without skills, 6 with). It is one run per arm,
unpinned, and predates the rewrite of that agent's system prompt (commit 8d58b90), so it is
unverified for the agent as it is today.

**2. Skills veto each other, and nothing arbitrates (content).** `semver-discipline` ends
with "Do not flag: An internal refactor behind an unchanged public surface — that is a
patch". PR #8 is titled and described as a refactor. The system prompt says of the skills
section "apply exactly those: they are the review" and sets no precedence between skills.

| Arm, pinned to OpenInference | Caught |
|---|---|
| all five, unchanged (controls from C and D) | 1/6 |
| `breaking-change` + `semver-discipline` only | 0/6 |
| `breaking-change` + `response-schema` only | 6/6 |
| `breaking-change` + `deprecation-policy` only | 8/12 (report D says 6/12; its own rows give 8) |
| all five, `## Do not flag` removed from the other four | 6/6 |
| all five, `breaking-change` last | 5/6 |
| all five, `deprecation-policy` rendered trusted | 6/6 |
| all five, fenced in `<skill>` tags with demoted headings | 0/6 |
| `breaking-change` + neutral prose at the full five-skill size | 4/12 |

In the misses the model repeats the exemption nearly word for word. Run 9f86aa91: "the
200-vs-201 status on the create handler — are either internal refactors or already-true
behavior". Other misses downgrade to WARNING using `response-schema`'s "name one consumer"
bar, or invent "already answered 200" from the PR description. (Report A.)

Read this with care: three unrelated single changes each restore the catch, while the pair
with `semver-discipline` alone breaks it. On this provider the decision sits on an edge. The
exemptions are what the model reaches for when it falls the wrong way, and removing them is
the one change that is both reliable (6/6) and explained. Heading collision is not the
cause. Volume alone is a partial effect at full size and no effect at one-skill size.

**3. One provider tips it over (serving).** OpenInference emulates `json_schema` by pasting
the schema into the prompt. Switching to `json_object` drops `prompt_tokens` from 7186 to
5881 and restores the catch to 6/7. With the native schema elsewhere, the same all-five
prompt is caught: DeepInfra 6/6 (also 0 reasoning tokens), Parasail 6/6, Alibaba 5/6,
DigitalOcean 2/3. Reordering the schema so `findings` comes first took effect in the output
and changed nothing (0/6). It also produced five invented CRITICAL "prompt injection"
findings that use the schema's own enum vocabulary, so the pasted schema's content competes
with the rules. A `reasoning` request makes OpenInference hang past 160 s. (Report C.)
`json_object` is not a drop-in fix: without the strict schema the model invents field names
and the grounding gate cannot read them.

**4. The app erases correct findings (product bug).** In 6 of the 17 morning runs recorded
as `blockers = 0`, the model had answered `request_changes` with a CRITICAL about 201 → 200.
It cited `start_line` 1 (once 0) instead of the real line. The grounding gate dropped the
finding ("lines 1-1 do not intersect any diff hunk") and the run was stored as 0 blockers,
score 100. With 0–1 skills the same provider cites line 44 and passes. So part of the
original "any second skill flips it" table was this gate, not the model: both
`breaking-change` + `semver-discipline` runs that morning were dropped catches. That morning
ran the reworded v2 body; with the current body the same pair is a real miss (0/6 above).

## Refuted

Heading collision as the cause (fenced: 0/6). Verdict-before-findings ordering (0/6 after
reorder). "No reasoning tokens means a miss" (DeepInfra 6/6). Volume at one-skill size (6/6).

## Open

- Why rendering `deprecation-policy` as trusted restores the catch. Measured, not explained.
- Whether the citation drift to line 1 happens on other providers. In C's sweep the other
  four all cited lines 102–108.
- Everything prompt-side was measured on one provider at n = 6–12. Large gaps only.

## Decisions waiting for Glib

1. **Fixture with headroom.** Report B proposes three, each grounded in a real repo rule:
   `process.env` instead of `container.secrets`, a hand-edited migration, a 429 without
   `Retry-After`. Prove the baseline misses (≥ 5/6, pinned) before relying on one.
2. **Skill exemptions.** Scope every `Do not flag` to its own skill, or add one precedence
   sentence to the system prompt ("an exemption limits only the skill that states it; if any
   skill says flag, flag"). Untested. One arm on the same harness costs a cent.
3. **Grounding gate.** A dropped finding should not turn `request_changes` into score 100.
4. **Provider.** Record the serving provider in the run trace, and exclude OpenInference or
   pin providers. A vendor choice: ADR and the research gate apply.

## Re-running

`receipts/h5.py` sends one pinned call that mirrors `reviewer-core/src/llm/openrouter.ts:69`.
`receipts/BRIEF.md` lists the inputs and the rules the analysts worked under.
`receipts/prompts/` holds the exact prompts: the three from the app's traces, the schema,
and report D's nine variants (`prompt_d_<arm>.json`). Report D describes how each variant
was built and verified (the rebuilt all-five block matched md5 `efe20224…`).
