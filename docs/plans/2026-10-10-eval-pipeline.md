# Implementation Plan: Eval Pipeline (regression cases from findings, suite runs, code-only scoring, dashboards)
Status: ready
Spec: specs/2026-10-10-eval-pipeline.md (SPEC-2026-10-10-eval-pipeline, approved by Glib 2026-10-10; proof tags updated in 3f6b113)
Execution mode: multi-agent, chosen by the user. Lanes run as sonnet implementers (`.claude/agents/README.md` table).
Save as: docs/plans/2026-10-10-eval-pipeline.md
Architecture decisions: `/Users/Glebazzz/Claude/PROJECTS/NEO/decisions/2026-10-10-eval-suite-runs-table.md` (Accepted, with Follow-up and Follow-up 2, both accepted by Glib)
reviewer-core: unchanged. `reviewPullRequest` already returns grounded findings, `dropped` with reasons, and `costUsd` (`reviewer-core/src/review/run.ts:103-121`), which is everything AC-14, AC-15 and AC-24 need.

## Open questions & recommendations
- **feasibility (AC-40, e2e).** The flow must paste a diff into the Case Editor, but flows use only `open`, `wait` and `find` locators (`TESTING.md:96-97`). Default: L8 types with agent-browser's `find … fill` form inside the flow, which mutates nothing. Recommendation: if the main session finds that form unsupported, send AC-40 back to spec-creator for `red-first unit`. The diff preview is already unit-tested in step 18. Blocking: no.
- **ambiguity (AC-5).** What does "case diff = that file's whole patch only" compare against? Default: `input_diff` is the one-file unified diff `diffFromPrFiles` would build: `diff --git a/<p> b/<p>`, `--- a/<p>`, `+++ b/<p>`, then the patch. `pr_files.patch` has no headers and `parseUnifiedDiff` needs them (`server/src/modules/reviews/diff-loader.ts:38`). The test asserts `input_diff === buildCaseDiff(path, patchB)` and that it contains no line of patch A. The 64 KB check (AC-8) measures the stored `input_diff` with `Buffer.byteLength`. Blocking: no.
- **security default (AC-14, Untrusted inputs).** The case PR title and body reach the engine only as `prDescription` (untrusted-framed). The `task` line is the fixed constant `EVAL_TASK`, because `taskLine` interpolates the title as trusted framing (`server/src/modules/reviews/helpers.ts:84`). Blocking: no.
- **assumed default, confirm (AC-31, Untrusted inputs).** The snapshot stores `{id, name, version, body}` per skill, as the spec says. Execution never replays skills from the snapshot. The suite captures the live-resolved enabled skills, with `untrusted = isSkillUntrusted(source)`, at start and uses them for every case. So a community skill keeps its untrusted framing, and the snapshot shape stays as specified. "Linked skills" means linked and enabled, which is what reaches a live prompt (`run-executor.ts:565`). Blocking: no.
- **gap (AC-34).** The spec lists 422 for `POST /eval-cases/:id/run` but doesn't say when. Default: 422 when the case has an empty `input_diff`, reason "This case has no diff." Blocking: no.
- **gap (AC-47).** Two cases the spec leaves open. Default: the server orders the pair by `started_at` (older = `base`), whatever the query order. It returns 422 when the ids are equal, when a run is `failed` or `running`, or when the agents differ. Blocking: no.
- **assumed default, confirm (AC-30, ADR follow-up 2).** The boot reaper marks leftover `running` suites `failed` with "interrupted". Leftover single-case runs become `errored` with "interrupted", since the case-result status has no `failed` value. Otherwise a client polling `GET /eval-case-runs/:id` would poll forever. Blocking: no.
- **gap (AC-22).** What if every case in a suite errors? Default: the suite ends `partial` (AC-22 literally), with recall, precision and citation accuracy null and cost null. Blocking: no.
- **gap (AC-9, AC-10, AC-12).** Default: "Turn into eval case" renders on finding cards in the review-run findings panel (`ReviewRunAccordion` → `FindingsPanel` → `FindingCard`), which is where img1 shows it. The inline cards in the Files-changed tab don't get it, because their flattened findings carry no review agent. Blocking: no.
- **better way (AC-46, AC-50).** The vendored `LineChart` maps null to 0 and has no tooltip (`client/src/vendor/ui/charts/LineChart.tsx:35`). `MetricCard` renders `Math.abs(delta)` with no sign text (`MetricCard.tsx:65`). Neither can meet the ACs. Default: local `TrendChart` (recharts imported directly, `connectNulls={false}`, custom tooltip) and local `DeltaBadge` under `client/src/components/eval/`. `src/vendor/ui` stays untouched. Blocking: no.
- **design vs spec.** img3 and img4 show a "30 days" filter and "Promote v7", and img6 shows a Files tab. All three are spec non-goals and are not built. img5's "TRACES PASSED" card shows "passed / executed" (AC-45 wording). Blocking: no.

## Acceptance criteria (from the spec, verbatim)
- AC-1 The system shall store every eval case with an ordered list of expectations. Each expectation has a type (`must_find` or `must_not_flag`), a file path and an inclusive line range, plus optional severity, category and title for display. An empty list means "expect clean": the agent must produce no grounded finding. — proof: red-first unit
- AC-2 The system shall scope every eval case, suite run and case result to the workspace of the agent that owns it. A request for another workspace's case, run or agent returns 404. — proof: red-first integration
- AC-3 WHEN the user activates "Turn into eval case" on an accepted finding, the system shall create a case in the set of the agent that produced the finding's review. The case has one `must_find` expectation with the finding's file, start and end lines, severity, category and title. — proof: red-first integration
- AC-4 WHEN the user activates "Turn into eval case" on a dismissed finding, the system shall create a case with one `must_not_flag` expectation carrying the finding's file and line range. — proof: red-first integration
- AC-5 WHEN a case is created from a finding, the system shall save the full patch of the finding's file from that PR as the case diff. It saves the PR title and body as the case PR meta, and the PR's repository and number as the case source. — proof: red-first integration
- AC-6 WHEN a case is created from a finding, the system shall name the case "<file>:<start_line> — <finding title>". — proof: red-first unit
- AC-7 IF the finding's file has no stored patch for that PR, THEN the system shall refuse to create the case with the message "This PR's diff is not stored yet. Open the PR once and try again." and create nothing. — proof: red-first integration
- AC-8 IF the patch saved for a case, or a diff pasted into the Case Editor, exceeds 64 KB, THEN the system shall refuse to save the case and say that the diff is over the 64 KB limit. — proof: red-first integration
- AC-9 WHILE a finding has neither an accepted nor a dismissed decision, the system shall show "Turn into eval case" disabled with the hint "Accept or dismiss first". The create route refuses such a finding with 422. — proof: e2e
- AC-10 IF the finding's review has no agent, THEN the system shall show "Turn into eval case" disabled and the route shall refuse it with 422. — proof: red-first integration
- AC-11 WHEN "Turn into eval case" is activated for a finding that already has a case in the same agent's set, the system shall return the existing case and create no second one. — proof: red-first integration
- AC-12 WHEN a case is created from a finding, the client shall confirm it with a message naming the agent and a link to the case on that agent's Evals tab. IF creation fails, THEN it shall show the server's reason. — proof: red-first integration + red-first unit
- AC-13 WHEN a finding's decision changes after a case was created from it, the system shall keep the case's expectation unchanged. — proof: red-first integration
- AC-14 WHEN a case is executed, the system shall give the review engine only the case diff, the case PR title and body, and the agent's system prompt, model, provider, strategy and linked skills, with skill bodies as of the moment of the run. It shall give no project-context docs, memory, PR intent, callers digest or repo map. — proof: red-first integration
- AC-15 WHEN a case is executed, the system shall apply the review engine's existing grounding gate against the case diff, and keep both the grounded findings and the dropped findings in the case result. — proof: red-first integration
- AC-16 The system shall count a grounded finding as matching an expectation when the file paths are equal and the finding's line range intersects the expectation's inclusive range. Severity, category and title are not compared. — proof: red-first unit
- AC-17 The system shall compute recall as the number of matched `must_find` expectations divided by the number of `must_find` expectations, pooled over every scored case in the suite run. With zero `must_find` expectations, recall is null. — proof: red-first unit
- AC-18 The system shall treat as noise every grounded finding that matches a `must_not_flag` expectation of its case, and every grounded finding in an "expect clean" case. A finding that matches both a `must_find` and a `must_not_flag` expectation of the same case counts as noise and not as a match. — proof: red-first unit
- AC-19 The system shall compute precision as matched findings ÷ (matched findings + noise findings), pooled over the suite run. Matched findings are the grounded findings that match a `must_find` expectation of their case. Every other grounded finding that is not noise is neutral and excluded, including a finding outside the `must_not_flag` range of a `must_not_flag` case. With zero matched and zero noise findings, precision is null. — proof: red-first unit
- AC-20 The system shall compute citation accuracy as the number of grounded findings divided by grounded plus dropped findings, pooled over the suite run. With zero findings in total, it is null. — proof: red-first unit
- AC-21 The system shall mark a case passed when every `must_find` expectation is matched and the case has no noise finding. Otherwise the case is failed. A `must_not_flag` or "expect clean" case with zero grounded findings passes. — proof: red-first unit
- AC-22 IF a case's model call errors or times out, THEN the system shall record that case as errored with its reason and exclude it from recall, precision, citation accuracy and pass count. The suite run ends as `partial` instead of `done`. — proof: red-first integration
- AC-23 The system shall show every null metric as "—", never as 0% or 100%, on the Evals tab, the dashboards, the compare view and chart tooltips. — proof: red-first unit
- AC-24 The system shall compute a suite run's cost as the sum of the known case costs, flagged partial when at least one executed case reported no cost. When no case reported a cost, the suite cost is null and shown as "—". — proof: red-first unit
- AC-25 WHEN the user starts a suite run for an agent, the system shall accept it with 202 and return the new suite run's id, status `running`, its per-agent run number and the number of cases. The cases execute in the background. — proof: red-first integration
- AC-26 IF the agent has no cases or more than 50 cases, THEN the system shall refuse the suite run with 422 and a reason naming the limit. The Evals tab shows that reason. — proof: red-first integration
- AC-27 IF a suite run for the same agent is already running, THEN the system shall refuse a new one with 409. — proof: red-first integration
- AC-28 The system shall limit the suite-run, run-all and single-case-run routes to 10 requests per minute each. — proof: red-first integration
- AC-29 WHILE a suite run is in progress, the system shall report cases done out of cases total on the suite-run read route, and the Evals tab and the per-agent dashboard shall poll it and show "Running k/N" until it ends. — proof: red-first integration + red-first unit
- AC-30 IF a suite run fails as a whole (an unexpected error, or a process restart while it ran), THEN the system shall mark it `failed` with a reason. It never stays `running`. A suite still `running` at server start is marked `failed` with the reason "interrupted". — proof: red-first integration
- AC-31 WHEN a suite run starts, the system shall store a snapshot of the agent's system prompt, model, provider, strategy and each linked skill's id, name, version and body. Later edits or skill changes do not alter that snapshot. — proof: red-first integration
- AC-32 The system shall number suite runs per agent from 1, in start order, and label each run "run #N · agent vM", where M is the agent's config version when the run started. — proof: red-first integration
- AC-33 WHEN the user activates "Run all agents" on the Eval Dashboard, the system shall start one suite run per agent in the workspace that has at least one case, applying AC-26 and AC-27 to each agent separately. It skips disabled agents. It returns the runs it started and the agents it skipped, each with a reason ("disabled", "no cases", "too many cases" or "already running"). — proof: red-first integration
- AC-34 WHEN the user runs a single case (the row ▷ on the Evals tab, "Run case" in the Case Editor, or "Run on save" when saving), the system shall accept the request with 202 and a case-run id, execute that case alone in the background, and store the result as the case's last result only, outside any suite run. The client polls the case-run until it ends. A case's last result is its most recent result from either a single-case run or a suite run. — proof: red-first integration
- AC-35 WHERE "Run on save" is switched on in the Case Editor, the system shall run the case right after a successful save and show the result in the editor's last-run panel. — proof: red-first unit
- AC-36 WHEN the Evals tab of an agent opens, the system shall list every case in that agent's set with: its name; an expectation chip, where must-not-flag expectations are labelled "must NOT flag" and an empty list is labelled "expect clean"; its last result: passed, failed, errored or never run; for a run case, a "matched x of y expected" line; a "passing p / n" count above the list. — proof: e2e
- AC-37 IF an agent has no cases, THEN the Evals tab shall show the empty-state text and the "New eval case" action, and "Run all evals" shall be disabled. — proof: e2e
- AC-38 WHEN the user saves a case in the Case Editor, the system shall require a name, a diff and an expected-output list that is valid JSON and matches the expectation shape of AC-1. The editor shows "valid JSON" or the first shape error inline and blocks save until it is valid. — proof: red-first unit
- AC-39 WHEN the user activates "Finding skeleton" in the Case Editor, the system shall append one `must_find` expectation template with empty file and line fields to the expected-output list. — proof: red-first unit
- AC-40 WHILE the user edits the diff in the Case Editor, the system shall show a rendered diff preview of it. — proof: e2e
- AC-41 IF an expectation's line range does not intersect any hunk of the case diff for that file, THEN the Case Editor shall warn "This expectation can never be matched" next to it, without blocking save. — proof: red-first unit
- AC-42 WHEN the user edits or deletes a case, the system shall update or remove it. Past suite runs keep their aggregate metrics and their list of scored cases (id, name, status), while the deleted case's detailed result is removed with it. — proof: red-first integration
- AC-43 WHEN a case was created from a finding, the system shall show "Created from PR #N" on the case, linking to that PR. — proof: red-first integration + red-first unit
- AC-44 WHILE a case diff, PR meta or stored finding contains a string shaped like a credential (for example `sk_live_`, `ghp_`, `AKIA`, or a `-----BEGIN … PRIVATE KEY-----` block), the system shall mask it in the case list, the editor preview and run detail, behind an explicit reveal control. The stored value stays as is. — proof: red-first unit
- AC-45 WHEN the Evals tab or the per-agent dashboard opens, the system shall list that agent's suite runs newest first. Each row shows ran-at, the "run #N · agent vM" label, status, recall, precision, citation accuracy, passed / executed cases, the errored count when not zero, and cost. — proof: red-first integration
- AC-46 The system shall draw the trend chart of an agent from its `done` and `partial` suite runs in start order. Each point is one run, a null metric is a gap, and the tooltip shows the run label and cost. — proof: browser (main session)
- AC-47 WHEN the user selects exactly two `done` or `partial` suite runs of the same agent and activates Compare, the system shall show: for each metric and the cost: the older run's value, the newer run's value and the signed delta; a line-level diff of the two snapshots' system prompts; the model, provider or linked-skill changes between the two snapshots. — proof: red-first integration
- AC-48 WHEN the two compared runs scored different case sets (from each run's own list of scored cases, so deleted cases still count), the compare view shall show the notice "case set changed: +X / −Y". The deltas are still computed over each run's full set. — proof: red-first integration
- AC-49 WHILE fewer or more than two runs are selected, or a selected run is `failed`, the system shall keep Compare disabled. — proof: red-first unit
- AC-50 The system shall show metric deltas with a sign and an arrow as well as colour. — proof: red-first unit
- AC-51 The system shall show an "Eval Dashboard" item in the sidebar's Skills Lab section, opening the Eval Dashboard page. — proof: e2e
- AC-52 WHEN the Eval Dashboard opens, the system shall list every agent in the workspace that has at least one case. Each row shows the agent name, model, latest suite-run label and date, passed / executed, a recall trend sparkline, and the latest recall, precision and citation accuracy. Below the list, the 20 most recent suite runs of all agents appear newest first. — proof: e2e
- AC-53 IF no agent in the workspace has a case, THEN the Eval Dashboard shall show an empty state that points to creating a case from a finding or on an agent's Evals tab. — proof: red-first unit
- AC-54 WHILE an agent has cases but no completed suite run, the system shall show its dashboard row and metric cards as "never run" with "—" values. — proof: red-first unit
- AC-55 WHEN the user opens an agent's row on the Eval Dashboard, or "View full dashboard" on its Evals tab, the system shall open the per-agent dashboard. It shows stat cards (latest value and delta against the previous completed run), the trend chart, the run history with selection and Compare, a "Run eval" action, and an agent switcher that changes the agent in place. — proof: e2e
- AC-56 WHEN an agent's latest completed suite run has any metric 0.02 or more below the same metric of its previous completed run (both non-null), the system shall show a regression banner. The banner names each dropped metric with its drop in points and the run label. — proof: red-first unit
- AC-57 WHEN an agent is deleted, the system shall delete its cases, suite runs and case results with it. — proof: red-first integration
- AC-58 WHEN an agent has 50 suite runs, the system shall answer the per-agent dashboard, workspace dashboard and history routes with p95 under 500 ms. — proof: red-first integration

## Traceability
| AC | step | test | proof |
|---|---|---|---|
| AC-1 | 1 | `server/test/eval-contract.test.ts` "AC-1" | red-first unit |
| AC-2 | 11 | `server/test/eval-cases.it.test.ts` "AC-2" | red-first integration |
| AC-3 | 8, 11 | `eval-cases.it.test.ts` "AC-3" | red-first integration |
| AC-4 | 8, 11 | `eval-cases.it.test.ts` "AC-4" | red-first integration |
| AC-5 | 3, 8, 11 | `eval-cases.it.test.ts` "AC-5" | red-first integration |
| AC-6 | 3 | `server/test/eval-helpers.test.ts` "AC-6" | red-first unit |
| AC-7 | 8, 11 | `eval-cases.it.test.ts` "AC-7" | red-first integration |
| AC-8 | 8, 11 | `eval-cases.it.test.ts` "AC-8" | red-first integration |
| AC-9 | 8, 11, 16, 22 | `e2e/specs/12-finding-eval-button.flow.json`; route half also in `eval-cases.it.test.ts` "AC-9 route" | e2e |
| AC-10 | 8, 11, 16 | `eval-cases.it.test.ts` "AC-10" | red-first integration |
| AC-11 | 6, 8, 11 | `eval-cases.it.test.ts` "AC-11" | red-first integration |
| AC-12 | 8, 11, 16 | `eval-cases.it.test.ts` "AC-12"; `TurnIntoEvalButton.test.tsx` "AC-12" | red-first integration + red-first unit |
| AC-13 | 8, 11 | `eval-cases.it.test.ts` "AC-13" | red-first integration |
| AC-14 | 7, 11 | `server/test/eval-runs.it.test.ts` "AC-14" | red-first integration |
| AC-15 | 7, 11 | `eval-runs.it.test.ts` "AC-15" | red-first integration |
| AC-16 | 4 | `server/test/eval-scoring.test.ts` "AC-16" | red-first unit |
| AC-17 | 4 | `eval-scoring.test.ts` "AC-17" | red-first unit |
| AC-18 | 4 | `eval-scoring.test.ts` "AC-18" | red-first unit |
| AC-19 | 4 | `eval-scoring.test.ts` "AC-19" | red-first unit |
| AC-20 | 4 | `eval-scoring.test.ts` "AC-20" | red-first unit |
| AC-21 | 4 | `eval-scoring.test.ts` "AC-21" | red-first unit |
| AC-22 | 9, 11 | `eval-runs.it.test.ts` "AC-22" | red-first integration |
| AC-23 | 13, 14 | `client/src/components/eval/MetricStat/MetricStat.test.tsx` "AC-23"; `RunHistoryTable.test.tsx` "AC-23" | red-first unit |
| AC-24 | 4 | `eval-scoring.test.ts` "AC-24" | red-first unit |
| AC-25 | 9, 11 | `eval-runs.it.test.ts` "AC-25" | red-first integration |
| AC-26 | 9, 11, 19 | `eval-runs.it.test.ts` "AC-26" | red-first integration |
| AC-27 | 2, 6, 9, 11 | `eval-runs.it.test.ts` "AC-27" | red-first integration |
| AC-28 | 11 | `server/test/eval-rate-limit.it.test.ts` "AC-28" | red-first integration |
| AC-29 | 9, 11, 19, 21 | `eval-runs.it.test.ts` "AC-29"; `EvalsTab.test.tsx` "AC-29"; `AgentEvalDashboardView.test.tsx` "AC-29" | red-first integration + red-first unit |
| AC-30 | 9, 11 | `eval-runs.it.test.ts` "AC-30" | red-first integration |
| AC-31 | 9, 11 | `eval-runs.it.test.ts` "AC-31" | red-first integration |
| AC-32 | 6, 9, 11 | `eval-runs.it.test.ts` "AC-32" | red-first integration |
| AC-33 | 9, 11, 20 | `eval-runs.it.test.ts` "AC-33" | red-first integration |
| AC-34 | 9, 11, 18, 19 | `eval-runs.it.test.ts` "AC-34" | red-first integration |
| AC-35 | 18 | `CaseEditor.test.tsx` "AC-35" | red-first unit |
| AC-36 | 19, 22 | `e2e/specs/11-agent-evals-tab.flow.json` | e2e |
| AC-37 | 19, 22 | `11-agent-evals-tab.flow.json` | e2e |
| AC-38 | 17, 18 | `CaseEditor.test.tsx` "AC-38" | red-first unit |
| AC-39 | 17, 18 | `CaseEditor.test.tsx` "AC-39" | red-first unit |
| AC-40 | 18, 22 | `11-agent-evals-tab.flow.json` | e2e |
| AC-41 | 17, 18 | `CaseEditor.test.tsx` "AC-41" | red-first unit |
| AC-42 | 8, 9, 11 | `eval-cases.it.test.ts` "AC-42" | red-first integration |
| AC-43 | 8, 11, 19 | `eval-cases.it.test.ts` "AC-43"; `CaseRow.test.tsx` "AC-43" | red-first integration + red-first unit |
| AC-44 | 17, 19 | `CaseRow.test.tsx` "AC-44" | red-first unit |
| AC-45 | 10, 11, 14 | `server/test/eval-history.it.test.ts` "AC-45" | red-first integration |
| AC-46 | 14, 19, 21 | main-session browser check | browser (main session) |
| AC-47 | 5, 10, 11, 14 | `eval-history.it.test.ts` "AC-47" | red-first integration |
| AC-48 | 5, 10, 11, 14 | `eval-history.it.test.ts` "AC-48" | red-first integration |
| AC-49 | 13 | `client/src/components/eval/helpers.test.ts` "AC-49" | red-first unit |
| AC-50 | 13 | `client/src/components/eval/DeltaBadge/DeltaBadge.test.tsx` "AC-50" | red-first unit |
| AC-51 | 15, 22 | `e2e/specs/10-eval-dashboard.flow.json` | e2e |
| AC-52 | 10, 20, 22 | `10-eval-dashboard.flow.json` | e2e |
| AC-53 | 20 | `EvalDashboardView.test.tsx` "AC-53" | red-first unit |
| AC-54 | 13, 20 | `EvalDashboardView.test.tsx` "AC-54" | red-first unit |
| AC-55 | 21, 22 | `10-eval-dashboard.flow.json` | e2e |
| AC-56 | 4, 21 | `eval-scoring.test.ts` "AC-56"; `RegressionBanner.test.tsx` "AC-56" | red-first unit |
| AC-57 | 2, 11 | `eval-cases.it.test.ts` "AC-57" | red-first integration |
| AC-58 | 2, 6, 11 | `eval-history.it.test.ts` "AC-58" | red-first integration |

## Red-first
Under `/implement` this is `Red-first: implementer-owned`. Each lane writes its rows before its code and records the red run. Integration rows are read by the main session and run green by plan-verifier.
- AC-1 → `server/test/eval-contract.test.ts` — "AC-1 expectation shape: both types and an empty list parse; missing type, missing file or start_line > end_line fail with a field path" (L0)
- AC-6 → `server/test/eval-helpers.test.ts` — "AC-6 caseNameFromFinding gives 'src/config.ts:12 — Hardcoded Stripe secret key in commit'" (L1)
- AC-16, 17, 18, 19, 20, 21, 24, 56 → `server/test/eval-scoring.test.ts` — one `it` per AC named "AC-n …", using the spec's verify numbers (AC-17 recall 0.667, AC-19 precision 0.75, AC-20 0.9, AC-24 0.03 partial, AC-56 0.93→0.91 gives precision 2 pts and 0.01 gives none) (L1)
- AC-2, 3, 4, 5, 7, 8, 9 (route half), 10, 11, 12, 13, 42, 43, 57 → `server/test/eval-cases.it.test.ts` — "AC-n …" (L4)
- AC-14, 15, 22, 25, 26, 27, 29, 30, 31, 32, 33, 34 → `server/test/eval-runs.it.test.ts` — "AC-n …" (L4)
- AC-45, 47, 48, 58 → `server/test/eval-history.it.test.ts` — "AC-n …" (L4)
- AC-28 → `server/test/eval-rate-limit.it.test.ts` — "AC-28 the 11th POST /agents/:id/eval-runs within a minute answers 429" (L4)
- AC-23 → `client/src/components/eval/MetricStat/MetricStat.test.tsx` "AC-23 null value renders —" and `client/src/components/eval/RunHistoryTable/RunHistoryTable.test.tsx` "AC-23 null precision renders —" (L5)
- AC-49 → `client/src/components/eval/helpers.test.ts` — "AC-49 compareEnabled only for exactly two non-failed runs" (L5)
- AC-50 → `client/src/components/eval/DeltaBadge/DeltaBadge.test.tsx` — "AC-50 −0.02 renders '−' and a down-arrow text alternative" (L5)
- AC-12 (unit) → `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/_components/TurnIntoEvalButton/TurnIntoEvalButton.test.tsx` — "AC-12 confirmation names the agent and links to its Evals tab; a 422 shows the reason" (L6)
- AC-29 (unit) → `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.test.tsx` "AC-29 shows Running k/N then final metrics without reload" (L6) and `client/src/app/eval/[agentId]/_components/AgentEvalDashboardView/AgentEvalDashboardView.test.tsx` "AC-29 …" (L7)
- AC-35, 38, 39, 41 → `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/CaseEditor/CaseEditor.test.tsx` — "AC-n …" (L6)
- AC-43 (unit), AC-44 → `.../EvalsTab/_components/CaseRow/CaseRow.test.tsx` — "AC-43 Created from PR #N links to the PR page", "AC-44 sk_live_ masked until Reveal" (L6)
- AC-53, 54 → `client/src/app/eval/_components/EvalDashboardView/EvalDashboardView.test.tsx` — "AC-53 empty state", "AC-54 never run with —" (L7)
- AC-56 (render) → `client/src/app/eval/[agentId]/_components/AgentEvalDashboardView/_components/RegressionBanner/RegressionBanner.test.tsx` — "AC-56 names precision, 2 pts and the run label; role=alert" (L7)

## Review focus
- A model finding with `start_line > end_line` → `scoreCase` normalises it to `[min, max]`. Pinned by `eval-scoring.test.ts` "reversed finding range still matches", step 4.
- The 0.02 boundary under float drift (0.93→0.91 and 0.89→0.87 both alert, 0.90→0.89 doesn't) → `regressionAlert` compares integer points. Pinned by `eval-scoring.test.ts` "AC-56 boundary in integer points", step 4.
- Every case errors → suite `partial`, metrics null, cost null. Pinned by `eval-service.test.ts` "all cases errored", step 9.
- Agent deleted mid-suite → the background task stops writing, logs once and raises no unhandled rejection. Pinned by `eval-service.test.ts` "suite stops when its row is gone", step 9.
- A single-case run left `running` at boot → reaped to `errored` "interrupted". Pinned by `eval-runs.it.test.ts` "boot reaps case runs", step 11.

## Context read
- `server/INSIGHTS.md:14`: declare `response` schemas; fields outside the contract are stripped, so every wire field goes in `eval-pipeline.ts`.
- `server/INSIGHTS.md:30`: provider error text must not reach the client; fixed message, raw text to the log with `sk-`/`Bearer` redacted (`helpers.redactSecrets`).
- `server/INSIGHTS.md:42`: background tasks must catch, or the process dies; the `background` port wraps with `.catch`.
- `server/INSIGHTS.md:44`: assert values, not `.not.toBeNull()`, on new columns in `*.it.test.ts`.
- `server/INSIGHTS.md:72`: zod v3 `.superRefine`/`.refine` returns `ZodEffects`, which can't be extended; keep the plain object exported if a variant is needed.
- `server/INSIGHTS.md:76`: a mock LLM must be registered under every provider id the agent may use.
- `server/INSIGHTS.md:81-82`: `pnpm typecheck` doesn't see `server/test/**`; run the test file to prove imports exist.
- `server/INSIGHTS.md:84`: write aggregates as raw `sql<number|null>`, not drizzle `sum()`.
- `client/INSIGHTS.md:17`: a new agent-editor tab needs `AgentEditor/constants.ts` and the page's `VALID_TABS`, plus a `page.test.tsx` case.
- `client/INSIGHTS.md:31`: no `user-event` (use `fireEvent`); in srt run `tsc --noEmit --incremental false`.
- `client/INSIGHTS.md:33`: guard double-click mutations with a `useRef` flag; `isPending` lags.
- `client/INSIGHTS.md:35`: a new `useTranslations` namespace in a shared card makes every test that renders it need that namespace (MISSING_MESSAGE is stderr-only).
- `client/INSIGHTS.md:37`: the client imports only types from the `@devdigest/shared` barrel; runtime zod values via `@devdigest/shared/contracts/eval-pipeline`.
- `client/INSIGHTS.md:39`: `Toggle` is `role="switch"`.
- `server/src/app.ts:95-97`: rate limit is off under `NODE_ENV=test`; AC-28 needs its own app with `NODE_ENV=development` (`server/test/brief-rate-limit.it.test.ts:25-37`).
- `server/src/app.ts:116-163`: zod and `ValidationError` give 422; `AppError(code, msg, 409)` gives 409; there is no Conflict class (`server/src/platform/errors.ts`).
- `server/src/platform/jobs.ts:41-42`: 120 s timeout and 2 retries, so it's not used (ADR follow-up 2).
- `server/src/modules/onboarding/wiring.ts:23-45`: the `background` port and `opts` override precedent.
- `server/src/modules/reviews/run-executor.ts:305-334`: the live call; eval passes only `systemPrompt`, `model`, `diff`, `llm`, `strategy`, `skills`, `prDescription`, `task`.
- `server/src/modules/reviews/diff-loader.ts:33-44`: synthetic per-file diff headers.
- `server/src/modules/_shared/schemas.ts:11`: `IdParams` is a uuid, so a malformed id gives 422; cross-workspace tests use real ids (`server/test/blast.it.test.ts:305`).
- `client/src/components/app-shell/helpers.ts:35` and `client/messages/en/shell.json:24`: nav key `eval`, href `/eval`, label already present.
- `client/messages/en/agents.json:56`: `editor.tabs.evals` exists.
- `e2e/docs/hermetic-stack.md:31,53`: one seeded workspace, no LLM in flows.

## Affected surfaces
- shared → contracts → `server/src/vendor/shared/contracts/eval-pipeline.ts` (new), `server/src/vendor/shared/index.ts` (changed), plus the client mirror of both (new / changed)
- server → db → `server/src/db/schema/eval.ts`, `server/src/db/schema.ts` (changed), generated migration `server/src/db/migrations/0015_*.sql` + meta (new, generated)
- server → eval module, domain-pure → `types.ts`, `constants.ts`, `helpers.ts`, `scoring.ts`, `compare.ts` (new)
- server → eval module, repository → `repository.ts`, `repository/case.repo.ts`, `repository/suite-run.repo.ts`, `repository/case-run.repo.ts` (new)
- server → eval module, application → `case-runner.ts`, `service.ts` (new)
- server → eval module, edge → `wiring.ts`, `schemas.ts`, `routes.ts` (new); `server/src/modules/index.ts`, `server/src/app.ts` (changed)
- server → seed → `server/src/db/seed.ts` (changed)
- client → lib → `client/src/lib/hooks/eval.ts` (new); i18n → `client/messages/en/eval.json` (changed); nav → `client/src/vendor/ui/nav.ts` (changed)
- client → shared components → `client/src/components/eval/**` (new)
- client → agents route → `page.tsx`, `AgentEditor.tsx`, `AgentEditor/constants.ts` (changed); `AgentEditor/_components/EvalsTab/**` (new)
- client → PR route → `FindingCard`, `FindingsPanel`, `ReviewRunAccordion` (changed); `FindingCard/_components/TurnIntoEvalButton/**` (new)
- client → eval routes → `client/src/app/eval/**` (new)
- e2e → `e2e/specs/10-eval-dashboard.flow.json`, `11-agent-evals-tab.flow.json`, `12-finding-eval-button.flow.json` (new)

## Constraints
- Contracts are additive. The existing `EvalCase`, `EvalCaseInput`, `EvalRunRecord`, `EvalRun`, `EvalTrendPoint` and `EvalDashboard` are unchanged; new nullable-metric shapes live in new names. Edit the server copy first, mirror byte-identically to the client, and check `diff server/src/vendor/shared/contracts/eval-pipeline.ts client/src/vendor/shared/contracts/eval-pipeline.ts` (empty). Source: `.claude/rules/shared-contracts.md:9-14`; main-session coordination.
- Schema changes go through `server/src/db/schema/eval.ts`, then `pnpm db:generate`, then `pnpm db:migrate` (local DB on port 5632 per `CLAUDE.local.md`). Never hand-edit `server/src/db/migrations/**`. Source: root `CLAUDE.md` Do-not-touch; `.claude/rules/db-schema.md:9-12`.
- Routes parse, call the service and map; no query, no adapter call. Composition goes in `modules/eval/wiring.ts` as `buildEvalService(container, log, opts)`. Source: `.claude/rules/onion-boundaries.md:16-20`; onion-architecture steps 2 and 3.
- `service.ts` and `case-runner.ts` import no `fastify`, `drizzle-orm`, `src/db/**` or adapter. `parseUnifiedDiff` and `container.llm` come in as ports; agent, skill and finding data comes through container repos in wiring. Source: `.claude/rules/onion-boundaries.md:21-29`.
- `scoring.ts` and `compare.ts` are pure: they import only types from `@devdigest/shared` and `./types.js`. No I/O, no clock, no randomness, no tokenizer. They will be mutation-tested later. Source: main-session coordination; spec NFR Performance.
- Background execution goes through the `background(task)` port filled in wiring with `void task().catch(log)`. No `container.jobs`. A boot reaper marks leftover `running` runs. Source: ADR follow-up 2 (`../decisions/2026-10-10-eval-suite-runs-table.md:50-56`).
- reviewer-core is not changed. Source: spec header; main-session coordination.
- Case text never enters trusted framing: `task = EVAL_TASK` (constant), and title and body go in `prDescription`. Provider error text shown to users is the fixed `CASE_ERROR`; raw text goes to the log after `redactSecrets`. Source: spec Untrusted inputs and NFR Security; `server/INSIGHTS.md:30`.
- Every route declares `schema.response` with the shared contract. Polled GETs (`/eval-suite-runs/:id`, `/eval-case-runs/:id`) set `config: { rateLimit: false }`. The three run POSTs set `{ max: 10, timeWindow: '1 minute' }`. Source: `server/INSIGHTS.md:14`; `server/src/modules/brief/routes.ts:23,34`.
- Client placement: pieces used by both `/agents/[id]` and `/eval/**` live in `client/src/components/eval/` (second consumer exists in this change, same shape as `components/diff-viewer/`). Everything else is colocated in `_components/<Name>/`. No new `export *`. Data flows through `src/lib/hooks/eval.ts` → `api`. Source: frontend-ui-architecture steps 1, 2, 6, 7, 8.
- Every user string comes from the `eval` namespace (plus existing `agents` tab and `shell` nav labels). Model output and case text render as text only, never Markdown, links or HTML. Source: spec NFR i18n and Security.
- `src/vendor/ui` is not edited, except the one nav item the main session approved in `client/src/vendor/ui/nav.ts`. Source: `client/AGENTS.md:21-22`; main-session coordination.
- `seed.ts` stays idempotent. Source: `.claude/rules/db-schema.md:17-18`.
- e2e flows read seeded data only and trigger no LLM call. Source: `e2e/docs/hermetic-stack.md:53`; `e2e/run.ts:16`.

## Skills for the implementer
- client/** → frontend-ui-architecture, next-best-practices, react-best-practices, react-testing-library, security, zod
- server/** → onion-architecture, fastify-best-practices, drizzle-orm-patterns, security, zod
- server/src/db/** → the server row plus postgresql-table-design
- e2e/** → no skill; follow `e2e/CLAUDE.md`

## Lanes
| lane | steps | owned paths | after |
|---|---|---|---|
| 0 | 1, 2 | `server/src/vendor/shared/contracts/eval-pipeline.ts`, `server/src/vendor/shared/index.ts`, `client/src/vendor/shared/contracts/eval-pipeline.ts`, `client/src/vendor/shared/index.ts`, `server/src/db/schema/eval.ts`, `server/src/db/schema.ts`, `server/src/db/migrations/**` (generated only), `server/test/eval-contract.test.ts` | — |
| 1 | 3, 4, 5 | `server/src/modules/eval/types.ts`, `server/src/modules/eval/constants.ts`, `server/src/modules/eval/helpers.ts`, `server/src/modules/eval/scoring.ts`, `server/src/modules/eval/compare.ts`, `server/test/eval-helpers.test.ts`, `server/test/eval-scoring.test.ts`, `server/test/eval-compare.test.ts` | 0 |
| 2 | 6 | `server/src/modules/eval/repository.ts`, `server/src/modules/eval/repository/**` | 1 |
| 3 | 7, 8, 9, 10 | `server/src/modules/eval/case-runner.ts`, `server/src/modules/eval/service.ts`, `server/test/eval-case-runner.test.ts`, `server/test/eval-service.test.ts` | 1 |
| 4 | 11 | `server/src/modules/eval/wiring.ts`, `server/src/modules/eval/schemas.ts`, `server/src/modules/eval/routes.ts`, `server/src/modules/index.ts`, `server/src/app.ts`, `server/test/eval-cases.it.test.ts`, `server/test/eval-runs.it.test.ts`, `server/test/eval-history.it.test.ts`, `server/test/eval-rate-limit.it.test.ts` | 2, 3 |
| 5 | 12, 13, 14, 15 | `client/src/lib/hooks/eval.ts`, `client/src/lib/hooks/eval.test.tsx`, `client/messages/en/eval.json`, `client/src/components/eval/**`, `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/EvalDashboardNav.test.tsx` | 0 |
| 6 | 16, 17, 18, 19 | `client/src/app/agents/[id]/page.tsx`, `client/src/app/agents/[id]/page.test.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`, `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/**`, `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/**`, `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/**`, `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/**`, `client/src/app/repos/[repoId]/pulls/[number]/page.test.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/page.hardening.test.tsx` | 5 |
| 7 | 20, 21 | `client/src/app/eval/**` | 5 |
| 8 | 22 | `server/src/db/seed.ts`, `e2e/specs/10-eval-dashboard.flow.json`, `e2e/specs/11-agent-evals-tab.flow.json`, `e2e/specs/12-finding-eval-button.flow.json` | 4, 6, 7 |

DAG levels:
1. L0.
2. L1, L5.
3. L2, L3, L6, L7.
4. L4.
5. L8.

L2 and L3 share `server/src/modules/eval/` but no file. L3 codes against `EvalStore` in `types.ts`, never against `EvalRepository`. L0 may end with server code red until L1 lands; that's expected.

## Steps

1. [BE] shared — eval-pipeline contracts plus client mirror
   - files: `server/src/vendor/shared/contracts/eval-pipeline.ts` (new); `server/src/vendor/shared/index.ts` (changed: `export * from './contracts/eval-pipeline.js';`); `client/src/vendor/shared/contracts/eval-pipeline.ts` (new, identical); `client/src/vendor/shared/index.ts` (changed, same line); `server/test/eval-contract.test.ts` (new)
   - layer: contract · lane: 0
   - skills: zod, security
   - turns green: AC-1
   - test first: `server/test/eval-contract.test.ts` "AC-1": `EvalExpectedOutput.safeParse` accepts `[]`, one `must_find` and one `must_not_flag`. It rejects an item with no `type`, no `file`, or `start_line > end_line`, and the issue path names the field. Unknown keys are stripped.
   - interfaces: produces these zod schemas and types of the same name, all snake_case:
     - `EvalExpectationType` (`'must_find'|'must_not_flag'`)
     - `EvalExpectation` (`{type, file: string min 1, start_line: int ≥ 1, end_line: int ≥ 1, severity?, category?, title?}`, refined `end_line >= start_line` with path `['end_line']`)
     - `EvalExpectedOutput = z.array(EvalExpectation)`
     - `EvalCaseMeta {title: string, body: string}`
     - `EvalCaseSource {repo_id, pr_id, pr_number: int}`
     - `EvalCaseResultStatus` (`running|passed|failed|errored`)
     - `EvalCaseLastResult {status: passed|failed|errored, matched: int, expected: int, duration_ms: int|null, cost_usd: number|null, ran_at: string}`
     - `EvalCaseView = EvalCase.extend({ agent_id: string, input_meta: EvalCaseMeta, expected_output: EvalExpectedOutput, source_finding_id: string|null, source: EvalCaseSource|null, last_result: EvalCaseLastResult|null })`
     - `EvalCaseWrite {name: min 1, input_diff: min 1, input_meta: EvalCaseMeta, expected_output: EvalExpectedOutput, notes: string|null optional}`
     - `EvalCaseCreated {case: EvalCaseView, agent: {id, name}}`
     - `EvalDroppedFinding {finding: Finding, reason: string}`
     - `EvalCaseResult {id, case_id, case_name, suite_run_id: string|null, ran_at, status: EvalCaseResultStatus, error: string|null, grounded_findings: Finding[], dropped_findings: EvalDroppedFinding[], matched_must_find: int, must_find_total: int, noise_count: int, recall|null, precision|null, citation_accuracy|null, duration_ms|null, cost_usd|null}`
     - `EvalSuiteStatus` (`running|done|partial|failed`)
     - `EvalScoredCase {case_id, case_name, status: passed|failed|errored}`
     - `EvalSnapshotSkill {id, name, version: int, body}`
     - `EvalAgentSnapshot {system_prompt, model, provider, strategy, skills: EvalSnapshotSkill[]}`
     - `EvalSuiteRunSummary {id, agent_id, run_number, agent_version, status, error|null, started_at, finished_at|null, cases_total, cases_done, cases_passed, cases_errored, recall|null, precision|null, citation_accuracy|null, cost_usd|null, cost_partial: boolean, duration_ms|null, scored_cases: EvalScoredCase[]}`
     - `EvalSuiteRun = EvalSuiteRunSummary.extend({snapshot: EvalAgentSnapshot})`
     - `EvalSuiteRunDetail = EvalSuiteRun.extend({case_results: EvalCaseResult[]})`
     - `EvalSuiteRunAccepted {suite_run_id, status: 'running', run_number, cases_total}`
     - `EvalCaseRunAccepted {case_run_id, status: 'running'}`
     - `EvalSkipReason` (`'disabled'|'no cases'|'too many cases'|'already running'`)
     - `EvalRunAllResult {started: [{agent_id, suite_run_id}], skipped: [{agent_id, reason: EvalSkipReason}]}`
     - `EvalMetricName` (`recall|precision|citation_accuracy`)
     - `EvalMetricDeltas {recall|null, precision|null, citation_accuracy|null, cost_usd|null}`
     - `EvalPromptDiffLine {op: equal|add|remove, text}`
     - `EvalConfigChange {kind: model|provider|strategy|skill_added|skill_removed|skill_version, name: string|null, from: string|null, to: string|null}`
     - `EvalCompare {base: EvalSuiteRunSummary, head: EvalSuiteRunSummary, deltas: EvalMetricDeltas, prompt_diff: EvalPromptDiffLine[], config_changes: EvalConfigChange[], case_set: {added: int, removed: int}}`
     - `EvalRegressionAlert {run_number, agent_version, drops: [{metric: EvalMetricName, points: int}]}`
     - `EvalTrendRunPoint {suite_run_id, run_number, agent_version, started_at, recall|null, precision|null, citation_accuracy|null, cost_usd|null}`
     - `EvalAgentDashboard {agent: {id, name, model}, cases_total, latest: EvalSuiteRunSummary|null, previous: EvalSuiteRunSummary|null, deltas: EvalMetricDeltas, trend: EvalTrendRunPoint[], history: EvalSuiteRunSummary[], alert: EvalRegressionAlert|null}`
     - `EvalWorkspaceAgentRow {agent_id, name, model, cases_total, latest: EvalSuiteRunSummary|null, recall_trend: (number|null)[]}`
     - `EvalRecentRun = EvalSuiteRunSummary.extend({agent_name})`
     - `EvalWorkspaceDashboard {agents: EvalWorkspaceAgentRow[], recent_runs: EvalRecentRun[]}`
   - verify: `cd server && pnpm exec vitest run test/eval-contract.test.ts` → all AC-1 cases pass; `diff server/src/vendor/shared/contracts/eval-pipeline.ts client/src/vendor/shared/contracts/eval-pipeline.ts` → no output

2. [BE] server — schema for suite runs, case ownership and case-run fields
   - files: `server/src/db/schema/eval.ts` (changed); `server/src/db/schema.ts` (changed: add `evalSuiteRuns` to imports and the `schema` object); `server/src/db/migrations/0015_*.sql` + `meta/**` (generated by `pnpm db:generate`, never edited)
   - layer: db · lane: 0
   - skills: drizzle-orm-patterns, postgresql-table-design, onion-architecture
   - turns green: none (AC-11, 27, 32, 57 and 58 depend on these constraints; proven in step 11)
   - test first: none (schema; proven by the step 11 integration suite on a fresh testcontainer)
   - interfaces: produces these tables:
     - `evalSuiteRuns` (`eval_suite_runs`):
       - columns: `id` uuid pk; `workspaceId` FK workspaces cascade not null; `agentId` FK agents cascade not null; `runNumber` int not null; `agentVersion` int not null; `status` text enum `running|done|partial|failed` not null default `running`; `error` text; `startedAt` timestamptz default now not null; `finishedAt` timestamptz; `casesTotal` int not null; `casesDone`, `casesPassed`, `casesErrored` int not null default 0; `recall`, `precision`, `citationAccuracy`, `costUsd` doublePrecision; `costPartial` bool not null default false; `durationMs` int; `scoredCases` jsonb not null default `[]`; `snapshot` jsonb not null
       - indexes: unique `(agent_id, run_number)`; unique index on `(agent_id)` WHERE `status = 'running'`; index `(agent_id, started_at)`; index `(workspace_id, started_at)`
     - `evalCases` gains: `agentId` uuid FK agents `onDelete: 'cascade'` (nullable for skill-owned rows); `sourceFindingId` uuid FK findings `onDelete: 'set null'`; `source` jsonb; `createdAt` timestamptz default now not null; unique `(agent_id, source_finding_id)`
     - `evalRuns` gains: `suiteRunId` uuid FK evalSuiteRuns cascade (nullable); `status` text enum `running|passed|failed|errored` not null default `running`; `error` text; `matchedMustFind`, `mustFindTotal`, `noiseCount` int; index `(case_id, ran_at)`; index `(suite_run_id)`
     - `actualOutput` holds `{grounded: Finding[], dropped: {finding, reason}[]}`
   - verify: `cd server && pnpm db:generate && pnpm db:migrate` → a new `0015_*.sql` with `CREATE TABLE "eval_suite_runs"` and the unique index `WHERE "status" = 'running'`, and migrate exits 0 against `DATABASE_URL` on port 5632

3. [BE] server — eval module types, constants and pure helpers
   - files: `server/src/modules/eval/types.ts`, `constants.ts`, `helpers.ts` (new); `server/test/eval-helpers.test.ts` (new)
   - layer: domain (pure, in module) · lane: 1
   - skills: onion-architecture, zod, security
   - turns green: AC-6
   - test first: `server/test/eval-helpers.test.ts`:
     - "AC-6": `caseNameFromFinding({file:'src/config.ts', start_line:12, title:'Hardcoded Stripe secret key in commit'})` returns `'src/config.ts:12 — Hardcoded Stripe secret key in commit'`.
     - "buildCaseDiff": `buildCaseDiff('src/b.ts', '@@ -1 +1 @@\n-a\n+b')` starts with `diff --git a/src/b.ts b/src/b.ts\n--- a/src/b.ts\n+++ b/src/b.ts\n`.
     - "diffBytes": `diffBytes('é') === 2`.
     - "redactSecrets": masks `sk-abc123…` and `Bearer xyz`.
   - interfaces: produces
     - `types.ts`:
       - `EvalAgent {id, name, model, provider: Provider, strategy: 'auto'|'single-pass'|'map-reduce', systemPrompt, version: number, enabled: boolean}`
       - `EvalSkill {id, name, version: number, body, untrusted: boolean}`
       - `EvalCaseRecord {id, workspaceId, agentId, name, inputDiff, inputMeta: EvalCaseMeta, expectedOutput: EvalExpectation[], notes: string|null, sourceFindingId: string|null, source: EvalCaseSource|null}`
       - `CaseRunRecord {id, caseId, caseName, suiteRunId: string|null, ranAt: Date, status: EvalCaseResultStatus, error: string|null, grounded: Finding[], dropped: EvalDroppedFinding[], matchedMustFind, mustFindTotal, noiseCount, recall, precision, citationAccuracy, durationMs, costUsd}` (numbers nullable as in the contract)
       - `SuiteRunRecord {id, workspaceId, agentId, runNumber, agentVersion, status: EvalSuiteStatus, error, startedAt: Date, finishedAt: Date|null, casesTotal, casesDone, casesPassed, casesErrored, recall, precision, citationAccuracy, costUsd, costPartial, durationMs, scoredCases: EvalScoredCase[], snapshot: EvalAgentSnapshot|null}`
       - `NewEvalCase = Omit<EvalCaseRecord,'id'>`
       - `EvalCaseEdit = Pick<EvalCaseRecord,'name'|'inputDiff'|'inputMeta'|'expectedOutput'|'notes'>`
       - `NewSuiteRun {workspaceId, agentId, agentVersion, casesTotal, snapshot: EvalAgentSnapshot}`
       - `SuiteFinish {status: 'done'|'partial'|'failed', error: string|null, casesPassed, casesErrored, recall, precision, citationAccuracy, costUsd, costPartial, durationMs, scoredCases}`
       - `CaseRunFinish {status: 'passed'|'failed'|'errored', error, grounded, dropped, matchedMustFind, mustFindTotal, noiseCount, recall, precision, citationAccuracy, durationMs, costUsd}`
       - `interface EvalStore` with exactly these methods:
         - `listCases(workspaceId, agentId): Promise<EvalCaseRecord[]>`
         - `countCasesByAgent(workspaceId): Promise<Map<string, number>>`
         - `getCase(workspaceId, caseId): Promise<EvalCaseRecord|undefined>`
         - `insertCase(input: NewEvalCase): Promise<{record: EvalCaseRecord; created: boolean}>`
         - `updateCase(workspaceId, caseId, edit: EvalCaseEdit): Promise<EvalCaseRecord|undefined>`
         - `deleteCase(workspaceId, caseId): Promise<boolean>`
         - `lastResults(caseIds: string[]): Promise<Map<string, CaseRunRecord>>`
         - `insertSuite(input: NewSuiteRun): Promise<SuiteRunRecord|'already_running'>`
         - `hasRunningSuite(agentId): Promise<boolean>`
         - `getSuite(workspaceId, id): Promise<SuiteRunRecord|undefined>` (with snapshot)
         - `listSuites(workspaceId, agentId): Promise<SuiteRunRecord[]>` (newest first, `snapshot: null`)
         - `recentSuites(workspaceId, limit): Promise<(SuiteRunRecord & {agentName: string})[]>`
         - `updateSuiteProgress(id, casesDone): Promise<boolean>`
         - `finishSuite(id, f: SuiteFinish): Promise<boolean>`
         - `insertCaseRun(caseId, suiteRunId: string|null): Promise<CaseRunRecord|undefined>`
         - `finishCaseRun(id, f: CaseRunFinish): Promise<boolean>`
         - `getCaseRun(workspaceId, id): Promise<CaseRunRecord|undefined>`
         - `caseRunsForSuite(suiteRunId): Promise<CaseRunRecord[]>`
         - `reapInterrupted(reason: string): Promise<{suites: number; caseRuns: number}>`
     - `constants.ts`:
       - limits: `MAX_CASES_PER_SUITE = 50`, `MAX_DIFF_BYTES = 65_536`, `REGRESSION_POINTS = 2`, `RECENT_RUNS_LIMIT = 20`, `RECALL_TREND_POINTS = 10`, `RUN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' }`
       - `EVAL_TASK` (fixed review instruction, no case text)
       - messages: `MSG.noPatch = "This PR's diff is not stored yet. Open the PR once and try again."`, `MSG.diffTooLarge = 'The diff is over the 64 KB limit.'`, `MSG.undecided = 'Accept or dismiss the finding first.'`, `MSG.noAgent = "This finding's review has no agent."`, `MSG.noCases = 'This agent has no eval cases. A suite run needs 1 to 50 cases.'`, `MSG.tooManyCases(n) = \`This agent has ${n} eval cases; a suite run is limited to 50.\``, `MSG.alreadyRunning = 'A suite run for this agent is already running.'`, `MSG.caseError = 'The model call failed or timed out.'`, `MSG.suiteFailed = 'The suite run stopped on an unexpected error.'`, `MSG.interrupted = 'interrupted'`, `MSG.emptyDiff = 'This case has no diff.'`, `MSG.compareInvalid = 'Compare needs two completed runs of the same agent.'`
     - `helpers.ts`:
       - `caseNameFromFinding(f: {file: string; start_line: number; title: string}): string`
       - `buildCaseDiff(path: string, patch: string): string`
       - `diffBytes(text: string): number` (TextEncoder byte length)
       - `prDescription(meta: EvalCaseMeta): string | undefined` (`title\n\nbody` trimmed, undefined when empty)
       - `redactSecrets(text: string): string`
   - verify: `cd server && pnpm exec vitest run test/eval-helpers.test.ts` → all pass

4. [BE] server — pure scoring module
   - files: `server/src/modules/eval/scoring.ts` (new); `server/test/eval-scoring.test.ts` (new)
   - layer: domain (pure) · lane: 1
   - skills: onion-architecture
   - turns green: AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-24, AC-56 (computation)
   - test first: `server/test/eval-scoring.test.ts`:
     - one `it` per AC with the spec's verify data;
     - "reversed finding range still matches" (finding 15–12 vs expectation 12–12 → match);
     - "AC-56 boundary in integer points" (0.89→0.87 alerts, 0.90→0.89 doesn't, a null on either side doesn't);
     - "aggregateSuite of zero scores → all null, 0 passed".
   - interfaces: consumes `EvalExpectation`, `EvalMetricName` (step 1). Produces:
     - `type Range = {file: string; start_line: number; end_line: number}`
     - `findingMatches(f: Range, e: EvalExpectation): boolean`
     - `interface CaseScore {matchedMustFind: number; mustFindTotal: number; matchedFindings: number; noiseFindings: number; grounded: number; dropped: number; passed: boolean}`
     - `scoreCase(expectations: readonly EvalExpectation[], grounded: readonly Range[], droppedCount: number): CaseScore`
     - `interface SuiteMetrics {recall: number|null; precision: number|null; citation_accuracy: number|null; cases_passed: number}`
     - `aggregateSuite(scores: readonly CaseScore[]): SuiteMetrics` (errored cases are never passed in; also used per case with `[score]`)
     - `suiteCost(costs: readonly (number|null)[]): {cost_usd: number|null; cost_partial: boolean}`
     - `regressionDrops(previous: Pick<SuiteMetrics,'recall'|'precision'|'citation_accuracy'>, latest: same): {metric: EvalMetricName; points: number}[]` (points = `Math.round(prev*100) - Math.round(latest*100)`, kept when ≥ `REGRESSION_POINTS`)
   - verify: `cd server && pnpm exec vitest run test/eval-scoring.test.ts` → all pass; `grep -n "^import" server/src/modules/eval/scoring.ts` shows only `import type` lines

5. [BE] server — pure compare module
   - files: `server/src/modules/eval/compare.ts` (new); `server/test/eval-compare.test.ts` (new)
   - layer: domain (pure) · lane: 1
   - skills: onion-architecture
   - turns green: none directly (feeds AC-47 and AC-48 in step 11)
   - test first: `server/test/eval-compare.test.ts`:
     - "lineDiff one changed line": `['equal','remove','add','equal']` ops for prompts differing in line 2;
     - "lineDiff never truncates": 2,000-line input gives 2,000+ entries;
     - "configChanges lists a skill version bump": `{kind:'skill_version', name, from:'1', to:'2'}`, plus model/provider/strategy and skill added/removed;
     - "caseSetChange {a,b,c}→{b,c,d,e} = {added:2, removed:1}";
     - "metricDeltas null when either side null; cost delta signed".
   - interfaces: produces
     - `lineDiff(oldText: string, newText: string): EvalPromptDiffLine[]` (LCS over lines; no dependency)
     - `configChanges(base: EvalAgentSnapshot, head: EvalAgentSnapshot): EvalConfigChange[]`
     - `caseSetChange(base: EvalScoredCase[], head: EvalScoredCase[]): {added: number; removed: number}`
     - `metricDeltas(base: EvalSuiteRunSummary, head: EvalSuiteRunSummary): EvalMetricDeltas`
   - verify: `cd server && pnpm exec vitest run test/eval-compare.test.ts` → all pass

6. [BE] server — EvalRepository implementing EvalStore
   - files: `server/src/modules/eval/repository.ts` (new: `export class EvalRepository implements EvalStore { constructor(db: Db) }`, delegating to the entity repos); `server/src/modules/eval/repository/case.repo.ts`, `suite-run.repo.ts`, `case-run.repo.ts` (new)
   - layer: repository · lane: 2
   - skills: drizzle-orm-patterns, postgresql-table-design, onion-architecture, security
   - turns green: none alone (AC-11, 27, 32, 42, 45, 57, 58 via step 11)
   - test first: none here; the step 11 integration files exercise every method against Postgres. Self-check by typecheck.
   - interfaces: consumes `EvalStore` and the record types (step 3), tables (step 2). Produces `EvalRepository`.
     - Every read and update filters by `workspaceId` where the signature has one.
     - `insertCase` uses `onConflictDoNothing({target: [agentId, sourceFindingId]})` and, when no row is returned, selects the existing one (`created: false`).
     - `insertSuite` computes `run_number = coalesce(max(run_number),0)+1` for the agent in the same statement. It maps a unique violation (`23505`) on either index to `'already_running'`.
     - `listSuites` selects no `snapshot` column and orders `started_at desc, run_number desc`.
     - `lastResults` uses `DISTINCT ON (case_id)` over `status <> 'running'` ordered `ran_at desc`.
     - `insertCaseRun` returns `undefined` on FK violation `23503` (case deleted).
     - `finish*` and `updateSuiteProgress` return `false` when 0 rows are updated.
     - `reapInterrupted` sets running suites to `failed` + reason + `finished_at`, and running case runs to `errored` + reason.
     - Aggregates are raw `sql<number|null>`.
   - verify: `cd server && pnpm typecheck` → no error in `src/modules/eval/repository*` (judged on owned paths)

7. [BE] server — case-runner (fixed inputs → reviewer-core)
   - files: `server/src/modules/eval/case-runner.ts` (new); `server/test/eval-case-runner.test.ts` (new)
   - layer: application · lane: 3
   - skills: onion-architecture, security
   - turns green: none directly (AC-14 and AC-15 integration in step 11)
   - test first: `server/test/eval-case-runner.test.ts`, using `MockLLMProvider` and `parseUnifiedDiff` imported in the test only:
     - "passes only diff, PR meta, prompt, model, strategy and skills": the captured `completeStructured` messages contain the diff line and PR title, and contain none of `Project context`, `Intent`, `Callers`, `Repo skeleton`.
     - "keeps dropped findings": a finding outside the hunk lands in `dropped`.
     - "rethrows a model error".
   - interfaces: consumes `EvalAgent`, `EvalSkill`, `EVAL_TASK`, `prDescription`. Produces:
     - `interface CaseRunnerPorts {llm(provider: Provider): Promise<LLMProvider>; parseDiff(raw: string): UnifiedDiff; nowMs(): number}`
     - `interface CaseRunInput {inputDiff: string; meta: EvalCaseMeta; agent: EvalAgent; skills: readonly EvalSkill[]}`
     - `interface CaseRunOutput {grounded: Finding[]; dropped: EvalDroppedFinding[]; costUsd: number|null; durationMs: number}`
     - `runEvalCase(ports: CaseRunnerPorts, input: CaseRunInput): Promise<CaseRunOutput>`
     - It calls `reviewPullRequest({systemPrompt, model, diff, llm, strategy, skills (name, body, untrusted; omitted when empty), prDescription (omitted when undefined), task: EVAL_TASK})` and nothing else.
   - verify: `cd server && pnpm exec vitest run test/eval-case-runner.test.ts` → all pass

8. [BE] server — EvalService: cases (from finding, CRUD, list with last result)
   - files: `server/src/modules/eval/service.ts` (new); `server/test/eval-service.test.ts` (new, cases block)
   - layer: application · lane: 3
   - skills: onion-architecture, security, zod
   - turns green: none directly (AC-2–5, 7–13, 42, 43 integration in step 11)
   - test first: `server/test/eval-service.test.ts` with an in-memory `EvalStore` fake and port fakes:
     - "accepted → must_find with severity, category, title";
     - "dismissed → must_not_flag";
     - "undecided → 422 MSG.undecided";
     - "null agent → 422 MSG.noAgent";
     - "empty patch → 422 MSG.noPatch, nothing inserted";
     - "65 KB patch → 422 MSG.diffTooLarge";
     - "second call returns created:false and the same id";
     - "finding in another workspace → 404";
     - "create/update reject a 65 KB input_diff with 422".
   - interfaces: consumes `EvalStore`, step 3 helpers and constants, step 4 `scoreCase`/`aggregateSuite`, step 7 types. Produces:
     - `interface EvalPorts`:
       - `store: EvalStore`
       - `getAgent(workspaceId, agentId): Promise<EvalAgent|undefined>`
       - `listAgents(workspaceId): Promise<EvalAgent[]>`
       - `resolveSkills(workspaceId, agentId): Promise<EvalSkill[]>`
       - `findingContext(findingId): Promise<{finding: {id, file, start_line, end_line, severity, category, title, accepted: boolean, dismissed: boolean}; agentId: string|null; pull: {id, workspaceId, repoId, number, title, body: string|null}}|undefined>`
       - `prFilePatch(prId, path): Promise<string|null>`
       - `runCase(input: CaseRunInput): Promise<CaseRunOutput>`
       - `background(task: () => Promise<void>): void`
       - `now(): Date`
       - `log(fields: Record<string, unknown>, msg: string): void`
     - `class EvalService { constructor(ports: EvalPorts) }` with these methods:
       - `createFromFinding(workspaceId, findingId): Promise<{body: EvalCaseCreated; created: boolean}>`
       - `listCases(workspaceId, agentId): Promise<EvalCaseView[]>`
       - `createCase(workspaceId, agentId, input: EvalCaseWrite): Promise<EvalCaseView>`
       - `updateCase(workspaceId, caseId, input: EvalCaseWrite): Promise<EvalCaseView>`
       - `deleteCase(workspaceId, caseId): Promise<void>`
       - It throws `NotFoundError`, `ValidationError` (422) and `AppError('suite_running', MSG.alreadyRunning, 409)`.
   - verify: `cd server && pnpm exec vitest run test/eval-service.test.ts -t 'cases'` → all pass

9. [BE] server — EvalService: suite runs, run all, single-case runs, reap
   - files: `server/src/modules/eval/service.ts`, `server/test/eval-service.test.ts` (runs block)
   - layer: application · lane: 3
   - skills: onion-architecture, security
   - turns green: none directly (AC-22, 25–27, 29–34 integration in step 11)
   - test first: `server/test/eval-service.test.ts` "runs", with a `background` fake that collects tasks so the test can await them:
     - "start returns run_number and cases_total before any case runs";
     - "0 and 51 cases → 422 naming the limit";
     - "store returns already_running → 409";
     - "case 2 runCase throws → case errored with MSG.caseError, raw text logged redacted, metrics from cases 1 and 3, status partial";
     - "all cases errored";
     - "finishCaseRun throws after case 1 → suite failed with MSG.suiteFailed";
     - "suite stops when its row is gone (updateSuiteProgress false) and logs once";
     - "snapshot holds prompt, model, provider, strategy and skills at start";
     - "runAll: disabled / no cases / too many cases / already running skipped";
     - "startCaseRun: suiteRunId null, result written via finishCaseRun";
     - "reapInterrupted delegates with MSG.interrupted".
   - interfaces: produces these `EvalService` methods:
     - `startSuite(workspaceId, agentId): Promise<EvalSuiteRunAccepted>`: reads cases and skills at start; the background task runs cases sequentially (insertCaseRun → runCase → scoreCase → finishCaseRun → updateSuiteProgress), then `aggregateSuite` + `suiteCost` → `finishSuite` with status done or partial; the outer catch → `finishSuite` failed
     - `runAll(workspaceId): Promise<EvalRunAllResult>`
     - `startCaseRun(workspaceId, caseId): Promise<EvalCaseRunAccepted>`
     - `reapInterrupted(): Promise<{suites: number; caseRuns: number}>`
   - verify: `cd server && pnpm exec vitest run test/eval-service.test.ts -t 'runs'` → all pass

10. [BE] server — EvalService: reads, compare, dashboards
    - files: `server/src/modules/eval/service.ts`, `server/test/eval-service.test.ts` (reads block)
    - layer: application · lane: 3
    - skills: onion-architecture
    - turns green: none directly (AC-45, 47, 48, 52, 55, 56, 58 in step 11)
    - test first: `server/test/eval-service.test.ts` "reads":
      - "compare orders by started_at, 422 on failed/running/same id/different agents";
      - "agent dashboard: latest and previous are the last two done|partial, deltas, alert from regressionDrops, trend ascending of done|partial";
      - "workspace dashboard lists only agents with cases; recent_runs ≤ 20";
      - "getCaseRun of another workspace → 404".
    - interfaces: produces these `EvalService` methods:
      - `getSuite(workspaceId, id): Promise<EvalSuiteRunDetail>`
      - `getCaseRun(workspaceId, id): Promise<EvalCaseResult>`
      - `history(workspaceId, agentId): Promise<EvalSuiteRunSummary[]>`
      - `compare(workspaceId, baseId, headId): Promise<EvalCompare>`
      - `agentDashboard(workspaceId, agentId): Promise<EvalAgentDashboard>`
      - `workspaceDashboard(workspaceId): Promise<EvalWorkspaceDashboard>`
    - verify: `cd server && pnpm exec vitest run test/eval-service.test.ts` → all pass

11. [BE] server — wiring, routes, registration, boot reaper, integration suites
    - files:
      - new: `server/src/modules/eval/wiring.ts`, `schemas.ts`, `routes.ts`
      - changed: `server/src/modules/index.ts` (import `evalModule from './eval/routes.js'`, entry `eval: evalModule`); `server/src/app.ts` (after the agent-run reaper, the same non-fatal try/catch calls `await buildEvalService(container, app.log).reapInterrupted()`)
      - new tests: `server/test/eval-cases.it.test.ts`, `eval-runs.it.test.ts`, `eval-history.it.test.ts`, `eval-rate-limit.it.test.ts`
    - layer: edge (routes, wiring) · lane: 4
    - skills: onion-architecture, fastify-best-practices, zod, security, drizzle-orm-patterns
    - turns green: AC-2, 3, 4, 5, 7, 8, 9 (route half), 10, 11, 12 (integration), 13, 14, 15, 22, 25, 26, 27, 28, 29 (integration), 30, 31, 32, 33, 34, 42, 43 (integration), 45, 47, 48, 57, 58
    - test first: the four integration files from `## Red-first`.
      - Each test subclasses `MockLLMProvider` inside the test file (gated: `completeStructured` awaits a promise the test releases; failing on call n) and registers it under every provider id (`server/INSIGHTS.md:76`).
      - AC-30 part 1 builds the service with `buildEvalService(app.container, app.log, { store: wrappedStoreThatThrowsOnSecondFinishCaseRun })`.
      - AC-30 part 2 inserts a `running` suite row and a `running` case run, then calls `buildApp` again and reads both through the routes (`failed` / `errored`, error `interrupted`).
      - AC-28 builds the app with `NODE_ENV=development, LOG_LEVEL=silent` in its own file.
      - AC-58 inserts 50 suites × 50 eval_runs directly, then calls each of the three routes 20× and asserts p95 < 500 ms.
      - Cross-workspace tests insert a second workspace's agent, case and suite and expect 404 with valid uuids.
    - interfaces: consumes `EvalService` (steps 8–10), `EvalRepository` (step 6), `runEvalCase` (step 7).
      - Produces `buildEvalService(container: Container, log: FastifyBaseLogger, opts: Partial<EvalPorts> = {}): EvalService`. The wiring fills:
        - `store = new EvalRepository(container.db)`;
        - `getAgent` / `listAgents` from `container.agentsRepo.getById` / `.list`;
        - `resolveSkills` from `container.agentsRepo.enabledSkillsForAgent`, mapped with `isSkillUntrusted(skill.source)`;
        - `findingContext` from `container.reviewRepo.findingContext`, mapped with `accepted = !!acceptedAt`;
        - `prFilePatch` from `container.reviewRepo.getPrFiles`;
        - `runCase = (i) => runEvalCase({llm: async (p) => container.llm(p), parseDiff: parseUnifiedDiff, nowMs: Date.now}, i)`;
        - `background = (task) => void task().catch((e) => log.error({err: redactSecrets(String(e))}, 'eval: background task failed'))`.
      - Routes, each with `schema.params/body/querystring` and `response`:
        - `POST /findings/:id/eval-case` → 201 or 200 with `EvalCaseCreated`
        - `GET /agents/:id/eval-cases` → `EvalCaseView[]`
        - `POST /agents/:id/eval-cases` → 201 `EvalCaseView`
        - `PUT /eval-cases/:id` → `EvalCaseView`
        - `DELETE /eval-cases/:id` → `{ok: true}`
        - `POST /eval-cases/:id/run` → 202 `EvalCaseRunAccepted`, rate limit 10/min
        - `GET /eval-case-runs/:id` → `EvalCaseResult`, `rateLimit: false`
        - `POST /agents/:id/eval-runs` → 202 `EvalSuiteRunAccepted`, 10/min
        - `POST /eval-runs/all` → 202 `EvalRunAllResult`, 10/min
        - `GET /eval-suite-runs/compare?base=&head=` (registered before `/:id`; `CompareQuery = z.object({base: uuid, head: uuid})` in `schemas.ts`) → `EvalCompare`
        - `GET /eval-suite-runs/:id` → `EvalSuiteRunDetail`, `rateLimit: false`
        - `GET /agents/:id/eval-suite-runs` → `EvalSuiteRunSummary[]`
        - `GET /agents/:id/eval-dashboard` → `EvalAgentDashboard`
        - `GET /eval/dashboard` → `EvalWorkspaceDashboard`
    - verify: `cd server && pnpm exec vitest run test/route-adapter-calls.test.ts` → passes (no adapter call in `eval/routes.ts`). The integration files are run by plan-verifier.

12. [UI] client — eval hooks and i18n keys
    - files: `client/src/lib/hooks/eval.ts` (new); `client/src/lib/hooks/eval.test.tsx` (new); `client/messages/en/eval.json` (changed: add the keys in *Contracts & data*, keep existing keys)
    - layer: lib · lane: 5
    - skills: react-best-practices, zod, react-testing-library
    - turns green: none directly
    - test first: `client/src/lib/hooks/eval.test.tsx`:
      - "useSuiteRun polls every 1500 ms while running and stops at done" (mocked fetch, fake timers);
      - "useCaseRun stops at errored".
    - interfaces: consumes step 1 types (`import type` from `@devdigest/shared`). Produces:
      - `useEvalCases(agentId)`, query key `['eval-cases', agentId]`
      - `useCreateEvalCase(agentId)`, `useUpdateEvalCase(agentId)`, `useDeleteEvalCase(agentId)`
      - `useCreateCaseFromFinding()`, mutation over `{findingId}` returning `EvalCaseCreated`; the error is `ApiError` with the server message
      - `useStartCaseRun()`, `useCaseRun(caseRunId|null)`, polling while `running`
      - `useStartSuiteRun()`, mutation over `agentId`
      - `useSuiteRun(suiteRunId|null)`, polling while `running`, and on the edge into a terminal status invalidating `['eval-dashboard', agentId]`, `['eval-cases', agentId]`, `['eval-history', agentId]`
      - `useRunAllAgents()`
      - `useEvalHistory(agentId)`, `useEvalCompare(baseId|null, headId|null)`, `useAgentEvalDashboard(agentId)`, `useEvalWorkspaceDashboard()`
    - verify: `cd client && pnpm exec vitest run src/lib/hooks/eval.test.tsx` → pass

13. [UI] client — shared eval helpers, MetricStat, DeltaBadge
    - files: `client/src/components/eval/helpers.ts`, `helpers.test.ts`, `constants.ts`, `MetricStat/{MetricStat.tsx, MetricStat.test.tsx, index.ts, styles.ts}`, `DeltaBadge/{DeltaBadge.tsx, DeltaBadge.test.tsx, index.ts}` (new)
    - layer: shared component (promoted: consumers `/agents/[id]` Evals tab and `/eval/**`) · lane: 5
    - skills: frontend-ui-architecture, react-testing-library, react-best-practices
    - turns green: AC-23 (MetricStat), AC-49, AC-50
    - test first: the three red-first rows, plus helpers tests:
      - `formatPct(null) === '—'`, `formatPct(0.823) === '82%'`;
      - `formatCost(null,false) === '—'`, `formatCost(0.03,true)` contains `0.03` and a partial marker;
      - `runLabel(3,2) === 'run #3 · agent v2'`.
    - interfaces: produces
      - `formatPct(v: number|null): string`
      - `formatCost(v: number|null, partial: boolean): string`
      - `runLabel(runNumber: number, agentVersion: number): string`
      - `deltaView(delta: number|null, unit: 'pts'|'usd'): {text: string; direction: 'up'|'down'|'flat'|'none'}` (sign `+`/`−`, U+2212)
      - `compareEnabled(selected: readonly EvalSuiteRunSummary[]): boolean`
      - `<MetricStat label value={number|null} delta={number|null} neverRun?: boolean />`
      - `<DeltaBadge delta={number|null} unit />`: renders sign, arrow icon and a visually hidden "up" or "down" text alternative
    - verify: `cd client && pnpm exec vitest run src/components/eval/` → pass

14. [UI] client — RunHistoryTable, TrendChart, CompareModal
    - files: `client/src/components/eval/RunHistoryTable/**`, `TrendChart/**`, `CompareModal/**` (new, each with `<Name>.tsx`, `<Name>.test.tsx`, `index.ts`, `styles.ts` as needed)
    - layer: shared component · lane: 5
    - skills: frontend-ui-architecture, react-testing-library, react-best-practices, security
    - turns green: AC-23 (history row)
    - test first:
      - `RunHistoryTable.test.tsx`:
        - "AC-23 null precision renders —";
        - "rows newest first show label, status, passed/executed, errored count only when > 0, cost";
        - "checkbox accessible name is the run label";
        - "Compare disabled unless compareEnabled";
        - "a running row shows Running k/N".
      - `CompareModal.test.tsx`: "old → new values with DeltaBadge, prompt diff lines marked add/remove, config changes, 'case set changed: +2 / −1' when non-zero".
      - `TrendChart.test.tsx`: "text alternative lists each point's label and values, a null as —".
    - interfaces: consumes step 12 hooks and step 13 helpers. Produces:
      - `<RunHistoryTable runs={EvalSuiteRunSummary[]} onCompare={(base, head) => void} />` (selection state is local)
      - `<TrendChart points={EvalTrendRunPoint[]} />` (recharts direct, `connectNulls={false}`, tooltip `runLabel · formatCost`)
      - `<CompareModal baseId headId onClose />` (calls `useEvalCompare`; the prompt diff scrolls, no truncation; all text as text)
    - verify: `cd client && pnpm exec vitest run src/components/eval/` → pass

15. [UI] client — sidebar item
    - files: `client/src/vendor/ui/nav.ts` (changed: in `SKILLS LAB` after `conventions`, `{ key: "eval", label: "Eval Dashboard", icon: "Gauge" if present in `IconName`, else "Activity", href: "/eval" }`); `client/src/components/app-shell/EvalDashboardNav.test.tsx` (new)
    - layer: shell config · lane: 5
    - skills: frontend-ui-architecture, react-testing-library
    - turns green: none (AC-51 is e2e in step 22)
    - test first: `EvalDashboardNav.test.tsx` "Sidebar shows Eval Dashboard under SKILLS LAB, linking to /eval, active when activeKeyFor('/eval/abc') === 'eval'" (pattern: `client/src/components/app-shell/ProjectContextNav.test.tsx:11`)
    - interfaces: consumes `activeKeyFor` (unchanged)
    - verify: `cd client && pnpm exec vitest run src/components/app-shell/EvalDashboardNav.test.tsx` → pass

16. [UI] client — "Turn into eval case" on finding cards
    - files:
      - new: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/_components/TurnIntoEvalButton/{TurnIntoEvalButton.tsx, TurnIntoEvalButton.test.tsx, index.ts}`
      - changed: `FindingCard/FindingCard.tsx` (prop `evalAgent?: {id: string|null; name: string|null}`; renders the button in the actions row only when the prop is defined); `FindingsPanel/FindingsPanel.tsx` (pass-through prop); `ReviewRunAccordion/ReviewRunAccordion.tsx` (passes `{id: review.agent_id, name: review.agent_name ?? null}`)
      - tests: add `eval` messages (and a `QueryClientProvider` where missing) to `FindingCard.test.tsx`, `FindingsPanel.test.tsx`, `ReviewRunAccordion.test.tsx`, `page.test.tsx`, `page.hardening.test.tsx`
    - layer: route component · lane: 6
    - skills: frontend-ui-architecture, react-testing-library, react-best-practices, security
    - turns green: AC-12 (unit)
    - test first: `TurnIntoEvalButton.test.tsx`:
      - "AC-12": a mocked 201 shows a toast naming the agent with a link to `/agents/<agent id>?tab=evals&case=<case id>`; a mocked 422 shows the server message.
      - "undecided → disabled with hint 'Accept or dismiss first'".
      - "null agent → disabled".
      - "double click sends one request" (useRef guard).
    - interfaces: consumes `useCreateCaseFromFinding` (step 12), the `toast` from `client/src/lib/toast.tsx`, `eval.finding.*` keys. Produces `<TurnIntoEvalButton finding={FindingRecord} agent={{id, name}} />`.
    - verify: `cd client && pnpm exec vitest run 'src/app/repos/[repoId]/pulls/[number]/_components'` → pass

17. [UI] client — Evals tab pure helpers
    - files: `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/helpers.ts`, `helpers.test.ts`, `constants.ts` (new)
    - layer: route component helpers · lane: 6
    - skills: frontend-ui-architecture, zod, security
    - turns green: none alone (AC-38, 39, 41, 44 render tests in steps 18–19)
    - test first: `helpers.test.ts`:
      - `validateExpectedOutput('[')` gives `{ok:false, error: <JSON error>}`; `'[{"type":"must_find","start_line":1,"end_line":1}]'` gives an error mentioning `file`; a valid list gives `{ok:true, value}`;
      - `appendFindingSkeleton('[]')` parses to one `{type:'must_find', file:'', start_line: null, end_line: null}`;
      - `unmatchableExpectations(diffWithHunk10to16, [{file:'src/config.ts', start_line:40, end_line:40}])` returns `[0]`, and at 12 returns `[]`;
      - `maskSecrets('k = "sk_live_51H8xq2Ka"')` contains no `sk_live_51H8xq2Ka`, and the same for `ghp_`, `AKIA` and a PEM block;
      - `diffToPrFiles(text)` returns `[{path, additions, deletions, patch}]`;
      - `passingCount(cases)` returns `{passed, total}`.
    - interfaces: produces
      - `validateExpectedOutput(text: string): {ok: true; value: EvalExpectation[]} | {ok: false; error: string}` (runtime schema via `import { EvalExpectedOutput } from "@devdigest/shared/contracts/eval-pipeline"`)
      - `appendFindingSkeleton(text: string): string`
      - `hunkRangesByFile(diff: string): Map<string, [number, number][]>`
      - `unmatchableExpectations(diff: string, list: EvalExpectation[]): number[]`
      - `maskSecrets(text: string): {masked: string; found: boolean}`
      - `diffToPrFiles(diff: string): PrFile[]`
      - `passingCount(cases: EvalCaseView[]): {passed: number; total: number}`
      - `expectationChipKey(list: EvalExpectation[]): 'mustFind'|'mustNotFlag'|'expectClean'|'mixed'`
    - verify: `cd client && pnpm exec vitest run 'src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/helpers.test.ts'` → pass

18. [UI] client — Case Editor modal
    - files: `.../EvalsTab/_components/CaseEditor/{CaseEditor.tsx, CaseEditor.test.tsx, index.ts, styles.ts}` (new)
    - layer: route component · lane: 6
    - skills: frontend-ui-architecture, react-testing-library, react-best-practices, security
    - turns green: AC-35, AC-38, AC-39, AC-41
    - test first: `CaseEditor.test.tsx`:
      - "AC-38": invalid JSON, then a missing file, shows the error text twice, and Save is enabled only when valid with name and diff.
      - "AC-39": the skeleton button on `[]` gives one must_find object with `file`, `start_line`, `end_line` keys.
      - "AC-41": the warning is next to the line-40 expectation and Save stays enabled.
      - "AC-35": with Run on save switched on (`getByRole('switch')`), Save → PUT or POST, then `POST /eval-cases/:id/run`, then the polled result shows passed or failed with duration and cost in the last-run panel.
      - "Preview tab renders the pasted diff through DiffViewer with masked secrets until Reveal".
    - interfaces: consumes step 12 hooks, step 17 helpers, `DiffViewer` from `client/src/components/diff-viewer`. Produces `<CaseEditor agentId case?: EvalCaseView onClose />` with tabs Diff, Preview and PR meta (no Files tab).
    - verify: `cd client && pnpm exec vitest run '.../EvalsTab/_components/CaseEditor'` → pass

19. [UI] client — Evals tab, case row, reachability
    - files:
      - new: `.../EvalsTab/{EvalsTab.tsx, EvalsTab.test.tsx, index.ts, styles.ts}`, `.../EvalsTab/_components/CaseRow/{CaseRow.tsx, CaseRow.test.tsx, index.ts}`, `.../EvalsTab/_components/MaskedText/{MaskedText.tsx, index.ts}`
      - changed: `AgentEditor/constants.ts` (add `{key: "evals", labelKey: "editor.tabs.evals", icon: "FlaskConical" or an existing IconName}`); `AgentEditor/AgentEditor.tsx` (`tab === "evals" ? <EvalsTab agent={agent} />`); `client/src/app/agents/[id]/page.tsx` (`VALID_TABS = ["config","skills","context","evals"]`); `client/src/app/agents/[id]/page.test.tsx` (case `?tab=evals`); `AgentEditor.test.tsx` (tab renders)
    - layer: route component · lane: 6
    - skills: frontend-ui-architecture, react-testing-library, react-best-practices, next-best-practices, security
    - turns green: AC-29 (unit, Evals tab), AC-43 (unit), AC-44
    - test first:
      - `CaseRow.test.tsx`: "AC-43": `source {pr_number: 7, repo_id: 'r1'}` renders "Created from PR #7" linking to `/repos/r1/pulls/7`. "AC-44": the masked form shows until Reveal.
      - `EvalsTab.test.tsx`:
        - "AC-29": mocked dashboard has a running suite; suite reads running 1/3, then done; shows "Running 1/3" then the metrics, without remount.
        - "passing 1 / 4 with passed, failed, errored and never-run rows, matched x of y".
        - "no cases → empty text, New eval case, Run all evals disabled".
        - "a 422 on Run all evals shows the server reason" (AC-26 UI).
        - "View full dashboard links /eval/<agentId>".
        - "?case=<id> opens that case in the editor".
      - `page.test.tsx`: "?tab=evals renders the Evals tab".
    - interfaces: consumes steps 12–14, 17, 18. Produces `<EvalsTab agent={Agent} />`: metric cards (MetricStat), case list, history (RunHistoryTable + CompareModal) and TrendChart.
    - verify: `cd client && pnpm exec vitest run 'src/app/agents/[id]'` → pass

20. [UI] client — Eval Dashboard page (`/eval`)
    - files: `client/src/app/eval/page.tsx` (new, thin); `client/src/app/eval/_components/EvalDashboardView/{EvalDashboardView.tsx, EvalDashboardView.test.tsx, index.ts, styles.ts}`, `.../_components/AgentRow/**`, `.../_components/RecentRuns/**` (new)
    - layer: route · lane: 7
    - skills: frontend-ui-architecture, next-best-practices, react-testing-library, react-best-practices
    - turns green: AC-53, AC-54
    - test first: `EvalDashboardView.test.tsx`:
      - "AC-53 empty response → empty state pointing to findings and the Evals tab";
      - "AC-54 agent with cases and latest null → 'never run' and —";
      - "two agents with latest values and Sparkline; recent runs newest first";
      - "Run all agents shows started/skipped with reasons".
    - interfaces: consumes `useEvalWorkspaceDashboard`, `useRunAllAgents`, step 13 helpers, vendored `Sparkline` (null points dropped). Produces the page at `/eval` with crumb Skills Lab › Eval Dashboard, rows linking to `/eval/<agentId>`.
    - verify: `cd client && pnpm exec vitest run src/app/eval/_components` → pass

21. [UI] client — per-agent dashboard (`/eval/[agentId]`)
    - files: `client/src/app/eval/[agentId]/page.tsx` (new); `.../_components/AgentEvalDashboardView/{AgentEvalDashboardView.tsx, AgentEvalDashboardView.test.tsx, index.ts, styles.ts}`, `.../_components/RegressionBanner/**`, `.../_components/AgentSwitcher/**` (new)
    - layer: route · lane: 7
    - skills: frontend-ui-architecture, next-best-practices, react-testing-library, react-best-practices
    - turns green: AC-29 (unit, dashboard), AC-56 (render)
    - test first:
      - `RegressionBanner.test.tsx` "AC-56": an alert with precision 2 and run 7 v3 renders `role="alert"` naming precision, "2 pts" and "run #7 · agent v3"; a null alert renders nothing.
      - `AgentEvalDashboardView.test.tsx`:
        - "AC-29 Running k/N then metrics";
        - "stat cards show latest value and DeltaBadge vs previous";
        - "the switcher calls router.replace('/eval/<other>') and cards change";
        - "Run eval starts a suite".
    - interfaces: consumes `useAgentEvalDashboard`, `useStartSuiteRun`, `useSuiteRun`, `useAgents` (`client/src/lib/hooks/agents.ts`), and the `RunHistoryTable`, `TrendChart`, `CompareModal`, `MetricStat` components. Produces the page with crumb Skills Lab › Eval Dashboard › <agent>.
    - verify: `cd client && pnpm exec vitest run 'src/app/eval/[agentId]'` → pass

22. [BE/UI] seed and e2e — read-only eval views
    - files: `server/src/db/seed.ts` (changed: an idempotent eval demo block, inserted only when no `eval_cases` row exists for the workspace); `e2e/specs/10-eval-dashboard.flow.json`, `11-agent-evals-tab.flow.json`, `12-finding-eval-button.flow.json` (new)
    - layer: seed / e2e · lane: 8
    - skills: drizzle-orm-patterns, postgresql-table-design (seed); e2e follows `e2e/CLAUDE.md`
    - turns green: AC-9 (UI half), AC-36, AC-37, AC-40, AC-51, AC-52, AC-55
    - test first: the flows themselves.
      - Seed:
        - "Security Reviewer" gets 4 cases (named passed, failed, errored and never-run demo cases, with eval_runs rows for the first three) and 2 done suites;
        - "Performance Reviewer" gets 1 case and 1 done suite;
        - "Test Quality Reviewer" keeps 0 cases (AC-37);
        - one seeded finding stays undecided (AC-9).
      - Flows (only `open`, `wait --url`, `wait --text`, `find` locators; no LLM, no writes):
        - 10: sidebar "Eval Dashboard" → `/eval`, two agent rows, the recent-runs list; open an agent row → per-agent dashboard; switch agent.
        - 11: `/agents/<id>?tab=evals` → "passing 1 / 4" and the four states; the no-cases agent shows the empty text; open New eval case, fill the diff, Preview shows the added line.
        - 12: PR detail → expand the undecided finding → "Accept or dismiss first".
    - interfaces: consumes the tables from step 2 and the UI from steps 15–21
    - verify: `cd e2e && npm run typecheck` → exit 0. The main session runs `E2E_PG_PORT=5633 E2E_API_PORT=3301 E2E_WEB_PORT=3300 npm run e2e:hermetic`.

## Contracts & data
- **Shared contract:** `contracts/eval-pipeline.ts` (step 1), server first, client mirror identical, one barrel line in each `index.ts`. Existing eval contracts unchanged.
- **Migration:** generated `0015_*.sql` (step 2) via `pnpm db:generate`, applied with `pnpm db:migrate` on the 5632 DB.
- **i18n:** `client/messages/en/eval.json`. L5 adds these keys (English as shown); L6 and L7 consume them and add none (a missing key is reported as a deviation for the main session).
  - `finding`:
    - `turnInto` "Turn into eval case"
    - `hintUndecided` "Accept or dismiss first"
    - `hintNoAgent` "This finding's review has no agent"
    - `created` "Eval case added to {agent}"
    - `openCase` "Open in Evals"
  - `metric`:
    - `recall` "Recall", `precision` "Precision", `citation` "Citation accuracy", `passed` "Passed", `cost` "Cost"
    - `none` "—", `neverRun` "never run"
    - `runLabel` "run #{n} · agent v{v}"
    - `up` "up", `down` "down"
    - `partialCost` "partial"
  - `status`:
    - `running` "Running {done}/{total}"
    - `done` "done", `partial` "partial", `failed` "failed", `passed` "passed", `errored` "errored", `neverRun` "never run"
  - `evalsTab` additions:
    - `passing` "passing {passed} / {total}"
    - `matched` "matched {matched} of {expected} expected"
    - `chip.mustFind` "must find", `chip.mustNotFlag` "must NOT flag", `chip.expectClean` "expect clean", `chip.mixed` "{count} expectations"
    - `runAll` "Run all evals", `newEvalCase` "New eval case", `viewDashboard` "View full dashboard"
    - `createdFrom` "Created from PR #{number}"
    - `reveal` "Reveal", `hide` "Hide", `masked` "•••• credential hidden"
    - `runCase` "Run case", `deleteConfirm` "Delete eval case \"{name}\"?"
  - `caseEditor` additions:
    - `findingSkeleton` "Finding skeleton", `runOnSave` "Run on save"
    - `neverMatched` "This expectation can never be matched"
    - `nameRequired` "Name is required", `diffRequired` "Diff is required"
    - `cancel` "Cancel"
    - `lastRunErrored` "Last run errored"
    - `lastRunSummary` "matched {matched} of {expected} · {duration}s · {cost}"
  - `history`:
    - `title` "Recent runs", `ranAt` "Ran at", `run` "Run", `status` "Status"
    - `pass` "{passed}/{executed}", `errored` "{count} errored"
    - `select` "Select {label}", `compare` "Compare", `selected` "{count} selected"
  - `compare`:
    - `title` "Compare runs · {base} → {head}"
    - `promptDiff` "System prompt diff", `configChanges` "Configuration changes", `noConfigChanges` "No model, provider or skill changes"
    - `caseSetChanged` "case set changed: +{added} / −{removed}"
    - `old` "{label} (old)", `new` "{label} (new)", `close` "Close"
  - `trend`:
    - `title` "Metric trend", `tooltip` "{label} · {cost}", `textAlt` "Trend points"
  - `dashboard` additions:
    - `subtitle` "Regression harness across all reviewer agents · pick an agent to see its runs"
    - `agents` "Agents", `recentAll` "Recent eval runs · all agents"
    - `runAllAgents` "Run all agents", `runAllResult` "{started} started · {skipped} skipped"
    - `skip.disabled` "disabled", `skip.noCases` "no cases", `skip.tooManyCases` "too many cases", `skip.alreadyRunning` "already running"
    - `emptyTitle` "No eval cases yet", `emptyBody` "Turn an accepted or dismissed finding into an eval case, or create one on an agent's Evals tab."
    - `lastRun` "Last {label} · {date} · {passed}/{executed} pass"
    - `allAgents` "All agents", `runEvalAgent` "Run eval", `switchAgent` "Switch agent"
    - `regression` "{metrics} dropped on {label}", `regressionItem` "{metric} −{points} pts"
- **Seed:** the eval demo block in `server/src/db/seed.ts` (step 22), idempotent.

## Checks for the implementer
- multi-agent, per lane: the targeted `pnpm exec vitest run <file>` for each of the lane's test files (step verify lines), plus the typecheck judged on owned paths:
  - server lanes: `cd server && pnpm typecheck`;
  - client lanes: `cd client && pnpm typecheck` (inside srt: `pnpm exec tsc --noEmit --incremental false`);
  - L8: `cd e2e && npm run typecheck`.
  - L4 doesn't run its `*.it.test.ts` files (Docker); it runs `test/route-adapter-calls.test.ts`.
- multi-agent, main session after each DAG level:
  - server: `pnpm typecheck` · `pnpm exec vitest run --exclude '**/*.it.test.ts'`
  - client: `pnpm typecheck` · `pnpm test`
  - e2e (level 5): `npm run typecheck`
  - reviewer-core is unchanged, so no extra server run is triggered by it.

## Checks for reviewers          (plan-verifier first, then the rest in parallel)
- plan-verifier: AC-1 … AC-58 against this plan, the red-run records, and the integration suites `cd server && pnpm exec vitest run .it.test` (Docker), including `eval-cases`, `eval-runs`, `eval-history` and `eval-rate-limit`.
- architecture-reviewer:
  - `pnpm lint:boundaries` (server);
  - the onion-architecture step 9 report, including `scripts/cross-module-imports.py` and the purity of `scoring.ts`/`compare.ts`;
  - `test/route-adapter-calls.test.ts`;
  - frontend-ui-architecture placement (`src/components/eval/` promotion, colocated `_components`).
- security-reviewer: workspace scoping on all 14 routes, untrusted case text kept out of trusted framing, redaction of provider errors, text-only rendering of model output and case text, credential masking, rate limits.
- main session:
  - `/code-review` on the bundle;
  - `E2E_PG_PORT=5633 E2E_API_PORT=3301 E2E_WEB_PORT=3300 npm run e2e:hermetic` (AC-9, 36, 37, 40, 51, 52, 55);
  - browser check of AC-46 (seed five runs incl. one failed and one null precision: four points per line, a precision gap, tooltip "run #N · agent vM · $cost");
  - `pr-self-review`.

## Out of scope
- Writing or changing the spec (spec-creator), architecture review (architecture-reviewer), acceptance verification (plan-verifier), security review (security-reviewer), and AC-46 plus e2e runs (main session).
- Spec non-goals: Promote, the Files tab, the "30 days" filter, cancelling a suite, repeats per case, skill-owned cases, CI evals, the test-gate hook, mutation testing (the later pass targets `scoring.ts`), skill-eval export.
- Any change to reviewer-core, live review runs, `ReviewRunExecutor`, `container.jobs` or `src/vendor/ui` beyond `nav.ts`.
- ADRs and `INSIGHTS.md` entries (main session, from the reports' candidates).

## Risks
- AC-58 p95 depends on the indexes in step 2 and on `listSuites` not selecting `snapshot`. If the testcontainer is slow on CI, the 500 ms bound may flake; measure locally first.
- The partial unique index `WHERE status = 'running'` must come out of drizzle-kit as written. If `pnpm db:generate` emits no `WHERE`, L0 stops and reports. It must not hand-edit the SQL.
- agent-browser's `find … fill` form for AC-40 is unverified in this repo's flows. If it isn't supported, AC-40 goes back to spec-creator (see Open questions). Run `researcher` on agent-browser's `find` actions if the main session wants certainty first.
- Icon names (`Gauge`, `FlaskConical`) must exist in the vendored `IconName`. Otherwise use an existing icon. Never import lucide directly (`client/INSIGHTS.md:25`).
- L4 is the largest lane (4 integration files). If it nears its 150-call budget, it returns `partial` and writes the remaining files next; `eval-history` and `eval-rate-limit` are the natural split point.
