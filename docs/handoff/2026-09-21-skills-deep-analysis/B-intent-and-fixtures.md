# Analyst B — intent and fixtures: can these fixtures show what skills are meant to show?

Scope: read-only design audit. No LLM calls made by me. All numbers below come from the
dev DB (SELECT only, via a local script that never echoes `DATABASE_URL`) and from files
already in the repo/scratchpad.

## Bottom line

The working suspicion is **correct for the two fixtures actually in play (PR #8, PR #9)**,
and the DB data makes the mechanism precise rather than just "the model is already smart
enough": across all 60 recorded runs of the API Contract Reviewer on PR #8 and the Test
Quality Reviewer on PR #9, there is **no reproducible case of "misses without, catches
with."** The one apparent counter-example (Q1) is a single non-reproduced run, not part of
the officially reported numbers, and it is a defensible-but-severity-inflated finding
rather than the "same defect, different catch" pattern the homework wants. The knowledge
audit (Q3) explains why: the rules that would actually decide PR #8's or PR #9's fixture are
overwhelmingly general engineering knowledge a strong model already applies, the one skill
built entirely of un-guessable repo facts (`repo-conventions`) has nothing to say about
either fixture's code path, and the fixture's own PR description doesn't require any
repo-specific inference to catch — the diff contradicts it directly.

This does **not** mean skills can never add headroom in this product. `docs/skills-control-
experiment.md`'s Result 1 (PR #6, Test Quality) shows a real without/with split on a
different PR, and severity-policy rules (category b below) demonstrably change verdicts
(PR #5's Result 2: a CRITICAL SSRF finding downgraded to WARNING). But on the two fixtures
built for this homework, the suspicion holds.

---

## Q1 — Headroom table

### Method and caveat

`agent_runs.blockers` in this DB is the count of `CRITICAL` findings on that run (verified:
every run where `blockers > 0` has that many `severity = 'CRITICAL'` rows; every
`blockers = 0` run has none). Per brief rule 5, "caught" requires a CRITICAL **about the
planted defect**, not just `blockers >= 1`, so I read finding titles for every distinct
`(agent, PR, skills_tokens)` cell reported below, plus a full listing of every CRITICAL
title ever produced on PR #8/#9 (query in evidence). One consequence surfaced immediately:
some early no-skills runs on PR #8 produced CRITICALs about things **not in the diff at
all** ("New required `state` query parameter breaks…", "Response field `cost_usd` removed
and replaced by `cost`", "Adding max(40) to name field…") — none of these exist in PR #8's
actual diff. These come from five runs at **2026-09-20 19:37–19:47 UTC**
(`9d399b06, 20ca7c53, 2de4ade2, 3d715997, 9b5261af`), before the "official" measurement
window PR #7 reports. I exclude them from the headroom read and flag them as a separate
methodological problem (see "What this means" below) rather than silently averaging them
in.

**Caveat carried forward, per the brief:** every run from **2026-09-21 07:02–07:11 UTC**
was served by the OpenInference backend (confirmed independently below — same token
signature, 7186 `prompt_tokens` on the all-five prompt, matching `docs/handoff/2026-09-21-
skills-dilution.md`'s H5 finding). I treat that whole window as **one backend's answer**,
not six or four independent samples.

### PR #8, API Contract Reviewer — the numbers PR #7 reports (official, in-window)

| Config | skills_tokens | n | Run IDs | Blockers | Findings | Score | Caught? |
|---|---|---|---|---|---|---|---|
| no skills | NULL | 4 | 46f83290, 7c83c1f9, 6e9151f6, e292bd7d (07:02:33–07:03:49) | 1,1,1,1 | 1,1,1,1 | 65×4 | **4/4** — every CRITICAL title names the 201→200 status change, e.g. e292bd7d: *"Create agent endpoint changes status code from 201 to 200"* |
| all five skills (v1 body) | 1935 | 4 | 9f86aa91, a9cf9602, 856457f5, 48728ba1 (07:02:54–07:04:27) | 0,0,0,0 | 0,0,0,0 | 100×4 | **0/4** |

This exactly reproduces PR #7's reported table (`no skills 4/4 blocks… all five 0/4`). All
eight runs are OpenInference. **No headroom for skills is demonstrated here — the reverse
is: skills erase a catch the baseline already had.**

### PR #8, other configurations in the same window (not in PR #7's official table, from the H1/H5 probe)

| Config (skills_tokens) | n | Blockers | Caught? |
|---|---|---|---|
| `breaking-change` alone, v2 body (546) | 6 (07:06:31–07:08:19) | 1×6 | **6/6**, e.g. 3a52025d: *"Create-agent response status changed from 201 to 200 on an existing route"* |
| two-to-four-skill combos (667, 952, 1004, 1854) | 2 each = 8 | 0×8 | **0/8** |
| a fifth combo (1975) | 5 (07:05:16–07:11:55) | 0,0,0,0,0 | **0/5 as CRITICAL** — one run (ec8e1b53) *did* name the status change but rated it WARNING, not CRITICAL: *"Create-agent handler changes status code from 201 to 200"* — correctly identified, deliberately not blocked |

Pattern: the smallest with-skills config (`breaking-change` alone) still blocks every time;
every config with two or more skills approves. This matches
`docs/handoff/2026-09-21-skills-dilution.md`'s account (H5 result table) almost exactly —
I re-derived it independently from `agent_runs`/`run_traces`/`findings` rather than trusting
the doc's prose, and the numbers agree.

### PR #8, outside the OpenInference window (2026-09-21 08:33–08:41 UTC, a different backend)

| Config (skills_tokens) | n | Blockers | Caught? |
|---|---|---|---|
| `breaking-change` alone, v3 (506) | 1 | 1 | 1/1 |
| + neutral sentence (536) | 2 | 1,1 | 2/2 |
| + neutral prose 1997 chars (935) | 1 | 1 | 1/1 |
| + `repo-conventions` (627) | 1 | 1 | 1/1 |
| all five (1935, v1) | 1 | 1 | 1/1 — c7f0a9cb, *"POST /agents response status changed from 201 to 200"* |

On this backend the all-five config **catches** the defect. Combined with the in-window
result (0/4), this is the clean demonstration that **the flip is provider × skills**, not a
property of the skill content alone — consistent with what the shared handoff already
concluded from a parallel, independently-run OpenRouter sweep (`h5_results.jsonl`, which I
did not re-run; my numbers come from the app's own `agent_runs` table, a different data
source than that sweep, and they corroborate it).

### PR #9, Test Quality Reviewer — the numbers PR #7 reports (official, in-window)

| Config | skills_tokens | n | Run IDs | Blockers | Findings | Score | Caught? |
|---|---|---|---|---|---|---|---|
| no skills | NULL | 4 | 966ac8d4, 01dd8285, 3e87a523, 06bf144f (07:32:48–07:34:19) | 0,0,0,0 | 3,0,3,2 | 73,100,73,76 | 0/4 (no CRITICAL) |
| `test-smells` + `branch-coverage-gate` (737) | 4 | d4b2c47c, 079631f1, 7dcbe085, 2ea96545 (07:34:44–07:36:02) | 0,0,0,0 | 3,3,3,3 | 64,64,73,64 | 0/4 (no CRITICAL) |

Reproduces PR #7's table exactly (`0/4` both configs). No blocking miss/catch pair here
either — the difference is consistency (skills always flag the same three gaps; without
them one run in four finds nothing), not a verdict flip.

### PR #9, pre-official exploratory batch (2026-09-20 19:50–19:52 UTC) — the one exception

| Run | Config | Blockers | Finding |
|---|---|---|---|
| 32519cb0 | no skills | 0 | WARNING "Test covers only the happy path", SUGGESTION on boundary |
| 0150c17b | no skills | 0 | 3× WARNING/SUGGESTION, no CRITICAL |
| 5107c5f6 | skills (737) | 0 | WARNING "Untested branches in shouldSweep" |
| **f7e8d17c** | **skills (737)** | **1** | **CRITICAL** *"Untested blocking-run branch can silently delete merge-blocking runs"* |

This is the **only run in the entire 60-row dataset** where a with-skills run produced a
CRITICAL that no no-skills run (0/6, counting both batches) ever produced. I read the
rationale in full (`findings.rationale`) rather than trusting the title:

> "The `if (policy.keepBlocking && run.blockers > 0) return false;` branch is never
> exercised by the test. **If this branch regressed** (e.g., the `&&` became `||`, or
> `keepBlocking` was ignored), the nightly sweep would delete runs that blocked a merge…"

That is a correctly hedged, defensible test-quality finding (an untested guard around data
loss) — not a hallucination; I checked the actual code
(`server/src/modules/_shared/retention.ts:28`, fetched via `gh pr diff 9`) and the guard is
real and currently correct, exactly as the rationale assumes. It is a legitimate use of
`branch-coverage-gate`'s rubric. But: (1) it is n=1, from the pre-official batch, not
reproduced in the four "official" with-skills runs that follow it (0/4 there too); (2) rating
it CRITICAL is a stretch against `branch-coverage-gate`'s own severity rule — "critical" is
defined as "an untested branch that swallows an error **or skips a security or tenancy
check**" (`skillbody_branch-coverage-gate.txt:22`), and a retention/data-loss guard is
neither; every other run (5 of 6 with-skills, and every no-skills run) rated the same class
of gap WARNING or SUGGESTION. **My read: this is the one honest, non-hallucinated instance
of "with-skills catches something baseline never did" in the whole dataset, and it is weak
evidence — a single unreproduced run with a severity call the skill's own rubric does not
clearly support.**

### PR #5 (`feat(reviews): share a review to an external webhook`)

Only a no-skills condition survives in the DB for the current agent/skill set: 6 runs,
2026-09-20 16:48–16:54, `skills_tokens` NULL throughout, findings **1,4,1,1,5,4** and scores
**88,47,88,65,3,79** — high variance for temperature-0 repeats. `docs/skills-control-
experiment.md` documents that repo intelligence (left on here) is a known confound that
swamps the skills-block signal, and its own Result 2 for this PR (with the old skill names
`breaking-change-gate`/`api-contract-conventions`, not in today's five) already concludes
**"this PR cannot demonstrate the API Contract skills, because nothing in it changes an
existing contract."** I cannot recompute a with-skills headroom row for PR #5 from the
current DB — those runs are gone or never had `skills_tokens` recorded — so I am reporting
the doc's own verdict rather than fabricating a number.

### What this means

1. **No pair where baseline misses and skills catch, at any reproducible n.** PR #8: never
   (baseline is 4/4 or better throughout; skills only ever reduce catches). PR #9: one
   unreproduced run, of debatable severity.
2. **The early PR #8 no-skills batch (19:37–19:47) hallucinating unrelated CRITICALs** (a
   nonexistent query parameter, a nonexistent field rename) is worth flagging on its own:
   it means at least some of the historical "no-skills already blocks" evidence is noisy —
   the model was blocking, but not always for the right reason. The *official*, in-window
   4/4 is clean (every title is on-topic), but anyone reusing the wider history should
   filter on it.

---

## Q2 — Intent, in the project's own words

**What the author says a skill is for**, `server/specs/agent-skills.md:9`:

> "A skill is text and nothing else: no tools, no file access, nothing executed. Its entire
> effect on a run is the characters it contributes to the prompt."

**What "worth it" means**, `docs/skills-control-experiment.md:3`:

> "A skill is only worth its tokens if the same agent, on the same diff, reviews differently
> with it than without it."

**The author's own reading of the negative result** (PR #5, same doc):

> "The honest reading: this PR cannot demonstrate the API Contract skills, because nothing in
> it changes an existing contract… The lesson generalises… a skill narrows an agent.
> Narrowing raises the signal inside its remit and lowers it outside. Measure the agent you
> scoped, not the agent you wish you had."

**PR #7's own framing of the homework's expectation** (PR description, section 3):

> "Neither fixture shows the miss-without, catch-with result the brief predicts."

### Criteria 17/18 — I could not find their literal wording

I grepped the whole repo (`.md` files, PR #7's description, `docs/`, `client/specs/`,
`server/specs/`, `reviewer-core/`) for "criteri", "misses without", "catches with", and
variants. The **only** place the phrase "criteria 17/18" appears anywhere in this repo is
`docs/handoff/2026-09-21-skills-dilution.md:136`:

> "The recorded homework criteria 17/18 ('misses without, catches with') are not met by the
> current fixtures."

That line is itself a paraphrase, not a quotation of a rubric document — no numbered
homework-criteria document exists in this repo (I searched for `*rubric*`, `*homework*`,
`*brief*`, `*course*`, `*lesson*` filenames; nothing under those names exists here). Per the
brief's instruction, I am reporting that I could not verify the literal text rather than
paraphrasing further.

One thing worth flagging precisely because it's confusing: **other specs in this repo claim
overlapping criteria numbers for unrelated features.** `client/specs/severity-counters.md:3`
says "Homework criteria 16–19" for the severity-pill UI (counts and click-filtering, nothing
to do with a control experiment), and `server/specs/pr-list-findings.md:3` /
`client/specs/findings-popover.md:3` both say "Homework criteria 20–21" for the PR-list
findings count. If these specs and the handoff doc are drawing from the same master numbered
list, "17/18" sitting inside a block otherwise about severity pills is inconsistent with the
handoff's "misses without, catches with" description — I flag this as an open
inconsistency rather than resolving it, since the source list itself is not in the repo.

---

## Q3 — Knowledge audit of the seven seeded skills

I read each body from the DB (`skills.body`, ids and versions below) and classified every
rule as **(a)** general engineering knowledge a capable model already applies, **(b)** a
threshold/severity/scope policy the model could not guess unaided, or **(c)** a repo-specific
fact not inferable from a diff.

| Skill | id (version) | chars | (a) general | (b) policy/threshold | (c) repo-specific |
|---|---|---|---|---|---|
| `breaking-change` | 82c8e4aa… (v3) | 2013 | 4 | 4 | 0 |
| `response-schema` | 8cc74448… (v1) | 1784 | 6 | 3 | 1 |
| `semver-discipline` | 237334f6… (v1) | 1749 | 5 | 3 | 0 |
| `deprecation-policy` | bb628801… (v1, imported) | 1630 | 5 | 3 | 0 |
| `repo-conventions` | 02f09065… (v2, extracted) | 496 | 0 | 0 | 2 |
| `test-smells` | b1efbf44… (v1) | 1891 | 7 | 3 | 0 (1 embedded library fact) |
| `branch-coverage-gate` | 4dea8d32… (v1) | 1072 | 6 | 3 | 1 |
| **Total** | | | **33** | **19** | **4** (+1 partial) |

Notes on the interesting cells, quoting the body text:

- **`response-schema`'s one (c) rule**: *"A schema changed in `server` without the matching
  edit in the vendored client copy: the two are hand-mirrored, so one alone is a silent
  drift."* This is genuinely unguessable from a diff — it depends on knowing this repo keeps
  two hand-synced copies of shared types (confirmed independently:
  `client/CLAUDE.md`: *"API types come from `@devdigest/shared`, but this copy is not
  canonical. Change `server/src/vendor/shared` first and mirror here"*). This is exactly the
  kind of rule that could produce a real without/with split — but neither fixture PR touches
  a shared-contract type, so it never fires on PR #8 or #9.
- **`repo-conventions` is the *only* skill built entirely of (c) rules** — and it is also the
  smallest (496 chars, 2 rules): "Return undefined for HTTP 204 No Content responses in API
  fetch wrapper" and "Normalize every API error into ApiError…", both evidenced at
  `client/src/lib/api.ts:50` and `:61`. **Neither rule is about anything PR #8 (agent routes,
  server-side) or PR #9 (a retention-sweep pure function) touches.** The one skill that is
  structurally capable of adding headroom (because its content is un-guessable) has zero
  topical overlap with either fixture. Linking it can only dilute, never inform.
- **`branch-coverage-gate`'s one (c) rule** is buried in "How to report," not "Flag": *"say
  which existing test file the case belongs in (`*.test.ts` for unit, `*.it.test.ts` for
  anything needing Postgres)"* — this is this repo's real naming convention (confirmed:
  root `CLAUDE.md`, "Tests: unit `*.test.ts(x)`; server integration `*.it.test.ts`"), but it
  affects how a finding is *phrased*, not whether the defect is *caught*.
- **`test-smells`** embeds one Drizzle-specific fact inside an otherwise-general rule ("On a
  Drizzle row a missing column reads as `undefined`, so `not.toBeNull()` passes before the
  feature exists") — library-specific, not really repo-specific, and again not on either
  fixture's path (PR #9's `retention.ts` is a pure function, no Drizzle rows in play).
- **`semver-discipline`'s "Do not flag"** is the clause the handoff doc suspected of enabling
  the false "it's just a refactor" justification: *"An internal refactor behind an unchanged
  public surface — that is a patch."* I classify it (a) — it is textbook semver, correctly
  stated — the problem the handoff found is that PR #8's diff does *not* leave the public
  surface unchanged (the diff shows `- reply.status(201) / + reply.status(200)`), so a model
  applying this rule correctly should not trigger it. That it apparently did anyway is a
  reasoning/attention failure, not evidence the rule itself is unguessable knowledge.

**Reading**: 33 of 56 rules (59%) are general knowledge; 19 (34%) are severity/threshold
calibration (real, but changes *how* a catch is scored, not *whether* one happens); only 4–5
(7–9%) are true repo facts unreachable from a diff, and **none of those land on the code path
either fixture exercises**. A skill made of (a) cannot itself produce uplift on a fixture
that a capable model already reads correctly — which is exactly what Q1 shows for the
official 4/4-vs-0/4 pair on PR #8.

---

## Q4 — The fixture itself

### PR #8, as the model sees it (`scratchpad/prompt_no_skills.json`, no-skills arm)

I printed the full `system` (3233 chars) and `user` (11791 chars) fields. The diff block
(`## Diff to review`, inside `<untrusted source="diff">`) contains, verbatim:

```
@@ -102,7 +104,7 @@ export default async function agentsRoutes(appBase: FastifyInstance) {
       },
       userId,
     );
-    reply.status(201);
+    reply.status(200);
     return agent;
   });
```

plus two test-file hunks changing `expect(created.statusCode).toBe(201)` to
`.toBe(200)`. **The correct answer is fully determinable from the prompt alone, with zero
outside knowledge required**: the diff itself shows the code *changing* from 201 to 200. A
reviewer does not need to know this repo's conventions, REST semantics beyond "a status code
changed on an existing route," or anything about "the rest of the module" to flag it — the
before/after is right there in the `-`/`+` lines. This is the central reason the no-skills
baseline is 4/4 (and 6/6 with only `breaking-change`): nothing about catching this defect
requires inference past reading the diff.

### The planted claim, checked against the actual repo

PR #8's description says: *"the create handler answers 200 like the rest of the module."* I
checked this against `server/src/modules/agents/routes.ts` on this worktree (PR #8 is an
unmerged fixture branch, so this file still shows the pre-PR/base state): there are **nine**
route registrations in the file (`GET /agents`, `GET /agents/:id`, `POST /agents`,
`PUT /agents/:id`, `DELETE /agents/:id`, `GET /agents/:id/versions`, a second GET, `GET
/agents/:id/skills`, `POST /agents/:id/skills`, `GET /agents/:id/models`,
`GET /providers/:id/models`) and **exactly one** explicit `reply.status(...)` call in the
whole file — the create handler's `201` (line 105 pre-PR / line 107 post-PR). Every other
handler has no explicit status call, so Fastify's default (200) applies to all of them.

So, narrowly, **the claim "the rest of the module answers 200" is not false** — it's true by
Fastify default, since nothing else in the file sets a different code. What *is* false, and
is exactly what the all-five-skills runs invented, is the tense: the PR description describes
the *post-change* state ("answers 200… like the rest") as though it were an ambient fact,
and the skill-augmented runs extended that into *"the create handler already answered 200
before this PR"* — directly contradicted by the diff's own `- reply.status(201)` line, and
by the pre-existing integration test asserting `toBe(201)` that this same diff has to patch
(`server/test/agents-versions.it.test.ts`, `server/test/reviews.it.test.ts` — both hunks are
in the prompt). **The description plants a true, locally-scoped fact and lets the model
over-extend it into a false historical claim; it does not itself assert the false claim.**
This is a subtler trap than "the description lies," and it means the fixture is testing
attention/over-generalization under skill load, not knowledge the model lacks.

### PR #9, briefly (`gh pr diff 9`)

`server/src/modules/_shared/retention.ts` adds `shouldSweep()` with three independent
branches (`finishedAt === null`, `keepBlocking && blockers > 0`, age comparison) and one test
covering only the "sweeps an old finished run" path (`server/test/retention.test.ts`). There
is no hidden bug — the guard logic is correct as written (verified by reading it, see Q1).
The "defect" here is a coverage gap, not a live regression, so "misses without, catches with"
for PR #9 can only ever mean "flags the gap at all," and per Q1 the baseline does flag gaps
(as WARNING/SUGGESTION) in 4 of 6 runs — it never escalates to CRITICAL, which is a severity
question, not a detection question. PR #9 is a weaker test of "does the reviewer see
something it otherwise wouldn't" than PR #8, because there both configs already see the same
untested branches; only the color changes.

---

## Q5 — Three fixture designs that could honestly show "misses without, catches with"

All three are grounded in a real, evidenced convention already in this repo — none are
invented for this report. For each, I state the rule, the diff, why a no-skills model would
plausibly pass it, and how to verify the miss before trusting it.

### 1. Secrets/config bypass (`process.env` instead of `container.secrets`)

**Rule**, `server/CLAUDE.md` ("Boundaries"): *"Secrets only through `container.secrets`,
never `process.env` or `AppConfig` directly."* Real usage evidence:
`server/src/modules/repos/service.ts:53` — `const token = await
this.container.secrets.get(GITHUB_TOKEN_SECRET);`.

**The diff**: add a new integration (e.g. a Slack-webhook notifier) whose service reads its
API token with `const token = process.env.SLACK_WEBHOOK_TOKEN;` directly, instead of adding
it to `container.secrets`. The code is syntactically and functionally fine — it will run.

**Why a no-skills model plausibly approves it**: `process.env.X` is completely idiomatic
Node.js and appears in thousands of tutorials; nothing about it looks wrong to a reviewer
without this repo's own architecture rule. It breaks no HTTP contract, so the API Contract
Reviewer's existing skills (all keyed on request/response shape) wouldn't catch it even if
attached — this needs a `secrets-discipline`/onion-boundary-flavored skill, not the current
five.

**How to verify the miss before relying on it**: run the no-skills baseline at least 4–6
times, pinned to one provider, and read every finding's title/rationale (not just
`blockers`) to confirm none of them independently reinvents "read secrets through the
container" — a strong model might still flag `process.env` on general "don't hardcode
config" grounds even without the repo rule, which would spoil the fixture. If any no-skills
run mentions config/secrets handling at all, this fixture is contaminated and needs a subtler
violation (e.g., burying the `process.env` read three calls deep in a helper).

### 2. Missing `Retry-After` header on a new rate-limited route

**Rule**, `conventions` table (status `pending`, category `error-handling`, evidence
`src/middleware/ratelimit.ts:41`): *"Rate-limit rejections answer 429 with a Retry-After
header."*

**The diff**: add a new route with rate limiting that returns `reply.status(429).send({
error: { code: 'rate_limited', message: '…' } })` but never sets the `Retry-After` header.

**Why a no-skills model plausibly approves it**: HTTP 429 alone is a fully valid, standard
response; `Retry-After` is RFC-recommended, not mandatory, so a generic API reviewer has no
external reason to expect it. Only a rule that has actually read this codebase's rate-limit
middleware would know every other 429 in this repo carries it, making the new route an
inconsistent contract for existing callers that already branch on that header.

**How to verify the miss before relying on it**: this rule is currently only a `pending`
candidate, not yet in the `repo-conventions` skill body — accept it first (it needs to
survive the same evidence check the other two accepted rules did), then run the no-skills
baseline several times on a diff that touches *only* the new route (not the rate-limit
middleware itself, which would give the game away by proximity) and confirm no run mentions
headers on a 429 unprompted.

### 3. Hand-edited migration instead of `drizzle-kit generate`

**Rule**, root `CLAUDE.md` ("Do-not-touch"): *"`server/src/db/migrations/` (including
`meta/`) — never hand-edit. Change the schema, then `pnpm db:generate` and
`pnpm db:migrate`."*

**The diff**: add a column directly inside an existing generated migration SQL file (and its
matching `meta/_journal.json` entry) instead of changing the Drizzle schema and regenerating.
The SQL itself is valid and would run.

**Why a no-skills model plausibly approves it**: a migration file is *supposed* to contain
SQL DDL — a new `ALTER TABLE … ADD COLUMN` inside one looks exactly like what a migration
file is for. Nothing about the diff looks unusual unless the reviewer already knows this
repo treats migrations as generated artifacts whose `meta/` snapshot must stay in lock-step
with drizzle-kit's own bookkeeping (a fact that lives only in the CLAUDE.md, not in the code
itself — the file doesn't self-document why it must never be hand-edited).

**How to verify the miss before relying on it**: this is the strongest of the three for
producing a genuine surprise, because there is no plausible way for a model to infer
drizzle-kit's journal/snapshot invariants from the diff — but it is also outside the current
API Contract / Test Quality agents' stated remit (neither is scoped to migration hygiene), so
it would need a new skill and either a new agent or a broadened one. Verify by running the
no-skills baseline and confirming it does not independently object to "editing a migration
file" on generic-diligence grounds (a strong model sometimes does flag "migrations are
usually generated" from training-data familiarity with Rails/Drizzle/Prisma conventions in
general — if it does, this fixture is contaminated too, and the diff should be changed to
edit `meta/_journal.json`'s hash *alone*, a change with no plausible-looking justification at
all).

---

## What I did not check, and what would change my read

- I did not run any LLM calls (per the brief; this was a design audit only). Everything
  above is either a DB read, a repo read, or a `gh pr view`/`gh pr diff` call.
- I did not independently re-run the OpenRouter provider sweep (`h5_results.jsonl` /
  `docs/handoff/2026-09-21-skills-dilution.md`'s H5 table) — I treated it as already-produced
  evidence and cross-checked its headline claims (the 07:02–07:11 window, the 7186-token
  signature, the all-five 0/4-in-window result) against the app's own `agent_runs` /
  `run_traces` tables, which is an independent data source from that sweep and agrees with it.
  If that sweep's methodology were flawed in a way that also affects `agent_runs`
  (e.g. a shared bug in how the app itself talks to OpenRouter), my corroboration would not
  catch it.
- I did not verify whether the `conventions` table's `pending` rows (used in Q5) would
  actually survive `verifyCandidates`' evidence check if re-scanned — I only confirmed the
  evidence line existed via `find`/`grep`, not that the specific snippet quoted in `rule`
  matches that exact line today. A stale evidence pointer would weaken proposal #2
  specifically.
- I did not read `../decisions/2026-09-20-skill-trust-model.md` (outside the repo) — the
  embedding-defect mechanics (heading collision, `<untrusted>` wrapping) are flagged in the
  brief as another analyst's focus, and I stayed out of that lane per the brief's "stay
  inside it."
- If a homework rubric document with literal criteria 17/18 text turns up somewhere outside
  this repo (e.g. the course platform), my Q2 conclusion that the wording is unverifiable
  in-repo would need updating — the substance (no PR shows the without/with split) would not.

## Evidence index

- DB queries and their SQL are in `scratchpad/q1_headroom.sql`, `q1_runs.sql`,
  `q1_findings.sql`, `q1_critical_titles.sql`, `q1_f7e8_detail.sql`, `q3_skills.sql`,
  `q5_conventions.sql`, run via `scratchpad/dbq.sh` / `dbqf.sh` (helper scripts that read
  `DATABASE_URL` into a shell variable and never print it, to satisfy the "never echo the
  connection string" rule).
- Skill bodies dumped verbatim to `scratchpad/skillbody_<name>.txt`.
- `gh pr view 7/8/9 --repo HlibHav/dev-digest` and `gh pr diff 9 --repo HlibHav/dev-digest`,
  run read-only.
- `server/src/modules/agents/routes.ts` and `server/CLAUDE.md` / `client/CLAUDE.md` / root
  `CLAUDE.md` read directly from the worktree.
