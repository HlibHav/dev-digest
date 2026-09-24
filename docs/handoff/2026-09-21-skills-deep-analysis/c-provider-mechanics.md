# C — Provider mechanics behind the all-five-prompt failure

Empirical probe, 37 real OpenRouter calls (`deepseek/deepseek-v4-flash`, temperature 0,
byte-identical `prompt_all5.json`, user md5 `efe2022466b3f37b599e4cb3147db454` — matches
BRIEF.md). Script: `c_run.py` (copied and adapted from `h5.py`). Raw results:
`c_results.jsonl` (37 lines, 0 transport errors, total spend **$0.02351** of the $0.25 cap).
C3 (reasoning) is **not measured** — see §5.

## 0. Bottom line

- **T1 (structured-output emulation) is well supported.** Stripping OpenInference's
  `json_schema` down to `json_object` drops `prompt_tokens` from 7186 to 5881 (a 1305-token
  gap, matching the brief's inferred schema-paste size) **and** recovers the catch rate to
  6/7 — "restored" by the brief's own threshold (≥5/6).
- **T2 (verdict-before-findings ordering), tested in isolation, is refuted.** Reordering the
  schema so `findings` comes first, while keeping the full strict schema (and its
  ~7186-token prompt), verifiably changes the emitted key order — but the catch rate stays
  at 0/6. The model does not even attempt a status-code finding in 4 of 6 calls; in the
  other 2 it invents a *false* reason not to ("the diff does not show the old value" — false,
  the diff shows `201`/`200` plainly, and five other arms on the same diff read it fine).
- **The sharpest isolation of the mechanism** is C0 vs. C4-deepinfra: both spend **0
  reasoning tokens** (so T2's "no reasoning → premature verdict" precondition holds
  identically for both), yet DeepInfra catches 6/6 and OpenInference catches 0/6. The one
  variable that differs between them is `prompt_tokens` (5854 vs. 7186) — i.e. whether the
  schema got pasted into the prompt. This argues T1, not T2, is the operative variable, at
  least for OpenInference's json_schema emulation specifically.
- **New, unplanned finding, more specific than either pre-registered theory:** the schema's
  own *content* — not just its size — appears to bias the model. Its enum vocabulary
  (`kind: secret_leak | lethal_trifecta | phantom | hook`, `trifecta_components:
  private_data_access | untrusted_input | exfil_path`) shows up verbatim as hallucinated
  "prompt injection" / "secrets leak" findings in C2 (all on OpenInference) and even once on
  Alibaba (§4), always with `start_line == end_line` (self-citing a single line, often a
  guess). Removing the schema (C1) removes this distraction entirely — none of C1's findings
  invoke that vocabulary.
- **Generality: the failure looks OpenInference-specific**, not a property of the all-five
  prompt on this model. DeepInfra, Alibaba and Parasail each caught the defect on
  essentially every call (see §4); DigitalOcean caught 2/3, with the one miss being an
  unrelated parsing/hallucination failure, not a rationalized dismissal.

## 1. C0 — drift control (n=3, unchanged all-five prompt, OpenInference)

| call | verdict | crit | prompt_tokens |
|---|---|---|---|
| C0#1 | approve | 0 | 7186 |
| C0#2 | comment | 0 | 7186 |
| C0#3 | comment | 0 | 7186 |

**0/3 caught.** Still fails — matches the brief's persisted 0/6, so every comparison below is
valid.

What's notable: all three responses **do mention** the 200-vs-201 change in `summary`, then
talk themselves out of it:
- C0#1: "...a 200-vs-201 status on the create handler, and test churn) are internal or test..."
- C0#2: "...no changed status code on an existing route (the create handler's 200 is the
  pre-existing behavior, and the diff does not alter it)..." — this is false; the diff does
  show `201 → 200`. C1's identical diff is read correctly by 6 of 7 other calls.
- C0#3: "...the create handler's 200 response — are either internal or already the documented
  behavior..."

This "sees it, then rationalizes it away" pattern recurs later, including once on a
reasoning-spending provider (Alibaba, §4).

## 2. C1 — T1 test: `response_format: {"type": "json_object"}` (OpenInference)

n=7 (a preflight call with identical parameters ran before the orchestrator's mid-task
correction; it is methodologically identical to the 6 stage-run calls, so it is folded in).
No rejection: OpenInference accepted `json_object` cleanly on every call.

| call | verdict | severity of status-code finding | prompt_tokens | completion_tokens |
|---|---|---|---|---|
| preflight | request_changes | **critical** | 5881 | 792 |
| C1#1 | request_changes | **critical** | 5881 | 786 |
| C1#2 | request_changes | **critical** | 5881 | 933 |
| C1#3 | request_changes | **critical** | 5881 | 965 |
| C1#4 | request_changes | **critical** | 5881 | 823 |
| C1#5 | request_changes | **critical** ×2 (duplicated) | 5881 | 582 |
| C1#6 | comment | warning (not critical) | 5881 | 1263 |

**6/7 caught** — clears the "restored" bar (≥5/6). Median prompt_tokens 5881, reasoning_tokens
0 throughout (`c_results.jsonl`, arm `C1#*` and `C1-preflight-json_object`).

- `prompt_tokens` dropped by exactly **1305** vs. C0's 7186 (5881 vs 7186) — close to the
  brief's inferred ~1332-token schema size (`review_schema.json` is 3942 bytes). This is the
  cleanest quantitative support for "OpenInference pastes the schema into the prompt to
  emulate `json_schema`."
- Sample finding text (C1#1, quoted in full in `c_results.jsonl`): *"The create agent handler
  now returns HTTP 200 instead of 201. This is a changed status code on an existing route.
  Any deployed caller that checks for a 201 ... will now see a 200 and may behave
  differently ... Since the PR description explicitly notes this is a breaking change to a
  deployed contract, this is critical."* — correctly grounded, correctly reasoned, correctly
  severed.
- Caveat: without a strict schema, the model invents its own field names (`path`,
  `old`/`new` or `old_shape`/`new_shape`, no separate `file`/`start_line`/`end_line`). My
  `status_code_findings` extractor (which looks for the strict schema's field names) records
  `file`/`start_line`/`end_line` as `None` for every C1 call even though the finding is
  present and correctly grounded in the free-text `path` field. **This means C1, as tested,
  is not a drop-in fix** — it would need a grounding/parsing layer built for its freer shape,
  or a system-prompt instruction describing the exact JSON shape (which the brief asked me to
  check first, and which is currently absent — see §6).
- C1#6 (the one miss) downgrades the identical fact ("Create agent handler now replies 200
  instead of 201") to `"warning"` rather than `"critical"` — temperature-0 non-determinism,
  consistent with the brief's note that temp 0 isn't deterministic even pinned.

## 3. C2 — T2 test: schema reordered (`findings` first), OpenInference (n=6)

Reorder verified to take effect: baseline `review_schema.json` has
`properties`/`required` = `['verdict','summary','score','findings']`; C2's schema was
rebuilt with `properties`/`required` = `['findings','summary','verdict','score']`
(`c_run.py:schema_findings_first`), with every field definition byte-identical to the
original (verified: only the two top-level dict/array orderings changed, nothing under
`properties.<key>` was touched). Every one of the 6 responses actually emitted the new key
order (`top_level_keys` in `c_results.jsonl`: `['findings', 'summary', 'verdict', 'score']`
in all 6) — so the manipulation worked, and the model *did* have to write `findings` before
committing to `verdict`.

| call | verdict | crit | what the CRITICAL finding is about | prompt_tokens |
|---|---|---|---|---|
| C2#1 | request_changes | 1 | prompt injection (untrusted `system_prompt`) | 7186 |
| C2#2 | request_changes | 1 | prompt injection (untrusted `tag`) | 7186 |
| C2#3 | request_changes | 3 | prompt injection (untrusted `tag`) ×3 | 7186 |
| C2#4 | request_changes | 1 | prompt injection (untrusted `system_prompt` in test fixture) | 7186 |
| C2#5 | approve | 0 | — | 7186 |
| C2#6 | request_changes | 1 | prompt injection (untrusted PR description/diff) | 7186 |

**0/6 caught** on the actual defect. This refutes T2 as a sufficient explanation on its own:
reordering findings-first did not restore catching, even though the reorder is confirmed to
have taken mechanical effect on the model's output. `reasoning_tokens` stayed at 0 for all 6
(unchanged from C0/baseline) — reordering the schema did not induce any reasoning either.

What actually happened instead, read from the raw `content` in `c_results.jsonl`:
- All 5 non-approve calls report a CRITICAL finding about **prompt injection**, not the
  status code, and every one of those findings cites `start_line == end_line == 1`
  (`server/src/modules/agents/routes.ts:1-1` or similar) — a single, ungrounded line, not the
  actual line of the quoted code. This is exactly the citation pattern the orchestrator
  flagged as liable to be dropped by the app's grounding gate.
- Two calls (C2#1, C2#4) explicitly discuss the status code in `summary` and give a reason
  for not flagging it that is demonstrably false against the same diff: C2#1 says *"the diff
  does not show the old value, so I cannot confirm it"*; C2#4 says *"the 200 response matches
  the module's existing behavior"*. Both claims are false — the diff shows `reply.status(201)`
  → `reply.status(200)` verbatim, and C1/C4 read the same diff correctly in the same run.
- The injected vocabulary tracks the *schema's own enum values* almost verbatim: `"kind":
  "finding"` / `"secret_leak"`, `"trifecta_components": ["untrusted_input", ...]`, `"evidence":
  [{"component": "untrusted_input", ...}]` — these are literally the enum members defined in
  `review_schema.json`'s `findings.items.properties.kind` / `trifecta_components` /
  `evidence`. The schema is present in the prompt (as the ~1332-token paste identified in
  §2), and its content appears to be pulling the model toward hunting for a "lethal trifecta"
  / prompt-injection pattern instead of doing the contract-breaking-change review the actual
  skills ask for. **This is inferred, not proven** — I did not run a control that keeps the
  schema's size but removes its security vocabulary, which would be the clean test.

## 4. C4 — generality across 4 other providers (unchanged all-five prompt, n=6 except DigitalOcean n=3)

| provider | n | caught | verdicts | median prompt_tokens | median completion_tokens | median reasoning_tokens |
|---|---|---|---|---|---|---|
| DeepInfra | 6 | **6/6** | all `request_changes` | 5854 | 450 | 0 |
| Alibaba | 6 | 5/6 | 1×`comment`, 5×`request_changes` | 5856 | 3020 | 2359 |
| Parasail | 6 | **6/6** | all `request_changes` | 5854 | 2036 | 1649 |
| DigitalOcean | 3 | 2/3 | 1×`approve`, 2×`request_changes` | 5854 | 378 | 0 |

- **DeepInfra** — every call cites the correct grounded lines (e.g.
  `CRITICAL@server/src/modules/agents/routes.ts:107-107`, never `start_line=1`), spends 0
  reasoning tokens, and still catches every time. This is the cleanest counter-example to a
  pure T2 story (0 reasoning tokens ≠ automatic miss) and, since its `prompt_tokens` (5854)
  matches C1's post-fix number almost exactly, it supports reading the OpenInference failure
  as specifically about *that provider's* schema-emulation behavior rather than something
  general to "provider spends no reasoning."
- **Alibaba** — 5/6 correct, grounded citations (never line 1). The one miss
  (`C4-alibaba/fp8#1`, verdict `comment`, 1835 reasoning tokens spent) reproduces the exact
  "sees it, rationalizes it away" pattern from C0: its `summary` says *"The status code
  change from 201 to 200 could be a minor breaking change if clients rely on the specific
  status code, but most clients only check for 2xx"* — and instead reports a SUGGESTION-level
  "workspace isolation" finding using the same schema vocabulary seen in C2
  (`"kind": "hook"`, `"trifecta_components": ["exfil_path", ...]`). So the
  schema-vocabulary-distraction pattern is not exclusive to OpenInference; it just doesn't
  reliably override a genuine catch when the provider also reasons.
- **Parasail** — 6/6, all grounded, reasoning_tokens 1094–2130 (substantial).
- **DigitalOcean** — is slow (14–254s/call; one call `C4-digitalocean#1` took 254s). 2 of 3
  catch cleanly with grounded citations. The miss (`C4-digitalocean#2`, verdict `approve`)
  is not a rationalized dismissal like C0/Alibaba's — the model claims *"Cannot parse the
  diff — it does not contain standard change hunks"* (false; every other call on the same
  prompt parsed it fine) and instead reports an unrelated CRITICAL "secrets leak" finding
  about a base64 string that does not appear anywhere in this fixture. This looks like a
  one-off garbled response, not a systematic pattern — n=1, do not generalize from it.

**Reading:** the all-five prompt is not broadly hostile to this model. Three of four other
providers catch it almost every time regardless of reasoning-token spend; only OpenInference
(0/9 across all C0+prior-sweep calls on the unmodified all-five prompt) fails systematically.

## 5. C3 — NOT MEASURED. `reasoning: {"enabled": true}` on OpenInference hangs.

Two independent attempts, both killed after exceeding their timeout by a wide margin:

1. A preflight call (`urlopen(timeout=240)`, with a retry loop that re-tried non-HTTP
   failures up to 3× with 5s backoff) ran for **~13 minutes** with no response and no error,
   then was killed by the orchestrator's mid-task correction.
2. After rewriting `c_run.py` to a hard `timeout=120` **and removing the blind retry on
   non-429 failures** (so a hang should surface as a single ~120s error row), a batch of 6
   `C3#*` calls was started and still produced **zero** completed or errored records after
   >160s of wall-clock wait — i.e., even the tightened single-attempt timeout did not
   resolve within its nominal window. It was killed; 0/6 rows exist for C3 in
   `c_results.jsonl`.

This is itself a data point, reported as required rather than papered over: OpenInference
does not fail cleanly (HTTP error) or degrade gracefully (ignore the param) when asked for
`reasoning: {"enabled": true}` on this prompt+schema — it appears to hang past even a 120s
per-attempt ceiling. I did not get to try the brief's fallback
(`reasoning: {"effort": "medium"}`) — it was deprioritized below C0/C1/C2/C4 by the
orchestrator and the time budget ran out first. **T2's specific "does turning on reasoning
recover the catch" question is open.** What §4 does show is that providers that *already*
reason (Alibaba, Parasail — not coerced via this parameter, just their normal behavior on
`deepseek-v4-flash` through OpenRouter) catch the defect at high but not perfect rates
(5/6, 6/6), which is suggestive but not a controlled A/B on OpenInference itself.

## 6. What I did not check, and what would change the conclusion

- **C1's practical viability**: I did not check whether the app's actual grounding/parsing
  code could consume C1's freer JSON shape (no `start_line`/`end_line` fields) at all, or
  whether a system-prompt instruction describing the exact output shape (currently absent —
  verified by grepping `prompt_all5.json`'s system prompt for "JSON"/"schema": only two
  incidental mentions of "zod schema" in the stack-context bullet, no structural
  description of `Review`) would need to be added before `json_object` becomes usable. If
  the app depends on those fields for its grounding gate, C1's fix as tested does not by
  itself unblock findings automatically.
- **The schema-vocabulary-distraction claim (§3) is inferred, not isolated.** I did not run
  a control that pastes a same-sized, same-shaped schema with *different* (non-security)
  enum vocabulary into the prompt. If that control still produced phantom findings at the
  same rate, the driver would be "any large pasted JSON schema," not specifically its
  security vocabulary; if it did not, that would confirm the vocabulary itself as the
  distractor. This would sharply refine T1 from "token count" to "token content."
  Also see the parallel finding in another analyst's report on prompt anatomy/schema
  content, `reports/A-prompt-anatomy.md`, if it addresses this from a different angle.
  (Not cross-checked against this report due to time.)
  - Given the same time cost, a cheap first check to close this: rerun C2 once with the
    baseline (unreordered) strict schema but with all `kind`/`trifecta_components`/
    `evidence` fields stripped, same size class as `review_schema.json` minus those three
    definitions (well short of a matched-vocabulary control, but directly tests whether
    removing that specific vocabulary alone restores catching without touching key order).
- **C3 is entirely unresolved** — see §5. A retry with an even shorter hard per-attempt
  timeout (e.g. `socket.setdefaulttimeout` plus a `ThreadPoolExecutor.submit(...).result(
  timeout=60)` wrapper, since Python's `urlopen(timeout=...)` bounds each individual
  socket read, not total wall time, and did not actually enforce the 120s ceiling I intended)
  would be needed before trusting any pass/fail reading on `reasoning: {"enabled": true}`.
  `{"effort": "medium"}` was never attempted.
- **DigitalOcean's n=3** is thin and one of its three calls was an evident parsing failure
  unrelated to the phenomenon under test; I would not generalize its 2/3 rate without more
  calls, though time/slowness (14–254s/call) made this the explicit lowest-priority item
  within C4 per the orchestrator's ordering.
- I did not run the optional `prompt_bc_alone.json` n=3 generality check across the 4 extra
  providers (`batch3-optional` in `c_run.py`, written but never invoked) — time ran out
  after C3's second hang; the orchestrator's priority order put it below even C3.
- I did not attempt a second run of C1 or C2 at higher n to move past the "inconclusive"
  zone in the strict pre-registered sense, since C1 (6/7) and C2 (0/6) both landed cleanly
  past the ≥5/6 / ≤1/6 thresholds and did not need it.

## Evidence index

- Raw calls: `c_results.jsonl` (37 rows; every row has `arm`, `pinned`, `served_by`,
  `prompt_tokens`, `completion_tokens`, `reasoning_tokens`, `cost`, full `content`,
  `top_level_keys`, `status_code_findings` with `file`/`start_line`/`end_line`).
- Script: `c_run.py` (`body()`, `schema_findings_first()` for C2, `parse_review()` /
  `is_status_code_finding()` for the caught-or-not extraction, `call()` for the HTTP
  layer and timeout/retry policy).
- Schema diff for C2: `review_schema.json` (baseline) vs. `SCHEMA_C2` built in
  `c_run.py:schema_findings_first()` — properties/required reordered, no field
  definition touched (diffed by hand against the source schema before running).
- Md5 check: `prompt_all5.json`'s `user` field hashes to `efe2022466b3f37b599e4cb3147db454`,
  matching BRIEF.md's stated value — confirms the byte-identical prompt claim before any
  arm was run.
