# Lane brief (plan slice, verbatim)

# Implementation Plan: Eval Pipeline (regression cases from findings, suite runs, code-only scoring, dashboards)
Status: ready
Spec: specs/2026-10-10-eval-pipeline.md (SPEC-2026-10-10-eval-pipeline, approved by Glib 2026-10-10; proof tags updated in 3f6b113)
Execution mode: multi-agent, chosen by the user. Lanes run as sonnet implementers (`.claude/agents/README.md` table).
Save as: docs/plans/2026-10-10-eval-pipeline.md
Architecture decisions: `/Users/Glebazzz/Claude/PROJECTS/NEO/decisions/2026-10-10-eval-suite-runs-table.md` (Accepted, with Follow-up and Follow-up 2, both accepted by Glib)
reviewer-core: unchanged. `reviewPullRequest` already returns grounded findings, `dropped` with reasons, and `costUsd` (`reviewer-core/src/review/run.ts:103-121`), which is everything AC-14, AC-15 and AC-24 need.


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


## Lanes (this lane's row)
| lane | steps | owned paths | after |
|---|---|---|---|
| 6 | 16, 17, 18, 19 | `client/src/app/agents/[id]/page.tsx`, `client/src/app/agents/[id]/page.test.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`, `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/**`, `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/**`, `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/**`, `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/**`, `client/src/app/repos/[repoId]/pulls/[number]/page.test.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/page.hardening.test.tsx` | 5 |

## Steps (this lane)
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


## Red-first rows this lane turns green
- AC-12 (unit) → `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/_components/TurnIntoEvalButton/TurnIntoEvalButton.test.tsx` — "AC-12 confirmation names the agent and links to its Evals tab; a 422 shows the reason" (L6)
- AC-29 (unit) → `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.test.tsx` "AC-29 shows Running k/N then final metrics without reload" (L6) and `client/src/app/eval/[agentId]/_components/AgentEvalDashboardView/AgentEvalDashboardView.test.tsx` "AC-29 …" (L7)
- AC-35, 38, 39, 41 → `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/CaseEditor/CaseEditor.test.tsx` — "AC-n …" (L6)
- AC-43 (unit), AC-44 → `.../EvalsTab/_components/CaseRow/CaseRow.test.tsx` — "AC-43 Created from PR #N links to the PR page", "AC-44 sk_live_ masked until Reveal" (L6)

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


## Acceptance criteria these steps trace to (verbatim)
- AC-12 WHEN a case is created from a finding, the client shall confirm it with a message naming the agent and a link to the case on that agent's Evals tab. IF creation fails, THEN it shall show the server's reason. — proof: red-first integration + red-first unit
- AC-29 WHILE a suite run is in progress, the system shall report cases done out of cases total on the suite-run read route, and the Evals tab and the per-agent dashboard shall poll it and show "Running k/N" until it ends. — proof: red-first integration + red-first unit
- AC-35 WHERE "Run on save" is switched on in the Case Editor, the system shall run the case right after a successful save and show the result in the editor's last-run panel. — proof: red-first unit
- AC-38 WHEN the user saves a case in the Case Editor, the system shall require a name, a diff and an expected-output list that is valid JSON and matches the expectation shape of AC-1. The editor shows "valid JSON" or the first shape error inline and blocks save until it is valid. — proof: red-first unit
- AC-39 WHEN the user activates "Finding skeleton" in the Case Editor, the system shall append one `must_find` expectation template with empty file and line fields to the expected-output list. — proof: red-first unit
- AC-41 IF an expectation's line range does not intersect any hunk of the case diff for that file, THEN the Case Editor shall warn "This expectation can never be matched" next to it, without blocking save. — proof: red-first unit
- AC-43 WHEN a case was created from a finding, the system shall show "Created from PR #N" on the case, linking to that PR. — proof: red-first integration + red-first unit
- AC-44 WHILE a case diff, PR meta or stored finding contains a string shaped like a credential (for example `sk_live_`, `ghp_`, `AKIA`, or a `-----BEGIN … PRIVATE KEY-----` block), the system shall mask it in the case list, the editor preview and run detail, behind an explicit reveal control. The stored value stays as is. — proof: red-first unit
