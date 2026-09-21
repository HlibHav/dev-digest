# Handoff — why do more skills make the API Contract Reviewer miss a breaking change?

Written 2026-09-21 at the end of a long session. A fresh session resumes from here.
Branch `feat/agent-skills` (PR #7, open, CI green). Fixture PR #8, CI green.

## The problem in one paragraph

On fixture PR #8 (`POST /agents` stops answering 201 and answers 200, buried in
a refactor), the API Contract Reviewer **blocks without skills and approves with
them**. With `breaking-change` alone it blocks. Linking any one more skill next
to it makes it approve at score 100 and justify the approval with an invented
fact: "the create handler already answered 200 before this PR". The diff it was
given shows `- reply.status(201)`. The homework brief expects the reverse, and
so did we. Something in how skills reach the model is probably wrong, not just
"the model is weak".

## What is measured (dev DB, model `deepseek/deepseek-v4-flash`, temperature 0)

| Configuration on PR #8 | Blocks | Runs |
|---|---|---|
| no skills | yes, 1 CRITICAL, score 65 | 4 |
| `breaking-change` only | yes | 2 (+4 accidental repeats) |
| `breaking-change` + `repo-conventions` | no, score 100 | 2 |
| `breaking-change` + `semver-discipline` | no | 2 |
| `breaking-change` + `deprecation-policy` | no | 2 |
| the four API-contract skills | no | 2 |
| all five | no | 4 |
| all five, test-file hunks removed from `pr_files` | no | 2 |
| all five, `breaking-change` reworded (no "default branch" check, both status directions) | no | 3 (one run: 1 non-blocking finding) |

PR #9 (Test Quality, happy-path-only test): 0/4 block either way. With skills,
every run flags the same 3 gaps. Without them, one run finds nothing.

**Read "4/4" carefully.** Temperature defaults to 0 (`reviewer-core/src/llm/openrouter.ts:72`).
Raw outputs differ, but verdicts are identical within a configuration. Repeats
show the decision is stable. They are not independent samples.

## Ruled out, with the probe that ruled it out

- **Diff truncation.** `run_traces.trace.prompt_assembly.user` contains
  `reply.status(201)` in every run, including the approvals.
- **The CI fix (updated `toBe(200)` assertions in the diff).** Deleting those two
  files from `pr_files` still approves (0/2).
- **The `breaking-change` wording** ("a route that exists in the default branch",
  "a 200 that becomes 201"). Rewording it did not change the verdict (0/3).
- **Any single skill's content.** Three unrelated second skills all flip it.

## Confirmed defects in skill embedding (not yet proven to be the cause)

1. **Heading collision.** `renderSkillsBlock` (`reviewer-core/src/prompt.ts:80`)
   wraps a trusted skill as `### name`, but the bodies carry `# Title` and
   `## Flag / ## Severity / ## Do not flag`. Inside `## Skills / rules`
   (`prompt.ts:164`) those `##` headings are the same level as the prompt's own
   `## PR description` and `## Diff to review`. There is no boundary between one
   skill, the next, and the rest of the prompt.
2. **A vetted imported skill is labelled "ignore me".** `imported_url` skills
   render in `<untrusted source="skill-N">` (`prompt.ts:86`). `INJECTION_GUARD`
   (`prompt.ts:17`) tells the model everything in `<untrusted>` is data, never
   instructions, and warns specifically about text that says "not flag".
   The trust design (`../decisions/2026-09-20-skill-trust-model.md`) meant the
   wrapper to stop prompt injection. It also stops the skill working.
3. **Stacked "Do not flag" sections.** Every seeded skill ends with one, and
   `semver-discipline`'s says an internal refactor is a patch. The PR is framed
   as a refactor, and its description (also in the prompt) says the handler
   "answers 200 like the rest of the module".

## Hypotheses, and the one run that separates each

Run these in order. Each needs ≤ 2 runs per arm on PR #8.

| # | Hypothesis | Discriminating experiment | Expect if true |
|---|---|---|---|
| H1 | **Volume/dilution**: any extra text loses the rule | Link `breaking-change` + a new ~same-size skill containing no rules (neutral prose) | approves |
| H2 | **Heading collision** | Change `renderSkillsBlock` to fence each skill (`<skill name="…">…</skill>`, or demote body headings by 3 levels); rerun `breaking-change` + `semver-discipline` | blocks again |
| H3 | **"Do not flag" sections** are read as global permissions | Strip the `## Do not flag` section from the second skill only; rerun the same pair | blocks again |
| H4 | **Position**: the last skill before `## Repo skeleton` wins attention | Reorder so `breaking-change` is last; rerun the pair | blocks again |

H1 first. If a rule-free skill also flips it, H2–H4 are secondary and the fix is
about how much rubric one agent should carry. If it does not, it is content or
structure, and H2 is the cheapest code fix to try.

Separately, and regardless of #8: defect 2 is a real bug on its own. An enabled
imported skill should not be wrapped as untrusted data. That is a design decision
(it reverses part of the 2026-09-20 trust ADR) — **get Glib's sign-off before
changing it.**

## Also worth re-reading

`docs/skills-control-experiment.md`, Result 2 (2026-09-20, PR #5): with skills
the API reviewer found *fewer* findings and downgraded a CRITICAL, and the doc
explains that as "the skills narrowing the agent". It may be this same effect.
Its runs were single-sample and predate the prompt/skill split, so treat that
explanation as unverified.

## How to run one probe

Dev stack: `.claude/launch.json` config `devdigest` (API :3201, web :3200).
Opening the PR once is mandatory, or the review sees an empty diff
(`server/INSIGHTS.md`).

```bash
AG=3291d6c0-241b-4d8d-9a14-fbf3d2f6bdb0     # API Contract Reviewer
PR=c2a14ddb-7637-4159-a690-d3ca1fea7fa4     # fixture PR #8
curl -s "http://localhost:3201/pulls/$PR" >/dev/null                      # hydrate the diff
curl -s -X POST localhost:3201/agents/$AG/skills -H 'content-type: application/json' \
  -d '{"skill_ids":["82c8e4aa-a5e1-4ee8-8a08-c90bf8499fd2","237334f6-b13f-4b52-adff-bf6f84af0f09"]}'
curl -s -X POST localhost:3201/pulls/$PR/review -H 'content-type: application/json' -d "{\"agentId\":\"$AG\"}"
```

Read the outcome from the database, not the UI:

```sql
select ar.blockers, ar.score, rt.trace->'prompt_assembly'->>'skills_tokens' as sk_tok,
       rt.trace->'prompt_assembly'->>'user' as assembled_user_prompt
from agent_runs ar join run_traces rt on rt.run_id = ar.id
where ar.pr_id = 'c2a14ddb-7637-4159-a690-d3ca1fea7fa4' order by ar.ran_at desc limit 1;
```

Skill ids: `breaking-change` 82c8e4aa-a5e1-4ee8-8a08-c90bf8499fd2 ·
`response-schema` 8cc74448-edf2-41ca-a2f6-e7d9e8227956 ·
`semver-discipline` 237334f6-b13f-4b52-adff-bf6f84af0f09 ·
`deprecation-policy` bb628801-e385-4410-896f-283c126f62df (imported) ·
`repo-conventions` 02f09065-3ccf-4082-9598-3c12db66be4d.

## Leave the dev DB as you found it

It is set up for the homework demo. After probing, relink the agent in this
order: breaking-change, response-schema, semver-discipline, deprecation-policy,
repo-conventions. `breaking-change` is at v3, with v1's body restored. Do not run
`pnpm db:seed` or a new conventions scan before the demo is recorded.

## Open items from this session

- PR #7's description states "4 / 4" without the temperature-0 caveat above.
  Add it.
- The recorded homework criteria 17/18 ("misses without, catches with") are not
  met by the current fixtures. How to present that is Glib's call. The data is
  in PR #7.

## H1 probe (second session, 2026-09-21)

**H1 could not be decided: the effect it was meant to explain no longer
reproduces.** From 08:33 to 08:41 UTC every configuration blocked, including all
five skills. That config approved four times at 07:02–07:04 on a byte-identical
prompt. The evidence points at the backend that served the request, not at the
skills.

### Runs (`breaking-change` v3; its md5 `d3581545…` equals v1's)

| Arm | Skills block | Blockers | Score | Run |
|---|---|---|---|---|
| gate: `breaking-change` alone | 506 | 1 | 65 | f56680b8-235e-4f94-8a1f-bb9b380ada5d |
| + `ringbahn-note`, one neutral sentence (106 chars) | 536 | 1 | 65 | 7c570fbe-0ac4-40a8-97b2-d9aa5c7b1b0c, 03f0ecdd-33b4-452f-88eb-e857f678c0ab |
| + `ringbahn-note`, neutral prose (1997 chars, no headings, no rules) | 935 | 1 | 65 | 5a27bcb9-ba09-40b9-8d9e-0e98fa48525d |
| + `repo-conventions` (positive control) | 627 | 1 | 65 | 76a38fc2-77bf-419d-ab45-180b7ebe60a4 |
| all five, documented order (positive control) | 1935 | 1 | 65 | c7f0a9cb-0b90-4bad-9270-b75f6aabc4eb |

`ringbahn-note` was a `custom` skill created for the probe and deleted after it.
Its body was plain prose about the Berlin Ringbahn. Run 03f0ecdd repeats the
one-sentence arm: its body update went out as `PATCH`, the route is `PUT`, and
the 404 went unnoticed until the token count came back unchanged.

### The table at the top mixes two things

1. **Two `breaking-change` bodies.** Every pair row (skills block 546, 667, 952,
   1004, 1854) ran with v2, the reworded body. Its prompt lacks v1's phrase
   "exists in the default branch". The only v1 runs that morning were "all five"
   (1935, 07:02–07:04).
2. **Two backends.** Same system prompt (md5 `0353de0b…`), same user prompt
   (md5 `efe20224…`), same model slug, temperature 0, single pass, no tool calls:

   | All-five runs | prompt_tokens | completion_tokens | Duration | Verdict |
   |---|---|---|---|---|
   | 07:02–07:04, ×4 | 7186 | 120–258 | 5.5–9.9 s | approve, 0 findings |
   | 08:41, ×1 | 5854 | 2676 | 57 s | request_changes, 1 CRITICAL |

   The sharper signal is the output. At 07:02 completion tokens match the content
   (171 tokens for a 678-char JSON), so nothing was spent on reasoning. At 08:41,
   2676 completion tokens produced 1938 chars, so roughly 2000 tokens went to
   reasoning. The input counts differ as well, and schema retries can't explain
   it: `completeStructured` adds up `prompt_tokens` across attempts, but a retry
   would at least double the count, and 7186 is identical across four runs with
   different outputs. Different tokenization or templating upstream is the
   likely reading, but it is inferred. The whole 07:02–07:11 series
   has short outputs (120–724 tokens). Where a comparable prompt exists, its input
   count is inflated too: `breaking-change` alone took 5762 tokens then and 4389
   now, and the two bodies differ by 40 tokens. The 2026-09-20 evening runs and
   everything from 08:33 on have longer outputs (617–3745 tokens).

What the morning data actually show: on that one backend, `breaking-change`
alone blocked (6/6, v2) and no skills blocked (4/4), while 17 runs with two or
more skills all approved. On the backend serving now, nothing tried flips it.

Why this can happen: OpenRouter lists 15 providers for
`deepseek/deepseek-v4-flash` (fp8; fp4 at AtlasCloud; several "unknown"). They
come from `GET https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash/endpoints`.
`completeStructured` (`reviewer-core/src/llm/openrouter.ts:69`) sends no
`provider` preference. It keeps only `choices[0].message.content` and `usage`,
so which provider answered is recorded nowhere. Repeats agreeing within minutes
fit sticky routing just as well as determinism.

### H5, and the run that separates it

**H5: the flip belongs to one provider behind the slug, not to the skills.**
Take the byte-identical system and user prompt from the trace of run c7f0a9cb.
Call OpenRouter directly once per provider with
`provider: { order: [<name>], allow_fallbacks: false }`, temperature 0 and the
same `json_schema` response format. Record the `provider` field of each
response, `usage.prompt_tokens` and the verdict. The provider that reports 7186
prompt tokens is the morning one. H5 holds if it approves and the others block.
Before the sweep, send the same prompt unpinned 3–5 times. If verdicts vary
from call to call, routing is not sticky and the sweep needs more calls per
provider. Neither step writes to the dev DB or touches the running server. The
whole thing costs a few cents.

Until H5 is settled, H1–H4 cannot be read. An arm's verdict says which backend
served it. The table at the top and the "4 / 4" in PR #7 are confounded by
routing as well as by the skill version.

The code change this points to (to pin a provider, or at least require one, and
to write `provider` into the run trace) is a vendor choice. It needs Glib's
sign-off.

### State after the probe

Probe skill deleted, nine skills left, the agent relinked in the documented
order, `breaking-change` still v3. The six runs above are new rows on PR #8. The
latest API Contract Reviewer run on PR #8 now **blocks** (c7f0a9cb, score 65).
Before this session the latest one approved at 100.
