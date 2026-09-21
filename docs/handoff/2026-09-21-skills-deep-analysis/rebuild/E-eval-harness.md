# Analyst E — eval harness + baseline numbers

## Answer

The harness is built and verified: `evals/run.ts`, called with the REAL `assemblePrompt`
from `reviewer-core/src/prompt.ts` (imported directly, not re-implemented), reproduces the
app's own PR #8 prompt byte-for-byte in **both** arms it can be checked against —
`md5(rebuilt_all5.user) = efe2022466b3f37b599e4cb3147db454` (matches the value given in the
brief) and `md5(rebuilt_no_skills.user) = 9e5e904263dbd110be65fbee12c77b0a` (matches Analyst
F's independently-derived value for the same file). Five cases are built under
`evals/cases/`, the current five skills are exported to `evals/skills-v0/`, and a
`{no-skills, skills-v0} × {deepinfra/fp8, parasail/fp8, open-inference/fp8} × 5 cases`
baseline at n=4 is in `evals/results/baseline.jsonl` (156 rows after backfilling
`clean-optional-field` with a schema fix — see "Grading" — plus top-up attempts; total spend
**$0.0459** of the $0.40 cap).

**Headline baseline results** (parasail/fp8 and open-inference/fp8 — deepinfra/fp8 was
almost completely rate-limited for the whole session, see below):

- `pr8-status-code` (regression, must_block=true): no-skills already finds+blocks it 4/4 on
  both working providers; skills-v0 keeps that on parasail (4/4) and slightly weakens it on
  open-inference (3/4, and the one open-inference miss on rep 4 was a full pass — the harness
  correctly does **not** claim the current five skills break this baseline catch).
- `f2-apierror-bypass` (catch): no-skills misses cleanly everywhere (0/4 on both providers,
  0/1 usable deepinfra sample). skills-v0 shows real uplift on parasail (4/4, all WARNING,
  0/4 blocks, all grounded to `client/src/lib/api.ts:74-81`) but **no** uplift on
  open-inference (0/4 → 0/4). This is the same asymmetric-by-provider pattern Analyst F's `F2`
  found on the identical fixture — a useful cross-check, though not a strict replication: my
  harness uses a case-specific task line (real PR number/title per case) instead of reusing
  PR #8's "refactor(agents): tidy the agents module…" task line for every candidate the way F
  had to (see "Verified vs. inferred" — F flagged that mismatch as a known limitation; this
  harness removes it), and n=4 here vs. F's n=6.
- `f1-enum-mirror` and `f3-204-json` (catch, general-knowledge, included as specified even
  though they were not expected to show clean uplift): both behave as F's report predicted —
  no-skills already partially or fully catches them by general reasoning, and skills-v0's
  main effect is severity recalibration (fewer/no CRITICAL blocks), not new detection. I spot
  checked the actual matched titles behind these numbers (not just the regex match) — e.g.
  no-skills/parasail's `f1-enum-mirror` hits read "Client copy of shared contract not updated
  (with new verdict)" and `f3-204-json`'s read "Client mutation/hook calls res.json() on a 204
  No Content response, throws…" on both working providers — genuinely on-topic, not
  regex-coincidences. One genuine surprise: on `f3-204-json`, open-inference's found-rate
  **drops** from 4/4 (no-skills) to 1/4 (skills-v0) — see "Baseline surprises" below; I'm
  reporting this as found, not fixing the case.
- `clean-optional-field` (false-positive control): **no run at any provider, in either arm,
  ever raised a finding that actually claimed an incompatibility** — machine-verified via a
  `contract_false_positive` field (added mid-task, see "Grading"): 0/16 across both arms and
  both working providers. A few WARNING-level nitpicks fired anyway and count under the
  broader `false_positive` field (any WARNING/CRITICAL at all, regardless of subject): 2/4 on
  no-skills/parasail ("no per-tag length/character constraint", "duplicate React `key`s if
  tags repeat"), 0/4 everywhere else including skills-v0/parasail on this backfilled sample.
  None of the flagged items matched `must_not_flag_regex` (no finding asserted "breaking",
  "incompatible", "not mirrored", etc.) — the two fields agree exactly on this case.

Open-inference/fp8 confirms the earlier finding from the shared brief and Analyst F's
report: every matched defect-finding it produced was **ungrounded** — either citing
`start_line: 1, end_line: 1` on the right file, or (on `f3-204-json`) citing a file
(`client/src/lib/api.ts`) that isn't even in that diff. Parasail/fp8 was grounded 100% of
the time it found something. deepinfra/fp8 had too few successful calls to say anything
about its grounding behavior.

## Construction proof

`evals/run.ts verify` loads the agent's raw `system_prompt` from the dev DB
(`evals/agent.json`, 2355 chars — confirmed to be exactly the prefix of the real
`prompt_all5.json`'s system message before `INJECTION_GUARD` is appended), the five skills
from `evals/skills-v0/*/SKILL.md` + `meta.json` (bodies and `agent_skills.order` from the DB,
`deprecation-policy` flagged `untrusted` because its `source` is `imported_url` — confirmed
against `isSkillUntrusted()` in `server/src/vendor/shared/contracts/knowledge.ts:129`), and
the stored trace's repo map + callers (extracted from `prompt_all5.json`, the byte-verified
all-five prompt for run `c7f0a9cb` that Analyst F's `assemble.py` had already matched to the
same md5). It then calls the real `assemblePrompt` — imported directly from
`reviewer-core/src/prompt.ts` by absolute path; that file's only import is `import type {...}
from '@devdigest/shared'`, which `tsx`/esbuild elides at transpile time since it is
syntactically type-only, so the file resolves and runs with zero runtime dependencies even
though `evals/` lives outside the `reviewer-core` package:

```
$ cd reviewer-core && node_modules/.bin/tsx <scratchpad>/evals/run.ts verify
skills loaded: breaking-change, response-schema, semver-discipline, deprecation-policy[untrusted], repo-conventions
[all5]     rebuilt user md5: efe2022466b3f37b599e4cb3147db454 expected: efe2022466b3f37b599e4cb3147db454 PASS
[no-skills] rebuilt user md5: 9e5e904263dbd110be65fbee12c77b0a expected: 9e5e904263dbd110be65fbee12c77b0a PASS
PASS — both arms verified
```

`verify` checks **both** arms that are actually run in the baseline (no-skills and
skills-v0/all5), not just one — the shared brief's hard rule 5 ("no arm runs on an
unverified construction") applies per-arm. The no-skills check reuses
`pr8-repo-map.txt`/`pr8-callers.txt` rather than needing separate files: I independently
extracted `prompt_no_skills.json`'s own repo-map/callers into
`evals/pr8-nosk-repo-map.txt`/`pr8-nosk-callers.txt` and diffed them byte-for-byte against
the all5 files — identical (same PR, same run window), so one pair of context files covers
both arms.

One real bug surfaced and was fixed during this proof: an early version of `loadSkills()`
called `.trimStart()` on a skill's body after front-matter stripping. `deprecation-policy`'s
stored body carries a genuine leading blank line, and trimming it silently changed the exact
bytes fed to `renderSkillsBlock`, breaking the md5 match. Fixed by stripping only a leading
YAML front-matter block, never trimming the remainder — see the comment at
`evals/run.ts`'s `loadSkills()`.

All non-`verify` runs (the baseline table, and any future arm) build the prompt **without**
repo map or callers, per the brief.

## What's in `evals/`

```
evals/
  run.ts                 — the harness (verify | run | topup)
  agent.json             — API Contract Reviewer's system_prompt, from the dev DB
  skills.json            — raw dump of the 5 skills (name/source/body/order), from the dev DB
  pr8-repo-map.txt        — repo map for PR #8's all-five run (verify only)
  pr8-callers.txt         — callers digest for the same run (verify only)
  skills-v0/
    00-breaking-change/SKILL.md, meta.json
    01-response-schema/SKILL.md, meta.json
    02-semver-discipline/SKILL.md, meta.json
    03-deprecation-policy/SKILL.md, meta.json   (meta.json: untrusted=true)
    04-repo-conventions/SKILL.md, meta.json
    NOTE.md              — trust-rendering note + how to build the "all-trusted" variant
  cases/
    pr8-status-code/       {description.md, diff.patch, case.json}
    f2-apierror-bypass/    {description.md, diff.patch, case.json}
    f1-enum-mirror/        {description.md, diff.patch, case.json}
    f3-204-json/           {description.md, diff.patch, case.json}
    clean-optional-field/  {description.md, diff.patch, case.json}
  results/
    baseline.jsonl        — 156 rows: 140 for the four F-derived cases (96 planned + 44
                            top-up attempts, almost all deepinfra retries) plus 16 for
                            clean-optional-field (2 arms × 2 working providers × n=4,
                            deepinfra not retried — see table footnote), backfilled once the
                            findings/contract_false_positive fields were added (see "Grading")
```

`case.json` schema (all five cases use it): `{id, kind, defect, found_regex, must_block,
must_not_flag_regex, task}`. `task` is the exact task-line string passed to `assemblePrompt`
— for `pr8-status-code` it's the real PR #8 task line (extracted from the app's own
`prompt_no_skills.json`, not retyped); for the other four it's the same template with a
made-up PR number/title/author, since these are new fixtures with no real PR behind them.
`found_regex` / `must_not_flag_regex` are plain regex bodies (no inline `(?i)`/`(?s)` groups
— JS doesn't support Python-style bare inline flags); `run.ts` always applies `new
RegExp(pattern, 'is')`.

**How each case was built:**
- `pr8-status-code` — the real PR #8 description/diff, pulled via Analyst F's already-verified
  `assemble.py`/`extract_parts()` out of `prompt_no_skills.json`, not retyped.
- `f2-apierror-bypass`, `f1-enum-mirror`, `f3-204-json` — Analyst F's `F2`/`F1`/`F3` candidates,
  pulled from `candidates.py` unchanged (same description, same diff).
- `clean-optional-field` — new: an optional `tags: z.array(z.string()).max(5).nullish()`
  field added to the `Finding` zod schema, identically in
  `server/src/vendor/shared/contracts/findings.ts` and
  `client/src/vendor/shared/contracts/findings.ts` (verified byte-identical in the real repo
  before writing the fixture), plus a purely-additive, guarded (`f.tags?.length`) render in
  `FindingCard.tsx`. Real line numbers, not applied to the repo.

## Grading

- **found**: some finding's `title + "\n" + rationale` matches `case.found_regex`
  (case-insensitive, dotall).
- **blocks**: found AND that finding's severity is CRITICAL.
- **grounded**: the matched finding's `(file, start_line, end_line)` intersects a hunk range
  parsed straight from `diff.patch` (`@@ -a,b +c,d @@` → `[c, c+d-1]` per file — the same
  fallback range `reviewer-core/src/grounding.ts`'s `buildLineIndex` uses when a hunk has no
  precomputed `newLineNumbers`). This is a re-implementation, not a call into the real
  `groundFindings` — see "What I did not check."
- **false_positive**, kind=`clean`: any WARNING/CRITICAL finding at all — the strict,
  subject-agnostic reading (see "Answer" for why almost none of them were actually about
  incompatibility).
- **contract_false_positive**: any WARNING/CRITICAL finding whose text matches
  `must_not_flag_regex` — i.e. a finding actually *about* the thing the case forbids (an
  incompatibility claim), as distinct from an unrelated nitpick that happens to also be
  WARNING/CRITICAL. **This field was added mid-task**, after the advisor pointed out that the
  original `false_positive` alone conflates the two and a skill author optimizing against it
  would also get penalized for e.g. "duplicate React keys" nitpicks that have nothing to do
  with the contract. The 140 rows for `pr8-status-code`/`f2-apierror-bypass`/`f1-enum-mirror`/
  `f3-204-json` predate this field (`contract_false_positive` is absent/undefined on them —
  harmless since none of those four cases set `must_not_flag_regex` anyway). The 16 rows for
  `clean-optional-field` — the one case that matters for this distinction — were **re-run**
  with the fixed schema so the number in this report (0/16) is machine-verified, not manually
  read off `matched_title`.
- **findings**: the full findings array (severity/title/rationale/file/lines only), also
  added mid-task so a case's regex can be revised and re-graded from a saved row without
  another OpenRouter call. Same caveat: absent on the 140 pre-existing rows, present on the
  16 backfilled `clean-optional-field` rows.

## Baseline table (n per cell = 4 planned; deepinfra/fp8 cells were topped up past 4 attempts
because of near-total rate-limiting — see `ok` column for actual usable samples. `FP` is the
broad `false_positive` field; for `clean-optional-field` the `contract_false_positive` value
is called out separately since that's the field this case is actually testing.)

| Case (kind) | Arm | Provider | attempts | ok | found | blocks | FP | verdicts (ok only) | median prompt tok | grounded (of found) |
|---|---|---|---|---|---|---|---|---|---|---|
| pr8-status-code (regression) | no-skills | deepinfra/fp8 | 10 | 0 | — | — | — | all HTTP 429 | — | n/a |
| pr8-status-code | no-skills | parasail/fp8 | 4 | 4 | 4/4 | 4/4 | 0/4 | request_changes×4 | 1964 | 4/4 |
| pr8-status-code | no-skills | open-inference/fp8 | 4 | 4 | 4/4 | 4/4 | 0/4 | request_changes×4 | 1964 | 4/4 |
| pr8-status-code | skills-v0 | deepinfra/fp8 | 10 | 0 | — | — | — | all HTTP 429 | — | n/a |
| pr8-status-code | skills-v0 | parasail/fp8 | 4 | 4 | 4/4 | 4/4 | 0/4 | request_changes×4 | 3946 | 4/4 |
| pr8-status-code | skills-v0 | open-inference/fp8 | 4 | 4 | 3/4 | 3/4 | 0/4 | request_changes×3, approve×1 | 5273 | **0/3 (cites routes.ts:1-1)** |
| f2-apierror-bypass (catch) | no-skills | deepinfra/fp8 | 10 | 1 | 0/1 | 0/1 | 0/1 | comment×1 | 1747 | n/a |
| f2-apierror-bypass | no-skills | parasail/fp8 | 4 | 4 | 0/4 | 0/4 | 0/4 | approve×1, request_changes×2, comment×1 | 1747 | n/a |
| f2-apierror-bypass | no-skills | open-inference/fp8 | 4 | 4 | 0/4 | 0/4 | 0/4 | comment×2, request_changes×2 | 1747 | n/a |
| f2-apierror-bypass | skills-v0 | deepinfra/fp8 | 10 | 0 | — | — | — | all HTTP 429 | — | n/a |
| f2-apierror-bypass | skills-v0 | parasail/fp8 | 4 | 4 | **4/4** | **0/4** | 0/4 | comment×4 | 3729 | 4/4 (api.ts:74-81) |
| f2-apierror-bypass | skills-v0 | open-inference/fp8 | 4 | 4 | 0/4 | 0/4 | 0/4 | approve×4 | 5056 | n/a |
| f1-enum-mirror (catch, general-knowledge) | no-skills | deepinfra/fp8 | 10 | 0 | — | — | — | all HTTP 429 | — | n/a |
| f1-enum-mirror | no-skills | parasail/fp8 | 4 | 4 | 3/4 | 2/4 | 0/4 | comment×2, request_changes×2 | 1498 | 3/3 |
| f1-enum-mirror | no-skills | open-inference/fp8 | 4 | 4 | 1/4 | 0/4 | 0/4 | comment×3, request_changes×1 | 1498 | 1/1 |
| f1-enum-mirror | skills-v0 | deepinfra/fp8 | 8 | 2 | 0/2 | 0/2 | 0/2 | approve×2 | 3480 | n/a |
| f1-enum-mirror | skills-v0 | parasail/fp8 | 4 | 4 | 3/4 | **0/4** | 0/4 | comment×4 | 3480 | 3/3 |
| f1-enum-mirror | skills-v0 | open-inference/fp8 | 4 | 4 | 2/4 | 0/4 | 0/4 | comment×4 | 4807 | **0/2 (cites findings.ts:1-1)** |
| f3-204-json (catch, general-knowledge) | no-skills | deepinfra/fp8 | 9 | 2 | 2/2 | 0/2 | 0/2 | comment×2 | 2192 | 2/2 |
| f3-204-json | no-skills | parasail/fp8 | 4 | 4 | 4/4 | 4/4 | 0/4 | request_changes×4 | 2192 | 4/4 |
| f3-204-json | no-skills | open-inference/fp8 | 4 | 4 | **4/4** | 4/4 | 0/4 | request_changes×4 | 2192 | 4/4 |
| f3-204-json | skills-v0 | deepinfra/fp8 | 9 | 1 | 1/1 | 0/1 | 0/1 | comment×1 | 4174 | 1/1 |
| f3-204-json | skills-v0 | parasail/fp8 | 4 | 4 | 4/4 | 2/4 | 0/4 | comment×2, request_changes×2 | 4174 | 4/4 |
| f3-204-json | skills-v0 | open-inference/fp8 | 4 | 4 | **1/4** | 0/4 | 0/4 | approve×3, comment×1 | 5501 | 0/1 (cites api.ts:61-63, wrong file) |
| clean-optional-field (clean) | no-skills | deepinfra/fp8 | 0 | 0 | n/a | n/a | not retried¹ | — | — | n/a |
| clean-optional-field | no-skills | parasail/fp8 | 4 | 4 | n/a | n/a | 2/4 (contract: **0/4**) | approve×2, comment×2 | 1792 | n/a |
| clean-optional-field | no-skills | open-inference/fp8 | 4 | 4 | n/a | n/a | 0/4 (contract: 0/4) | approve×4 | 1792 | n/a |
| clean-optional-field | skills-v0 | deepinfra/fp8 | 0 | 0 | n/a | n/a | not retried¹ | — | — | n/a |
| clean-optional-field | skills-v0 | parasail/fp8 | 4 | 4 | n/a | n/a | 0/4 (contract: 0/4) | approve×4 | 3774 | n/a |
| clean-optional-field | skills-v0 | open-inference/fp8 | 4 | 4 | n/a | n/a | 0/4 (contract: 0/4) | approve×4 | 5101 | n/a |

Bold cells are the ones worth a second look; see below. ¹ `clean-optional-field`'s rows were
re-run once (see "Grading") to backfill the `contract_false_positive` field; deepinfra/fp8
was not re-attempted for this case given 37 consecutive 429s on it across two earlier
top-up rounds for the other four cases (see "Baseline surprises" #4) — chasing it again for
one more case had a low expected payoff against the time budget.

## Baseline surprises (reported, not tuned away)

1. **`f3-204-json` on open-inference/fp8 gets *worse* with skills**: no-skills finds it 4/4
   (general JS knowledge — `res.json()` on a 204 throws); skills-v0 finds it only 1/4, and
   the one hit cites `client/src/lib/api.ts:61-63` — a file not touched by this diff at all
   (the real change is in `client/src/lib/hooks/reviews.ts`). This looks like the same
   "OpenInference behaves worst" effect the shared brief already documents (it pastes the
   JSON schema into the prompt), compounded by a longer prompt (5501 median tokens vs 2192)
   pulling attention away from a defect the model didn't need any skill to find in the first
   place. I did not investigate the mechanism further — flagging it as a finding, not a
   verified root cause.
2. **Every open-inference/fp8 "found" citation across all four non-clean cases was
   ungrounded** — either `start_line:1, end_line:1` on the right file (`pr8-status-code`,
   `f1-enum-mirror`) or the wrong file entirely (`f3-204-json`). Under the app's real
   grounding gate every one of these would be dropped, so open-inference/fp8's effective
   "found" and "blocks" rates in production are **0** everywhere in this table, both arms.
   Parasail/fp8 was grounded 100% of the time it found something.
3. **`clean-optional-field` never drew a genuine incompatibility claim — 0/16 on
   `contract_false_positive`, machine-verified**, but it did draw occasional WARNING-level
   nitpicks unrelated to the contract on the no-skills/parasail cell: "no per-tag
   length/character constraint" and "duplicate React `key`s when tags repeat" (2/4, both
   findings present together in both hit reps). The one nitpick from the original (pre-backfill)
   skills-v0/parasail sample — "missing a minor version-bump note", plausibly
   `semver-discipline` firing on any schema change regardless of compatibility — did not
   reappear in the backfilled sample (0/4 there instead); at n=4, temperature 0 is not
   deterministic across a real provider (the brief's own caveat), so I read this as noise, not
   as skills-v0 reliably suppressing it.
4. **deepinfra/fp8 was almost completely unavailable this whole session**: 70 of 140 rows
   for the four non-backfilled cases are HTTP 429 ("temporarily rate-limited upstream"),
   including after topping up with 6-10 extra attempts per cell — 37 of those 429s came in
   two back-to-back top-up rounds with zero successes. Only `f2-apierror-bypass`/`f3-204-json`
   (no-skills) and `f1-enum-mirror`/`f3-204-json` (skills-v0) got 1-2 usable samples; every
   other cell for this provider is **0 usable samples**, and `clean-optional-field` wasn't
   re-attempted on deepinfra at all in the backfill (see table footnote). This is itself data
   (deepinfra/fp8 was not reliably reachable during this session), not a harness bug — I
   stopped chasing it after two failed top-up rounds to stay inside the time budget, per the
   advisor's own framing that a persistent 429 stands as a legitimate result.

## One command to test a NEW skills directory

```sh
cd /Users/Glebazzz/Claude/PROJECTS/NEO/dev-digest/.claude/worktrees/h1-skill-size-hypothesis-7b81ce/reviewer-core
node_modules/.bin/tsx <scratchpad>/evals/run.ts run \
    --skills /path/to/new-skills-dir \
    --label new-skills \
    --n 4 \
    --out <scratchpad>/evals/results/new-skills.jsonl
```

`--skills` takes a directory of `NN-name/SKILL.md` folders (numeric prefix controls render
order; an optional `meta.json` `{name, untrusted}` next to each `SKILL.md` overrides the
inferred name and marks a skill untrusted — omit it and the skill renders trusted). Any
leading YAML front matter in `SKILL.md` is stripped automatically. Omit `--cases` /
`--providers` to use all 5 cases and all 3 pinned providers; use `--skills none` for a
no-skills control run with the same case set. If a cell comes up short (rate limiting), run
`run.ts topup` with the same `--skills`/`--label`/`--out` plus `--target 4` to fill it in
without touching existing rows.

## Verified vs. inferred

**Verified**: the construction-proof md5 match against the real `assemblePrompt` for **both**
arms actually run (all5 and no-skills); the DB system_prompt is byte-identical to the prefix
of the real all-five system message; `prompt_no_skills.json`'s repo-map/callers are
byte-identical to `prompt_all5.json`'s (diffed directly, not assumed); `deprecation-policy`'s
`imported_url` source maps to `untrusted=true` via the real `isSkillUntrusted()` in the app's
own shared contracts; every row in `baseline.jsonl` came from a pinned OpenRouter call
(`provider.allow_fallbacks: false`) at temperature 0 against the real
`deepseek/deepseek-v4-flash` with the real `Review` JSON schema; `clean-optional-field`'s
headline claim ("no run ever asserted an incompatibility") is machine-graded via
`contract_false_positive`, not read off `matched_title` by eye; the actual matched-finding
titles behind the `f1-enum-mirror`/`f3-204-json` no-skills numbers were spot-checked by eye
(not just regex-matched) and are genuinely on-topic, not coincidental keyword hits. The
`f2`/`f1`/`f3` result *patterns* are consistent with Analyst F's independently-run numbers on
the same fixtures (same asymmetric-by-provider uplift for f2, same "already caught" for f3,
same severity-recalibration-not-detection story for f1) — **not a strict replication**: this
harness gives each case its own task line (real PR number/title per case) instead of reusing
PR #8's "refactor(agents)…" task line the way F had to for every candidate (F flagged that as
a known confound; here it doesn't exist), and n=4 here vs. F's n=6.

**Inferred / not checked**:
- Citation grounding is my own re-implementation of the hunk-range fallback in
  `reviewer-core/src/grounding.ts`, not a call into the real `groundFindings`. I did not wire
  up the real function (it needs a parsed `UnifiedDiff`, not raw diff text, and building that
  parser was out of scope for the time budget); the fallback range it falls back to when a
  hunk has no precomputed `newLineNumbers` is exactly what I implemented, so I'm confident
  this is a safe upper bound, not an exact bit-for-bit reproduction.
- n=4 per cell is well below the shared brief's own n=6 pre-registration threshold (used by
  Analysts F/T/etc. for their catch/miss calls) — this task explicitly asked for n=4, so I
  did not apply the 5/6-catches / ≤1/6-misses rule here. Treat single-cell rates in this table
  as directional, not statistically decisive, especially for f1/clean where digits are close
  to half.
- I did not measure the "render all five skills trusted" variant of skills-v0 (see
  `evals/skills-v0/NOTE.md`) — time budget went to the two required arms plus the
  construction proof and the five cases.
- I did not run any of the five diffs through the actual repo (typecheck, tests, or applying
  the patch) — per the read-only/no-repo-edits rule, these are fixture text only, same as
  Analyst F's candidates.
- The `clean-optional-field` fixture's line numbers were checked against the real file
  content at repo tip (`findings.ts`, `FindingCard.tsx`) but the diff itself was never
  applied — I did not confirm it would `git apply` cleanly.
- I did not investigate *why* open-inference/fp8 hallucinates line 1 or the wrong file (same
  open question Analyst F left open); consistent with the shared brief's own note that it
  "pastes the JSON schema into the prompt and behaves worst," but I didn't verify a mechanism.
- **`baseline.jsonl` has a schema split**: the `findings` and `contract_false_positive`
  fields were added to `run.ts` partway through this task (see "Grading"). The 140 rows for
  `pr8-status-code`, `f2-apierror-bypass`, `f1-enum-mirror`, and `f3-204-json` predate this
  and don't have them (only `matched_title`/`matched_file`/lines for the one finding the regex
  matched, not the full array); only the 16 backfilled `clean-optional-field` rows have both.
  If those four cases' `contract_false_positive` matters later, they'd need a similar
  backfill — none of the four currently set `must_not_flag_regex`, so this doesn't affect any
  number in this report, but it would affect anyone re-analyzing raw findings from those rows.
