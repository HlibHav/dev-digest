<result>I found 9 issues, ranked most severe first. Of the nine CR items, five are closed, two are open and two are partly closed. Neither open item is fully fixed in the delta.

| CR | Verdict | Why |
|---|---|---|
| CR-8 | Closed | `CaseRow` follows whichever run id was set last, and every `CaseEditor` close goes through `closeWith`. |
| CR-12/CR-22 | Closed as specified | It brings a regression with it (finding 4). I checked that `kind` reaches scoring: `case-runner.ts:57` passes reviewer-core's findings through unchanged. |
| CR-16/CR-20 | Partly closed | Only the crash inside `runOne` advances `cases_done` and counts as errored. A throwing `insertCaseRun` does neither (finding 6). |
| CR-21 | Open | Only "no response was ever received" ends tracking. A 404 that comes after one `running` response keeps the suite running forever (finding 1). |
| CR-23 | Partly closed | Polling stops, but after one failed poll with its retries, not after three polls (finding 2). Only `CaseRow` shows the error; `CaseEditor` ignores it (finding 3). |
| CR-24 | Closed | Same caveat as finding 5. |
| CR-25 | Closed | |
| CR-26 | Closed | Both route-local `runningProgress` copies are gone. |
| CR-27 | Closed | |

```json
[
  {
    "file": "client/src/lib/hooks/eval-tracked-suite.ts",
    "line": 30,
    "summary": "CR-21 is still open: a tracked suite that has returned at least one `running` response keeps counting as running forever after its fetch starts returning 404. The decideSuite docstring narrows `failed` to 'no response ever received', and the code agrees.",
    "failure_scenario": "Suite X polls once as running at 2/5. The agent is deleted in another tab, and `eval_suite_runs.agent_id` is ON DELETE CASCADE, so the row disappears. `useSuiteRun` gets a 404 with no retry, but `query.data` still holds the old running response. `refetchInterval` only checks `data.status === 'running'`, so it polls the 404 every 1.5s indefinitely. decideSuite sees `suite !== undefined &amp;&amp; status === 'running'` and treats the suite as unsettled. The screen shows 'running 2/5' forever and Run all stays disabled."
  },
  {
    "file": "client/src/lib/hooks/eval.ts",
    "line": 112,
    "summary": "The failure counter goes up once per queryFn attempt, and `retry` allows 3 attempts inside a single fetch. So 'stops after 3 consecutive failures' really means one failed poll with its retries, about 3s of retry backoff. A short outage stops polling for good.",
    "failure_scenario": "The local API restarts under `tsx watch` (`pnpm dev`) for about 3 seconds while case runs are in progress. A single poll fails all 3 attempts, n reaches 3, `refetchInterval` returns false and the row shows the error and stops polling. The run keeps going on the server, but when it ends nothing refreshes the case list, because the invalidate-on-terminal effect never fires. The CaseRow comment 'a transient error keeps polling' no longer matches the code. The only recovery is a window-focus refetch or starting a new LLM run, which costs money."
  },
  {
    "file": "client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/CaseEditor/CaseEditor.tsx",
    "line": 83,
    "summary": "CaseEditor uses `useCaseRun` but ignores `run.stalled` and `run.error`, including a 404. When polling stops, the editor keeps showing 'running'. CR-23 only reaches the user through CaseRow.",
    "failure_scenario": "Save with Run on save. The case-run polls then fail 3 times, or return a 404. `lastRunView(run.data ?? null, caseRunId !== null, ...)` returns `{status: 'running'}` because `runStarted` is true and `data` is undefined or still running. Polling has stopped, so the status block shows 'running' indefinitely and no error ever appears in the editor."
  },
  {
    "file": "server/src/modules/eval/scoring.ts",
    "line": 45,
    "summary": "Deciding whole-file by kind alone also turns precisely-cited secret_leak and hook findings into whole-file ones. A correct finding on line 5 becomes noise against any must_not_flag on the same file, and it gets credit for a must_find hundreds of lines away.",
    "failure_scenario": "The case expects must_find a.ts:5 (the real key) and must_not_flag a.ts:40-50 (a fixture key). The agent reports a correct `secret_leak` at 5..5. findingMatches returns true for the must_not_flag, so the finding counts as noise and the case fails. That kind of case can never pass. The same precise finding would also satisfy a must_find at a.ts:400. Narrower fix: treat a finding as whole-file only when its kind is in FULL_FILE_KINDS and its range is 0..0."
  },
  {
    "file": "client/src/lib/hooks/eval-tracked-suite.ts",
    "line": 30,
    "summary": "A suite that is actually running but whose first fetch fails (3 attempts, no data) is marked settled. From then on, the history row with the same id is ignored as stale, so the screen drops a running suite and enables Run all again.",
    "failure_scenario": "Click Run all and get back suite X. The first `useSuiteRun` fetch fails 3 times on a network blip, so isError is true, data is undefined and `refetchInterval` returns false. decideSuite returns settled with progress null. The dashboard history lists X as running, but `resumed.id === trackedId` means it is never adopted. The metrics cards come back and Run all is enabled. Clicking it gets 'already running' from the server, and progress stays hidden until a window-focus refetch."
  },
  {
    "file": "server/src/modules/eval/service.ts",
    "line": 586,
    "summary": "The CR-16/20 crash fix only covers a throw inside `runOne`. If `insertCaseRun` throws (or `updateSuiteProgress` after a finished case), control jumps to the outer catch without advancing `cases_done` or counting the case as errored.",
    "failure_scenario": "A DB error inside `insertCaseRun` on case 3 of 5. The outer catch marks the suite failed with casesErrored 0 and cases_done 2. The UI shows a failed suite in which nothing errored and the crashed case is not counted."
  },
  {
    "file": "client/src/lib/hooks/eval.ts",
    "line": 137,
    "summary": "Returning `{ ...query, stalled }` reads every getter on the React Query result. That defeats tracked-props render optimisation, so each polling row re-renders on every fetchStatus and isFetching change.",
    "failure_scenario": "With N case rows polling every 1.5s, each poll triggers extra renders per row for isFetching true/false, even though CaseRow only reads data, error and stalled. Keep the observer result un-spread (for example, return `stalled` next to the query) so tracking stays limited to the fields that are used."
  },
  {
    "file": "server/src/modules/eval/scoring.ts",
    "line": 12,
    "summary": "FULL_FILE_KINDS is copied by hand from `reviewer-core/src/grounding.ts:16` instead of being exported and imported. The two lists can silently drift apart.",
    "failure_scenario": "Someone adds a new full-file scanner kind to reviewer-core grounding. Grounding keeps those findings regardless of their lines, but eval scoring treats them as line-range findings, so they match nothing and pull recall down. Root CLAUDE.md says: 'Cross-package code is shared as raw TypeScript through tsconfig path aliases.' reviewer-core is pure too, so exporting the set from there does not break the purity argument."
  },
  {
    "file": "server/src/modules/eval/scoring.ts",
    "line": 75,
    "summary": "A whole-file finding that finds no open must_find left on its file still increments matchedFindings, so duplicate vague findings inflate precision.",
    "failure_scenario": "must_find a.ts:10, plus one line finding at 10 and four duplicate `secret_leak` findings on a.ts. Recall is 1/1, and precision counts 5/5 matched even though four findings satisfied nothing. Only count a whole-file finding as matched when it actually takes an open expectation."
  }
]
```</result>
<usage><subagent_tokens>134621</subagent_tokens><tool_uses>15</tool_uses><duration_ms>391597</duration_ms></usage>
</task-notification>