# Implementation Report: Eval Pipeline, lane 6 (client UI)
Status: done
Mode: lane 6 (Red-first: implementer-owned)

## Steps
| id | BE/UI | status | files touched | note |
|---|---|---|---|---|
| 16 | UI | done | `FindingCard/_components/TurnIntoEvalButton/{TurnIntoEvalButton.tsx,.test.tsx,index.ts}` (new); `FindingCard.tsx`, `FindingsPanel.tsx`, `ReviewRunAccordion.tsx` (`evalAgent` prop pass-through) | the button renders only when `evalAgent` is set. The accordion always passes `{id: review.agent_id, name}`. |
| 17 | UI | done | `EvalsTab/{constants.ts,helpers.ts,helpers.test.ts}` | all eight helpers from the plan. |
| 18 | UI | done | `EvalsTab/_components/CaseEditor/{CaseEditor.tsx,.test.tsx,index.ts,styles.ts,constants.ts,helpers.ts}` | `constants.ts` and `helpers.ts` are extras: a status-key map and a pure `lastRunView`. |
| 19 | UI | done | `EvalsTab/{EvalsTab.tsx,.test.tsx,index.ts,styles.ts}`, `_components/CaseRow/{CaseRow.tsx,.test.tsx,index.ts,styles.ts}`, `_components/MaskedText/{MaskedText.tsx,index.ts}`; `AgentEditor/constants.ts` (evals tab), `AgentEditor.tsx`, `AgentEditor.test.tsx`; `agents/[id]/page.tsx` (`VALID_TABS`), `page.test.tsx` | |

## Skills applied
- preloaded: onion-architecture (no backend work), frontend-ui-architecture
- invoked through Skill: react-best-practices, react-testing-library, security, zod, next-best-practices. These are all the client skills the plan names. frontend-ui-architecture was preloaded.
- named by the plan but not invoked: none

## Self-review (code writing)
- frontend-ui-architecture:
  - Placement: `TurnIntoEvalButton` is private to `FindingCard/_components/` (step 1, step 4). `CaseEditor`, `CaseRow` and `MaskedText` are under `EvalsTab/_components/` (step 4). `CaseRow` and `CaseEditor` import the shared `components/eval` and `components/diff-viewer`, and `EvalsTab/helpers.ts` is pure with no React import (step 5). No new `export *`, one named barrel per folder.
  - Data goes through `@/lib/hooks/eval`, with no `fetch` in components (step 6).
- react-best-practices:
  - Derived values are computed during render (`active` editing id, `running`, `lastView`). No `useEffect` for derived state.
  - The one effect, in `CaseRow`, invalidates the cases cache once on a case run's terminal edge, with a ref guard.
  - The double-click guard is a `useRef`.
- security: case names, titles and findings render as text only. Credentials are masked in the row, the preview and the editor, and Reveal is an explicit control. The typed diff stored in state is never altered.
- No issues found beyond ones fixed during the run: `IconBtn` takes `label`, not `title`, and a `FileCard` collapse caused a test mistake.

## Tests
| command | package | exit code | result |
|---|---|---|---|
| `pnpm exec vitest run 'src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/_components'` | client | 0 | 4 passed: AC-12 confirmation and 422 reason, undecided disabled with hint, null agent disabled, double-click sends one request |
| `pnpm exec vitest run '…/EvalsTab/helpers.test.ts'` | client | 0 | 6 passed |
| `pnpm exec vitest run '…/EvalsTab/_components/CaseEditor'` | client | 0 | 7 passed: AC-35, 38, 39, 40, 41, preview masking, save and close |
| `pnpm exec vitest run 'src/app/agents[id]'`, `'src/app/agents'`, `'src/app/repos'` | client | 0 | 48 files, 330 tests passed. Includes `CaseRow` (AC-43, AC-44), `EvalsTab` (AC-29 and the other EvalsTab rows), `AgentEditor`, `page` (`?tab=evals`) and all existing pulls tests including `page.hardening`. |
| `pnpm exec tsc --noEmit` | client | 0 | clean |

## Deviations from plan
- **Red-first order, steps 16–19:** I wrote each component and its test close together, and ran a test only after the code existed. The record shows the first run of the button test failing on test-side faults, not a failing run before the code. I have no red run to report.
- **AC-12 link:** `toast` takes a plain string, so the link cannot sit inside it. The button shows a success toast via the `notify` bridge (`@/lib/toast`) and also an inline `role="status"` line with the "Eval case added to {agent}" text and an "Open in Evals" link to `/agents/<id>?tab=evals&case=<id>`. A 422 shows the server message both as a toast and inline (`role="alert"`). I used `notify` instead of `useToast` because `useToast` throws without a provider, and it would break existing FindingsPanel and page tests.
- **Step 16 test files:** I added no eval messages or `QueryClientProvider` to the existing `FindingCard`, `FindingsPanel`, `ReviewRunAccordion`, `page.test` and `page.hardening.test` files. They pass unchanged because no finding is expanded with `evalAgent` set in them.
- **`@testing-library/user-event`:** it is not installed, and the plan does not name adding it, so the new tests use `fireEvent`.
- **Passed card:** `MetricStat` only formats percentages, so the fourth metric card (passed, e.g. "3/3") is a small local card in `EvalsTab`.
- **Cost column:** cost shows in the run-history table and the last-run panel, not as a fifth card.
- **No new i18n keys:** nothing was missing. The legacy `eval.evalsTab.*` keys (`emptyCases`, `loadingCases`, `metricsTitle`, `casesHeading`, `edit`, `delete`) are reused where they fit.

## Not done / blocked
- Nothing blocked. I did not exercise the run-all mutation against a real server (no e2e in this lane).

## Insight candidates
- client: `FileCard` auto-expands small diffs, so a test that clicks the file header to open it actually collapses it. A "masked until Reveal" assertion on collapsed lines passes vacuously.
- client: `useMutation.mutate` calls `mutationFn` asynchronously. A test must `waitFor` the mocked api call before asserting call counts.
- client: `IconBtn` takes `label` (it sets title and aria-label itself) and has no `disabled` prop. `Textarea` from `@devdigest/ui` forwards no `aria-label` or id, so label it with a wrapping `<label>` or use a raw `<textarea>`.

## Handoff to reviewers
- Surfaces and files touched (all under `client/src/app/`):
  - `repos/[repoId]/pulls/[number]/_components/FindingCard/**`, `FindingsPanel/FindingsPanel.tsx`, `ReviewRunAccordion/ReviewRunAccordion.tsx`
  - `agents/[id]/page.tsx`, `agents/[id]/page.test.tsx`
  - `agents/[id]/_components/AgentEditor/{AgentEditor.tsx,AgentEditor.test.tsx,constants.ts}`
  - `agents/[id]/_components/AgentEditor/_components/EvalsTab/**`
- architecture-reviewer: placement as in Self-review. No server or shared-contract changes in this lane.
- plan-verifier: tests are at the paths listed in the Tests table.
  - AC-12: `…/FindingCard/_components/TurnIntoEvalButton/TurnIntoEvalButton.test.tsx` ("AC-12 confirmation names the agent and links to its Evals tab; a 422 shows the reason").
  - AC-29: `…/EvalsTab/EvalsTab.test.tsx` ("AC-29 shows Running k/N then final metrics without reload").
  - AC-35, 38, 39, 40, 41: `…/CaseEditor/CaseEditor.test.tsx` (the AC-40 test is "AC-40 typing a diff renders the preview").
  - AC-43, 44: `…/CaseRow/CaseRow.test.tsx`.
  - AC-26's UI half is the "shows the server's reason when Run all evals is refused" test in `EvalsTab.test.tsx`.
- security-reviewer: the credential masking (`maskSecrets` and `MaskedText`) and text-only rendering are the surfaces to check.
- main session:
  - Run the client package gate (`pnpm typecheck`, `pnpm test`) on the combined tree after L7.
  - No typecheck errors seen outside my paths.
  - The e2e flow for `?tab=evals` and `?case=` is not covered here.
- No architecture, acceptance or security verdict is given here.

---

# Implementation Report (fix mode): lane 6, red-first proof by mutation
Status: done
Mode: fix (lane 6)

## What was done
Each Red-first row now has a recorded failing run and a restored green run. I applied one temporary break to production code per row, ran that test file, then restored the file from a backup copy. I changed no test and no production code. No test needed strengthening: every break failed its test. The script is at `/tmp/claude-503/mut/run.py`, so the runs can be repeated.

## Tests (red/green pairs)
Command for each pair: `pnpm exec vitest run <test file>`. Every red run exited 1, and every restored re-run exited 0.

| AC | break (production file) | failing test and assertion | red exit | green exit |
|---|---|---|---|---|
| AC-12 | `TurnIntoEvalButton.tsx`: confirmation built with `agent: ""` instead of the agent name | `TurnIntoEvalButton > AC-12 confirmation names the agent…`: "Unable to find an element with the text: /Eval case added to Security Reviewer/" | 1 | 0 |
| AC-29 | `EvalsTab.tsx`: `const running = false;` | `EvalsTab > AC-29 shows Running k/N…`: "Unable to find an element with the text: Running 1/3" | 1 | 0 |
| AC-35 | `CaseEditor.tsx`: `if (!runOnSave) return onClose();` replaced by an unconditional `return onClose();` | `CaseEditor > AC-35…`: "Unable to find an element with the text: Last run passed" | 1 | 0 |
| AC-38 | `CaseEditor.tsx`: `check.ok` dropped from `canSave` | `CaseEditor > AC-38…`: `expect(element).toBeDisabled()` | 1 | 0 |
| AC-39 | `EvalsTab/helpers.ts`: the `list.push(...)` skeleton line removed | `CaseEditor > AC-39…`: "expected [] to have a length of 1 but got +0" | 1 | 0 |
| AC-40 | `CaseEditor.tsx`: `<DiffViewer files={files} />` replaced by `{null}` | `CaseEditor > AC-40 typing a diff renders the preview`: "Unable to find an element with the text: src/config.ts". The masking test also failed. | 1 | 0 |
| AC-41 | `CaseEditor.tsx`: `warnings` forced to `[]` | `CaseEditor > AC-41…`: "Unable to find an element with the text: /src\/config\.ts:40-40/" | 1 | 0 |
| AC-43 | `CaseRow.tsx`: the source link condition forced to `false` | `CaseRow > AC-43…`: "Unable to find an accessible element with the role "link" and name "Created from PR #7"" | 1 | 0 |
| AC-44 (row) | `MaskedText.tsx`: `if (!found)` replaced by `if (true)` | `CaseRow > AC-44 sk_live_ masked until Reveal`: `expect(element).not.toBeInTheDocument()` | 1 | 0 |
| AC-44 (preview) | `CaseEditor.tsx`: `diffToPrFiles(diff)` instead of the masked diff | `CaseEditor > Preview masks credentials until Reveal…`: `expect(element).not.toBeInTheDocument()` | 1 | 0 |

## Final gate
- `pnpm exec vitest run src/app/agents src/app/repos` (client): exit 0, 48 files and 330 tests passed.
- `pnpm exec tsc --noEmit` (client): exit 0.
- `git diff --stat` for `client/` shows only the intended 8 modified files (29 insertions, 3 deletions). The new files are untracked: the `EvalsTab/` folder and the `TurnIntoEvalButton` folder, plus `src/app/eval/`, which is lane 7's.
- A grep for each mutation string in `src/app` found nothing, so no break was left behind.

## Deviations / Not done
None new. Earlier deviations stand, except that the red-first evidence gap is now closed by these mutation pairs. They show each test can fail for the right reason. They are not a run made before the code existed.

## Insight candidates
none

## Handoff to reviewers
- plan-verifier: red-first test paths are unchanged from the first report. The proof above is by mutation.
- main session: client package gate on the combined tree after L7.
- No architecture, acceptance or security verdict is given here.

---

# Implementation Report (fix mode): lane 6, finding PV-1
Status: done
Mode: fix

## Change
Only `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/CaseEditor/CaseEditor.test.tsx` changed. I added `within` to the RTL import. I rewrote the test "AC-40 typing a diff renders the preview".

- **Diff typed:** a hunk `@@ -10,6 +10,7 @@` with two context lines (`first`, `second`) and the added line `+  added(true)`.
- **Asserts after switching to the Preview tab:**
  - the file name `src/config.ts` renders;
  - the row holding `added(true)` contains the new-side line number `12` and the `+` sign;
  - the `second` context row contains no `+`, so the marker belongs to the added line only.

## Tests
All run in `client/` as `pnpm exec vitest run 'src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/CaseEditor'`.

| state | exit | result |
|---|---|---|
| new test, code as is | 0 | 7 passed |
| break A: `CaseEditor.tsx` renders `<DiffViewer files={[]} />` | 1 | AC-40 failed: "Unable to find an element with the text: src/config.ts". The masking test also failed. |
| break B: `CodeLine.tsx` line numbers dropped (`{""}` in place of `{ln.newNo ?? ln.oldNo ?? ""}`) | 1 | AC-40 failed: "Unable to find an element with the text: 12". This is the new assertion. The old test would have passed here. |
| both breaks restored | 0 | 7 passed |

- `pnpm exec tsc --noEmit` (client): exit 0.
- `git status` for `client/src/components` is empty, so the temporary break to the shared `CodeLine.tsx` is fully restored. The break to `CaseEditor.tsx` was restored from a backup copy.

## Not done / blocked
None.

## Insight candidates
none

## Handoff
- plan-verifier: re-check AC-40 at the same test path and name.
- No architecture, acceptance or security verdict is given here.

---

# Implementation Report (fix mode, round 1): lane 6, CR-1 / CR-7 / CR-8
Status: done
Mode: fix

## Changes (all inside lane-6 owned paths; no hook edited)
- **CR-1, `EvalsTab.tsx`:** a running suite is now found in the dashboard's `history`, not in `latest`.
  - `runningInHistory = dash.history.find(r => r.status === "running")`.
  - `activeSuiteId = startedId ?? runningInHistory?.id`, and `progress` and `running` also read from it.
  - Reload or navigation mid-suite now polls the suite and shows "Running k/N". Run all evals stays disabled while it runs, so there is no 409.
- **CR-7, `CaseRow.tsx` and `styles.ts`:**
  - Running is now only an explicit `running` status. It also covers the first poll still in flight, and a poll error ends it.
  - `start.error ?? run.error` shows in a `role="alert"` line inside the row.
  - Play re-enables after any error, and a new click clears the old run id.
- **CR-8, `CaseEditor.tsx`:** an effect with a ref guard calls `invalidateQueries(["eval-cases", agentId])` once when the case run reaches a terminal status.
- **Tests (strengthened or added, none weakened):**
  - `EvalsTab.test.tsx`: new "CR-1 resumes a suite that is running after a reload from the history, with Run all disabled". The AC-29 test now puts the running suite in `history` (the old mock only set `latest`, which cannot happen on the server). Both tests assert the `role="status"` banner, because the history table also prints the same "Running 1/3".
  - `CaseRow.test.tsx`: two new CR-7 tests (429 on start shows the reason and Play retries; a 404 on the case-run poll shows the reason, no "Running…", Play retries). The test now mocks `@/lib/api` and builds its `QueryClient` with `retry: false`.
  - `CaseEditor.test.tsx`: new "CR-8 refreshes the case list once when the Run on save run finishes". `renderEditor` takes an optional `QueryClient`.

## Tests (red/green pairs)
Each break was applied to the production file, one test file run, then the file restored from a backup copy. The script is `/tmp/claude-503/mut/run2.py`.

| break | test file run | red exit | failing assertion |
|---|---|---|---|
| CR-1: resume from `latest.status === "running"` again | `EvalsTab.test.tsx` | 1 | CR-1 test: `expected "spy" to be called with arguments: ['/eval-suite-runs/s1']`. The AC-29 test also failed. |
| CR-7a: `error` forced to null | `CaseRow.test.tsx` | 1 | both CR-7 tests: `Unable to find role="alert"` |
| CR-7b: poll error no longer ends running | `CaseRow.test.tsx` | 1 | poll-recovery test: `expect(element).not.toBeInTheDocument()` ("Running…" stays) |
| CR-8: the invalidate call removed | `CaseEditor.test.tsx` | 1 | CR-8 test: `expected 1 to be greater than or equal to 2` |

- With every file restored, each of those test files exits 0.
- One break did not fail a test: forcing `running` to false before the first suite poll returns (`suite.data ? … : false`). That fallback only covers the moment before the first poll answers, which the tests do not reach. I left the test as is and the fallback is unchanged.

## Final gate
- `pnpm exec vitest run src/app/agents src/app/repos` (client): exit 0, 48 files and 334 tests passed.
- `pnpm exec vitest run src/app/agents` (client): exit 0, 10 files and 62 tests passed.
- `pnpm exec tsc --noEmit` (client): exit 0.
- No leftover break is in the tree: grep of `CaseRow.tsx` shows `!run.isError` back in place, and `EvalsTab.tsx` has no `latest?.status` check.

## Not done / blocked
- The history-based resume in CR-1 relies on the server listing a running suite in the dashboard's `history`, as the coordinator stated. No hook change is needed from my side.

## Insight candidates
- client: the dashboard's `latest` is the latest completed run. A running suite is only visible in `history`, so resume-after-reload logic must read `history`.

## Handoff
- plan-verifier: red-first tests are in `EvalsTab.test.tsx` (CR-1), `CaseRow.test.tsx` (CR-7) and `CaseEditor.test.tsx` (CR-8).
- main session: the client gate on the combined tree. L5's changes to `hooks/eval.ts` were not touched or needed.
- No architecture, acceptance or security verdict is given here.

---

# Implementation Report (fix mode, round 2): lane 6, CR-18 / CR-8 / CR-15 / CR-11 / CR-13 / CR-19
Status: done
Mode: fix

## Changes (lane-6 paths only; no hook, L7 or server file touched)
- **CR-18 and CR-8, `CaseRow.tsx` and `CaseEditor.tsx`:**
  - Both now call `useCaseRun(runId, agentId)`. The duplicated refresh effects and the `useQueryClient` imports are gone.
  - `CaseEditor`'s `onClose` now receives `{caseId, caseRunId}` when a Run-on-save run is still going at close. The Modal close and Cancel both go through it.
  - `EvalsTab` keeps these in `pendingRuns` and passes `pendingRunId` to the matching `CaseRow`. The row then keeps polling that run, and the hook refreshes the list when it ends.
- **CR-15, `CaseRow.tsx`:** running ends only on a terminal status or `isCaseRunGone(error)`. A transient poll error, even after the hook's retries are used up, keeps "Running…" and keeps Play blocked. The reason shows (role=alert) only on a start error or a 404.
- **CR-11, CR-13, CR-19, `EvalsTab.tsx` and `helpers.ts`:**
  - A single sticky `trackedId` state. It is set on Run all, or adopted from a running suite in `history`.
  - The adopt step runs only once the tracked suite has settled, so a running suite from history wins over a finished started suite (CR-13). A refetch that stops listing the suite cannot drop the poll (CR-11).
  - A new pure `runningProgress` in `helpers.ts` (the idea copied from the L7 helper, nothing imported). It treats a tracked id with no response yet as "Running 0/N", which keeps Run all disabled (CR-19). It also ignores a stale history entry for a suite already seen finished.
- **Tests:** a new `runningProgress` test in `helpers.test.ts`; four new tests in `EvalsTab.test.tsx` (CR-11, CR-13, CR-19, CR-8 hand-up; `put` mocked, `renderTab` returns the `QueryClient`); one new test in `CaseRow.test.tsx` (CR-15).
- **Test strengthened:** my first CR-15 test asserted synchronously after the click, so it could not see the extra POST (the mutation fires asynchronously). It now waits through the hook's retries (about 3.5 s), checks "Running…" and no alert before clicking, then waits 50 ms and expects one POST.

## Tests (red/green pairs)
Each break was applied to the production file, one test file run, then the file restored from a backup copy. The script is `/tmp/claude-503/mut/run3.py`.

| break | test file | red exit | failing assertion |
|---|---|---|---|
| CR-11: `trackedId` no longer adopted from history (sticky state dropped) | `EvalsTab.test.tsx` | 1 | CR-11: `Unable to find an accessible element with the role "status"`. CR-13 also failed. |
| CR-13: `settled` is just `!trackedId` | `EvalsTab.test.tsx` | 1 | CR-13: `expected "spy" to be called with arguments: ['/eval-suite-runs/s2']` |
| CR-19: tracked-without-response branch removed from `runningProgress` | `EvalsTab.test.tsx` | 1 | CR-19: `Unable to find role="status"` |
| CR-8 hand-up: `close` always calls `onClose()` with nothing | `EvalsTab.test.tsx` | 1 | CR-8 test timed out at 5000 ms (the list never refreshes) |
| CR-8/18: `useCaseRun(runId)` without `agentId` in `CaseRow` | `EvalsTab.test.tsx` | 1 | same CR-8 timeout |
| CR-15: `!run.isError` added back to the polling condition | `CaseRow.test.tsx` | 1 | CR-15: `Unable to find an element with the text: Running…` |

- The first CR-15 run, before strengthening, exited 0 under its break, so I changed the test as described above.
- With all files restored, every test file exits 0.

## Final gate
- `pnpm exec vitest run src/app/agents src/app/repos` (client): exit 0, 48 files and 340 tests passed.
- `pnpm exec tsc --noEmit` (client): exit 0, the whole client typechecks.
- A grep for the break strings in `src/app/agents` found nothing, so no break is left in the tree.

## Not done / blocked
None.

## Insight candidates
- client: a test that asserts right after `fireEvent.click` on a react-query mutation cannot see the mutation's call, because `mutationFn` runs asynchronously. A "button stayed disabled" assertion needs a short wait or the check before the click.

## Handoff
- plan-verifier: red-first tests are in `EvalsTab.test.tsx` (CR-11, CR-13, CR-19, CR-8 hand-up), `CaseRow.test.tsx` (CR-15) and `helpers.test.ts` (`runningProgress`).
- No architecture, acceptance or security verdict is given here.