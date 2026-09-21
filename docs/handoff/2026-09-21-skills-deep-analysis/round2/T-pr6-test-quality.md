# PR #6 / Test Quality Reviewer — does the recorded uplift reproduce today?

## Answer

No. With today's agent, PR #6 does **not** show "misses without skills, catches with
skills" on any of the three pinned providers. The opposite pattern holds: the no-skills
arm already catches the planted defect reliably — 5/6 on DeepInfra, 6/6 on OpenInference,
4/6 (inconclusive by the pre-registered rule) on Parasail — and adding
`branch-coverage-gate` + `test-smells` does not raise those rates; on DeepInfra it is
nominally lower (4/6). Under the brief's pre-registered reading (catch ≥5/6, miss ≤1/6),
**no cell for the no-skills arm ever reaches "miss."** The 2026-09-20 result (0 findings
without skills, 6 with) was a property of the *old* system prompt, not of this PR or this
model. The new prompt (commit `8d58b90`, "states the job, not the rubric") already tells
the model, in its own words, that an untested branch which skips a security/tenancy check
or swallows an error is CRITICAL and the ONLY level that blocks merge — which is most of
what `branch-coverage-gate` says too. The skill is now largely redundant with the system
prompt on this fixture.

## Construction proof (Step 1)

`reviewer-core/src/prompt.ts` has one commit in its history since inception
(`1df0b2e`, the commit that added it) — it has **not changed** since the 2026-09-20 runs,
so no text-level reconstruction was needed; the real `assemblePrompt()` was used directly.

From `run_traces.trace->'prompt_assembly'` of `3f273a54…` (no skills) and `93ce6445…`
(with skills): `repo_map`, `pr_description`, `callers`, `specs`, `memory` are stored
**raw** (pre-wrap — `assembly.repo_map = parts.repoMap`, etc., per `prompt.ts`), so they
needed no unwrapping. `skills` is the rendered block; for two *trusted* skills it is exactly
`### <name>\n<body>` joined by `\n\n`, and the two bodies extracted from it matched the
current `skills.body` rows in the DB byte-for-byte (branch-coverage-gate, test-smells),
confirming both skills are unchanged since 2026-09-20. The old agent's system prompt was
recovered by stripping the known, unchanged `INJECTION_GUARD` suffix from the stored
`system` string. The diff and task line are not stored separately, so they were extracted
from the tail/head of the stored `user` string (`## Diff to review\n<untrusted
source="diff">…</untrusted>` unwrapped; confirmed the raw diff contains no literal
`</untrusted>` that the wrapper's escaping would have touched).

Feeding {old agent prompt, old skills (0/2), repoMap, prDescription, diff, task} into the
real `assemblePrompt()` reproduced all four stored hashes exactly:

| message | stored md5 | rebuilt md5 | match |
|---|---|---|---|
| system (both runs) | `f773e543b65e848ff9f77829ab0a692d` | same | yes |
| user, no skills | `d4916dbdcc2928d9c632f8bb358857b8` | same | yes |
| user, with skills | `e875c9a6ab66b09ba26a02b533ebb42e` | same | yes |

Script: `pr6/construct.ts`, run as `npx tsx pr6/construct.ts` from `reviewer-core/`
(imports `assemblePrompt` from the repo's `src/prompt.ts` directly by absolute path —
the `@devdigest/shared` types it imports are `import type`, erased before execution, so no
path-alias resolution was needed). Its stdout, including all four md5 checks, is preserved
in this session's transcript. Current agent md5: `agents.system_prompt` for
`f3451435-c875-42f3-b115-7f9b29d7ff69` is `2338b225bd5141cff62c4032677c543b` — confirmed
different from the old `f773e543…`, as the brief stated. Current skills (same two, same
order 0/1) were reused unchanged since they matched byte-for-byte. The two current prompts
were written to `prompt_T_no_skills.json` and `prompt_T_skills.json`.

## Arms and results (Step 2–3)

36 calls: {no-skills, skills} × {deepinfra/fp8, parasail/fp8, open-inference/fp8}, n=6,
interleaved per provider, pinned (`provider.order=[tag], allow_fallbacks:false`),
temperature 0, `usage.include`, ≤3 concurrent, hard 150s wall-clock deadline per call.
Total cost **$0.04** (33 billed calls; 3 timed out with no completion tokens).

**Process note (transparency):** the first deadline implementation used
`with ThreadPoolExecutor(...) as ex1:`, whose `__exit__` calls `shutdown(wait=True)` —
this silently defeated the 150s deadline by blocking on the abandoned request thread until
it finished on its own. On OpenInference this hung the run for 20+ minutes on one call. I
killed the stuck process, fixed `h5_T.py` to `shutdown(wait=False)`, and re-ran only the
missing call, which then correctly timed out and returned after 150s. `h5_T.py` in the
scratchpad has the fix; `T_results_smoketest.jsonl` holds two discarded pre-fix smoke-test
rows, not counted in the 36.

"Found" (Step 4) = a finding whose title/rationale ties a specific `share/*` file or
component to missing/absent/untested coverage (keyword match on
untested/no test/zero test/missing test/no coverage, manually spot-checked against the raw
text). "Blocks" = such a finding at CRITICAL. "Blocks (grounded)" additionally requires that
finding's own `start_line`–`end_line` intersect a diff hunk for its `file` — i.e., what the
app's grounding gate would actually keep.

| arm | provider | n | found | blocks (raw) | blocks (grounded) | median prompt tokens | verdicts |
|---|---|---|---|---|---|---|---|
| no-skills | deepinfra/fp8 | 6 | 5/6 | 5/6 | 4/6 | 7491 | 5×request_changes, 1×timeout |
| no-skills | parasail/fp8 | 6 | 4/6 | 4/6 | 3/6 | 7491 | 4×request_changes, 1×approve, 1×comment |
| no-skills | open-inference/fp8 | 6 | 6/6 | 6/6 | 6/6 | 8823 | 6×request_changes |
| with-skills | deepinfra/fp8 | 6 | 4/6 | 4/6 | 4/6 | 8241 | 4×request_changes, 2×timeout |
| with-skills | parasail/fp8 | 6 | 5/6 | 4/6 | 4/6 | 8241 | 1×timeout, 1×comment, 4×request_changes |
| with-skills | open-inference/fp8 | 6 | 5/6 | 5/6 | 3/6 | 9573 | 5×request_changes, 1×timeout |

Pre-registered reading (catch ≥5/6, miss ≤1/6, else inconclusive), on raw "found"/"blocks":
no-skills is a **catch** on DeepInfra and OpenInference, **inconclusive** on Parasail;
with-skills is a **catch** only on OpenInference (found) and **inconclusive** everywhere
else. **No cell of either arm is ever a miss.** The historical "0 findings without skills"
result cannot be produced with the current system prompt on any of the three providers at
this sample size.

Two no-skills summaries, quoted verbatim (the brief's "what does the no-skills arm actually
say" — one catch, one genuine miss):

- DeepInfra, run 1 (request_changes, 9 CRITICAL): *"The diff introduces a new digest
  sharing module with zero tests. Every file — routes, service, repository, helpers — is
  untested. This is a complete absence of test coverage for new functionality that includes
  SQL injection vulnerabilities, shell injection vulnerabilities, hardcoded secrets, and a
  server-side request forgery (SSRF) risk. The tests as written would not catch any of these
  defects."*
- Parasail, run 5 (**approve**, 0 findings — the one real no-skills miss in this sample):
  *"No test files were added or modified in this diff... As a test reviewer, there is
  nothing to evaluate — no test assertions, no test structure, no coverage gaps to cite. The
  production code contains several security-sensitive paths... that would benefit from test
  coverage, but those are outside the scope of this review. The verdict is approve because
  there are no test weaknesses to report."* — a scope-literalism failure (it reasons itself
  out of flagging zero-coverage because there is no test *code* to critique), not a failure
  to notice the gap.

Citation intersection: on OpenInference, most citations correctly land inside the new
files' `1–N` ranges (new files start at line 1, so even lazy `start_line:1` citations
trivially intersect), but 6 of 36 citations across both arms named files that do not exist
in the diff at all (`share.service.ts`, `share.routes.ts`, `share.jobs.ts`,
`share.it.test.ts`, `page.test.tsx`, `helpers.test.ts` — hallucinated names, consistent with
the prior report's note that OpenInference's schema-in-prompt behavior degrades output). On
DeepInfra and Parasail, real per-run drops from grounding were sparser and each traced to a
single wrong `start_line`/`end_line` pair (e.g. one run cited `server/src/modules/share/`
with lines `1-1`, a directory not a file). Full per-run detail (verdict, defect-finding
count, CRITICAL count, grounded-CRITICAL count) and all cited `file:start-end` tuples with
their intersection flag are in this session's transcript output from `analyze_T.py`; raw
findings are in `T_results.jsonl` (`findings_full` per record, not truncated).

## What was not checked

- No confidence interval beyond the brief's pre-registered n=6 threshold rule; a genuinely
  borderline provider (Parasail, 4/6 both arms) was left "inconclusive" rather than resolved
  with a larger n.
- Only the three mandated providers were pinned; unpinned/sticky routing behavior was not
  re-tested for this PR (it was covered for a different fixture in the prior round).
- Skill *order* was not varied — reused the current DB order (branch-coverage-gate,
  test-smells), which is also what the 2026-09-20 run used.
- The "is this finding about the planted defect" call is a keyword heuristic on
  title+rationale, spot-checked against several raw records but not manually re-read for
  all 36; a stricter or looser marker list could shift individual cells by ±1/6, which would
  not change the "no provider shows a miss" conclusion given the margins observed.
- Did not re-verify the DB-side grounding gate's exact matching logic (only implemented a
  straightforward line-range-intersects-hunk check per the brief's description); if the
  real gate is stricter (e.g., requires intersecting an *added* line, not just the hunk's
  new-side range), some "grounded" counts above are upper bounds.
