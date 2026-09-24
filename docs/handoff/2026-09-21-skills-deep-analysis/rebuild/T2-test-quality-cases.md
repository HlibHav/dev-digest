# Analyst T2 — Test Quality Reviewer house-rule cases

## Answer

Of the two house facts tested against the pre-registered bar ("baseline finds it ≤ 1/6 on
Parasail"), **one qualifies cleanly and is not covered by either currently shipped skill**:
`catch-provider-mock-gap` — a new integration test whose `MockLLMProvider` is registered
under a single provider id, matching today's registry default, instead of every id
`resolveFeatureModel` could resolve to (the exact bug commit `f5323f7` fixed for real, and
recorded in `server/INSIGHTS.md`). No-skills finds it **0/6 on Parasail and 0/3 (1 timeout)
on AtlasCloud** — a clean miss on both providers. Critically, **the currently shipped
`skills-tq-v0` (branch-coverage-gate + test-smells) shows zero uplift: also 0/6 and 0/4.**
Every response in both arms converges on the same generic complaint ("test does not verify
which model/provider was actually used") without ever naming the mechanism (one provider id
vs. a swappable registry) — the model senses something is thin about the assertion but never
reaches the specific repo fact. This is a genuine, currently-unclosed gap: a real candidate
rule for a future skill, not something the two shipped skills already handle.

The second candidate, `catch-db-test-misnamed` (a DB-touching test named `*.test.ts` instead
of `*.it.test.ts`, so `server-unit.yml`'s `--exclude '**/*.it.test.ts'` does not exclude it),
is a **near-miss, confounded**: no-skills finds it 1/6 on Parasail and 1/4 on AtlasCloud —
borderline against the ≤1/6 bar, and skills-tq-v0 finds it 0/6 and 0/4 (skills suppress the
one weak catch rather than help). But the one real hit ("File name does not follow
integration test convention") shares space with an *unintended* second defect in my own
fixture — the `if (!hasDocker) return` / `if (!pg) return` guard silently passes with no
assertion run when Docker is absent, which several runs flag instead (CRITICAL/WARNING,
unrelated to the misnaming). That confound means this case's "found" rate is not a clean
read on the misnaming fact alone — see "Baseline surprises."

A third candidate, `catch-drizzle-undefined` (`expect(row.retryCount).not.toBeNull()` on a
column no production code ever populates — almost verbatim the currently-shipped
`test-smells` skill's own example), **does not qualify**: no-skills already finds it 6/6 on
Parasail (2/4 on AtlasCloud). This is a clean confirmation that this specific rule is general
ORM-footgun knowledge a reasoning model already applies, matching why it was already safe to
ship inside `test-smells`.

The clean case (`clean-retention-branch-covered`, a correctly branch-covered guard with a
dedicated assertion for each new path) drew no genuine false positive in either arm: no-skills
0/5 (Parasail, 1 timeout) and 1/4 (AtlasCloud, a fair-if-pedantic WARNING about relying on an
implicit default); skills-tq-v0 was clean 0/6 and 0/4. The regression case (PR #6's real
diff — a new digest-sharing module with zero tests) held on Parasail in both arms (6/6 found,
6/6 blocks) and did not clearly regress on AtlasCloud (found 3/4 → 3/4, blocks 3/4 → 2/4; at
n=4 that one-block difference is not distinguishable from noise).

## Construction proof

`evals-tq/run-tq.ts` (adapted from Analyst E's `evals/run.ts`, mechanics unchanged: the real
`assemblePrompt` from `reviewer-core/src/prompt.ts`, pinned OpenRouter calls, temperature 0,
strict `Review` json_schema) loads the Test Quality Reviewer's real `system_prompt` (agent id
`f3451435-c875-42f3-b115-7f9b29d7ff69`, `md5=2338b225bd5141cff62c4032677c543b`, matching the
value already confirmed in `reports/T-pr6-test-quality.md`) from `evals-tq/agent-tq.json`, and
its two current skills (`branch-coverage-gate`, `test-smells`, both `source=manual`, i.e.
trusted, `agent_skills.order` 0/1) exported to `evals-tq/skills-tq-v0/`.

`run-tq.ts verify` rebuilds a **real stored trace** for PR #9 — a seeded DB fixture whose own
PR description literally says "Fixture PR for the Test Quality Reviewer control experiment:
the test covers the happy path only" — using the current agent, for **both** arms actually
run in this task (per the shared brief's hard rule 5, not just one):

```
skills loaded: branch-coverage-gate, test-smells
[skills]    rebuilt user md5: c31611d60531d2993cf9114708cdf136 expected: c31611d60531d2993cf9114708cdf136 PASS
[no-skills] rebuilt user md5: fe278743bc008f8e975a3214e940e86c expected: fe278743bc008f8e975a3214e940e86c PASS
PASS — both arms verified (PR #9, current Test Quality Reviewer agent)
```

Stored hashes are `md5(trace->'prompt_assembly'->>'user')` for `run_traces` rows
`2ea96545-6b76-4c0a-9900-913e4f0022d8` (with-skills) and `06bf144f-6e53-492e-8b35-92aa5a5ab2d8`
(no-skills), both `agent_id=f3451435-…`, both PR #9, both sharing the same assembled system
message md5 (`79c49bee39990035588d41bd5822aae5`) confirming they are the same agent version.
`task`/`diff` were extracted from the stored `user` string (no separate columns for them, same
situation Analyst T hit for PR #6); `pr_description` and `repo_map` came from the trace's own
fields. One real bug surfaced during this proof: `psql -At` appends exactly one trailing
newline per query, and that extra byte — present only in my on-disk copies of
`pr_description`/`repo_map`, never in the DB value itself — showed up as a spurious blank line
before each `</untrusted>` closer, breaking the first md5 attempt. Fixed by stripping exactly
one trailing `\n` from those two extracted files (verified by diffing the rebuilt `user`
against the stored one byte-for-byte before trusting any hash). All non-`verify` runs use no
repo map / no callers, per the shared brief.

The regression case's diff/task/description are PR #6's real content, extracted the same way
from `prompt_T_no_skills.json` (already produced and byte-checked by the prior round's
`reports/T-pr6-test-quality.md`) — diff-only content is agent-version-independent, so no fresh
DB round-trip was needed for it.

The four catch/clean cases' diffs are hand-built unified diffs against real files at the repo
tip (`server/src/vendor/shared` schema line numbers, `server/src/db/schema/runs.ts`,
`server/src/modules/pulls/routes.ts`'s real `sql<number | null>\`sum(...)\`` pattern,
`server/test/conventions.it.test.ts`'s real `makeApp()`/`MockLLMProvider` shape) — **not**
verified with `git apply --check` against the working tree, unlike Analyst E2's cases (time
budget; see "What I did not check"). Each `found_regex` was unit-tested against one synthetic
true-positive and one synthetic true-negative finding before spending any OpenRouter budget
(all four discriminated correctly), and every "found"/"miss" call reported above was
additionally spot-checked by reading the actual finding titles/rationale, not just the regex
match (see quotes below).

## Results table

n = 6 requested on Parasail, n = 4 on AtlasCloud, per the task brief (not the shared brief's
three-provider/n=6-everywhere default). "ok" excludes 150s wall-clock timeouts (`AbortError`,
not rate limits — both providers were otherwise fully available this session).

| Case (kind) | Arm | Provider | ok/attempts | found | blocks | FP | median prompt tok | cited lines intersect diff? |
|---|---|---|---|---|---|---|---|---|
| catch-provider-mock-gap | no-skills | parasail/fp8 | 6/6 | **0/6** | 0/6 | 0/6 | 1738 | n/a (nothing matched) |
| catch-provider-mock-gap | no-skills | atlas-cloud/fp4 | 3/4 | **0/3** | 0/3 | 0/3 | 1740 | n/a |
| catch-provider-mock-gap | skills-tq-v0 | parasail/fp8 | 6/6 | **0/6** | 0/6 | 0/6 | 2488 | n/a |
| catch-provider-mock-gap | skills-tq-v0 | atlas-cloud/fp4 | 4/4 | **0/4** | 0/4 | 0/4 | 2490 | n/a |
| catch-db-test-misnamed | no-skills | parasail/fp8 | 6/6 | 1/6 | 0/6 | 0/6 | 1608 | yes (new-file diff, cited file matches) |
| catch-db-test-misnamed | no-skills | atlas-cloud/fp4 | 4/4 | 1/4 | 0/4 | 0/4 | 1610 | yes |
| catch-db-test-misnamed | skills-tq-v0 | parasail/fp8 | 6/6 | 0/6 | 0/6 | 0/6 | 2358 | n/a |
| catch-db-test-misnamed | skills-tq-v0 | atlas-cloud/fp4 | 4/4 | 0/4 | 0/4 | 0/4 | 2360 | n/a |
| catch-drizzle-undefined | no-skills | parasail/fp8 | 6/6 | **6/6** | 3/6 | 0/6 | 1553 | yes, all matched hits |
| catch-drizzle-undefined | no-skills | atlas-cloud/fp4 | 4/4 | 2/4 | 2/4 | 0/4 | 1555 | yes |
| catch-drizzle-undefined | skills-tq-v0 | parasail/fp8 | 6/6 | **6/6** | 0/6 | 0/6 | 2303 | yes |
| catch-drizzle-undefined | skills-tq-v0 | atlas-cloud/fp4 | 4/4 | 3/4 | 0/4 | 0/4 | 2305 | yes |
| clean-retention-branch-covered (clean) | no-skills | parasail/fp8 | 5/6 | n/a | n/a | 0/5 | 1639 | n/a |
| clean-retention-branch-covered | no-skills | atlas-cloud/fp4 | 4/4 | n/a | n/a | 1/4 | 1641 | n/a |
| clean-retention-branch-covered | skills-tq-v0 | parasail/fp8 | 6/6 | n/a | n/a | 0/6 | 2389 | n/a |
| clean-retention-branch-covered | skills-tq-v0 | atlas-cloud/fp4 | 4/4 | n/a | n/a | 0/4 | 2391 | n/a |
| regression-pr6-share-links (regression) | no-skills | parasail/fp8 | 6/6 | 6/6 | 6/6 | 0/6 | 5898 | yes |
| regression-pr6-share-links | no-skills | atlas-cloud/fp4 | 4/4 | 3/4 | 3/4 | 0/4 | 5900 | yes |
| regression-pr6-share-links | skills-tq-v0 | parasail/fp8 | 6/6 | 6/6 | 6/6 | 0/6 | 6648 | yes |
| regression-pr6-share-links | skills-tq-v0 | atlas-cloud/fp4 | 4/4 | 3/4 | 2/4 | 0/4 | 6650 | yes |

"Cited lines intersect diff" is my own re-implementation of the hunk-range fallback
(`reviewer-core/src/grounding.ts`'s `[newStart, newStart+newLines-1]`), not a call into the
real `groundFindings` — see "What I did not check." All new-file diffs make this check nearly
trivial (a new file starts at line 1), so it is a weaker signal here than in Analyst E's
cross-file cases; I did not lean on it for any conclusion above.

## Representative quoted findings

- **catch-provider-mock-gap, no-skills/parasail, every rep (0/6):** never names the
  registry/provider-id mechanism. Closest attempts: *"Test does not verify the described
  model-resolution fallback"* and *"Test does not verify the registry default model was
  used"* (CRITICAL in two of six reps) — real suspicion that something about model
  verification is thin, but never "the mock is pinned to one provider id while
  `resolveFeatureModel` can resolve to any of three." Same pattern, same misses, under
  `skills-tq-v0` (e.g. *"Test does not verify the extraction used the registry default
  model"*, SUGGESTION).
- **catch-db-test-misnamed, no-skills/parasail, the one hit (1/6):** *"File name does not
  follow integration test convention"* (SUGGESTION) — genuinely on-target, but co-occurring
  in other reps with an unrelated, incidental defect in my own fixture: *"Test silently passes
  without running assertion when Docker is unavailable"* (CRITICAL) and *"Test silently passes
  when Docker is unavailable"* (WARNING) — my `if (!hasDocker) return` / `if (!pg) return`
  guard, not the intended misnaming defect.
- **catch-drizzle-undefined, no-skills/parasail (6/6):** *"Test asserts `not.toBeNull()` on a
  column no code ever populates — a Drizzle row with an unset column reads as `undefined`,
  which passes `not.toBeNull()` before the retry-count feature exists."* — the model applies
  this reasoning unprompted; `skills-tq-v0` reproduces the same finding at the same rate but
  recategorizes it from CRITICAL/WARNING (no-skills, 3/6 blocks) to WARNING/SUGGESTION only
  (skills, 0/6 blocks) — consistent with the skill's own stated severity band ("critical only
  when guarding security, tenancy or money"), i.e. this looks like a correct recalibration,
  not a weakening.
- **clean-retention-branch-covered, no-skills/atlas-cloud, the one FP (1/4):** *"New tests for
  keepBlocking guard depend on implicit defaults and may become ineffective"* (WARNING) — a
  fair, if pedantic, fragility nitpick, not a false claim of a real defect; it did not
  reproduce under `skills-tq-v0` at n=4.
- **regression-pr6-share-links, no-skills/parasail (6/6, all blocks):** *"The diff introduces
  a new digest sharing module with zero tests… SQL injection… hardcoded secrets… SSRF… The
  tests as written would not catch any of these defects."* — matches the quote already
  recorded in `reports/T-pr6-test-quality.md` for the same PR under the old provider set;
  reproduces here on Parasail/AtlasCloud unchanged.

## Verified vs. inferred

**Verified:** the construction-proof md5 match against the real `assemblePrompt`, for both
arms, against a real stored current-agent trace (not a reconstruction of an old, unreachable
prompt version, as PR #6's proof in the prior round had to be); every regex's true-positive/
true-negative discrimination on synthetic text before spending budget; every "found"/"miss"
number in the Answer section by reading the actual finding titles quoted above, not the regex
match alone; total spend across every call this task, including the two-row smoke tests and
the one-off `catch-db-test-misnamed` re-check after fixing its production-logic confound:
**$0.1135** of the $0.40 cap; every call pinned (`provider.order`, `allow_fallbacks:false`),
temperature 0, ≤3 concurrent, 150s hard timeout (both errors above are timeouts, not rate
limits — neither Parasail nor AtlasCloud was rate-limited this session, unlike the
DeepInfra/OpenInference experience recorded in earlier rounds).

**Inferred / not checked:**
- The four hand-built diffs (everything except the PR #6 regression case) were never run
  through `git apply --check` against the real worktree, unlike Analyst E2's cases — a
  plausibility check on paths/line numbers only, not a construction guarantee. Given the
  read-only/no-repo-edits rule this would only ever have been a check, never an apply.
- `catch-db-test-misnamed`'s fixture has a real, unintended second defect (the
  Docker-availability guard silently skipping assertions) that draws its own CRITICAL/WARNING
  findings and confounds its found-rate for the misnaming fact specifically. I did not rebuild
  and re-run a fixed version — flagging this as a limitation rather than tuning the case, per
  the brief's "a negative result is a result."
- Grounding is my own hunk-range re-implementation, not the real `groundFindings`; every case
  here is either a new file (grounding nearly trivial) or PR #6's already-characterized real
  diff, so this check carried little weight in my conclusions.
- n=4 on AtlasCloud is below the shared brief's own n=6 pre-registration threshold — I did not
  apply the ≥5/6-catches/≤1/6-misses rule literally there; AtlasCloud numbers in the Answer are
  read as directional, corroborating Parasail, not as an independent pre-registered verdict.
- I did not test a candidate skill body encoding the provider-mock-gap rule — this report's
  job was to locate and measure the fact and the current skills' gap, not to author a fix.
- I did not investigate why AtlasCloud's `catch-provider-mock-gap`/no-skills row 4 timed out,
  or whether a retry would have changed the 0/3 read (direction was already unambiguous
  against 0/6 on Parasail, so I did not spend budget chasing the fourth sample).
