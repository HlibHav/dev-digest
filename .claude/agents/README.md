# Agents

This file maps the project's Claude Code subagents: who does what, with which permissions, and
which artifact moves between them. It doesn't repeat the prompts. Each agent's behaviour lives in
its own `.md` file, so read that file before you change the agent.

## The set at a glance

| Agent | Responsibility | Model | Permissions | Input | Output |
|---|---|---|---|---|---|
| [brainstorm](brainstorm.md) | Turns a rough idea into options before planning: classifies it (spike / bounded / architectural), writes back what was said and what is assumed, asks the one question that changes the design most, proposes two or three approaches, and returns a self-reviewed request whose every criterion names its proof | `opus` | Read-only: `Read, Grep, Glob` (no `Bash`, `Skill`, `Write` or web) | A rough idea | **Brainstorm Brief** (`ready` / `needs-answers`) |
| [spec-creator](spec-creator.md) | Specreator: picks the SDD tier (Direct / Lightweight / Full / Discovery-First, by the scorecard in `docs/sdd-cascade.md`), analyses the user's design sources and walks six clarification categories, returns blocking questions and research requests first (the main session runs one `researcher` per request in parallel), then writes a spec with a `SPEC-YYYY-MM-DD-<feature>` id, EARS acceptance criteria with proof tags and verification hints, non-functional requirements, input provenance, a seeded traceability table and a changelog, and ends with a final self-check | `opus` | `Read, Grep, Glob, Edit, Write`; no Bash, web or subagents; preloads `mermaid-diagram` and `security`. A PreToolUse hook (`agent-write-scope.py specs`) denies writes outside `<pkg>/specs/*.md` and root `specs/*.md` | A feature request or a Brainstorm Brief's request, plus design sources (screenshots, text, Figma export, code paths), or the answers to its questions, or a bug / change against an existing spec | **Spec Report** (`no-spec` / `needs-answers` / `needs-research` / `written` / `updated` / `no-change`) plus the spec file |
| [researcher](researcher.md) | Answers one concrete question from the repo or from external sources, with evidence and an explicit "not found" list | `sonnet` | Read-only in the repo (`Read, Grep, Glob`); `WebSearch`, `WebFetch`; NotebookLM create/add/query only (no delete, share or studio) | A question plus its scope (repo / external / both) and what it feeds | **Repo report** or **External report**, or clarifying questions |
| [implementation-planner](implementation-planner.md) | Turns an approved spec into an Implementation Plan that respects modules, skills, rules and `INSIGHTS.md`: verifies the requirements (restates each as a checkable `R1`, `R2`… linked to the spec), asks and recommends, traces every `AC-N` to steps and tests, and shapes the steps for the execution mode the user chose (parallel lanes with non-overlapping owned paths, or one linear pass). Writes no spec and never changes a criterion | `opus` | Read-only: `Read, Grep, Glob` (no `Skill`, `Bash`, `Write` or web) | An approved spec from spec-creator, or its no-spec intent for a Direct change, plus the execution mode the user chose (optionally a researcher report) | **Implementation Plan** (`Status: ready`) with verified requirements, open questions and recommendations, the spec's criteria verbatim, a traceability table, a `## Red-first` list, lanes (multi-agent) and test-first steps, saved by the main session as `docs/plans/YYYY-MM-DD-<feature>.md`; or questions (`needs-answers`), including the mode when the brief lacks it, that go back to spec-creator or to the user |
| [test-writer](test-writer.md) | Writes tests for BE and UI in two modes: red-first from a plan's acceptance criteria, or backfill for existing code | `sonnet` | `Read, Grep, Glob, Edit, Write, Bash, Skill`; hooks limit writes to test paths and Bash to the `test` profile; every test run inside `srt`; writes but doesn't run integration tests or e2e | A plan (red-first) or named files (backfill) | **Test Report**: criterion → test → evidence, plus test files in the working tree |
| [implementer](implementer.md) | Executes the plan in the backend and the UI, self-reviews how its own code is written, and runs targeted tests in a lane (typecheck plus the unit suite for a whole plan); fixes reviewer findings in fix mode | `sonnet` | `Read, Grep, Glob, Edit, Write, Bash, Skill`; preloads `onion-architecture`, `frontend-ui-architecture`; no commit, push, research or `INSIGHTS.md` write | Its lane's slice of an Implementation Plan with `Status: ready` (multi-agent), or reviewer findings (fix mode) | **Implementation Report** (`done` / `partial` / `blocked`) with insight candidates, plus uncommitted changes in the working tree |
| [architecture-reviewer](architecture-reviewer.md) | Checks a diff against the onion and client boundaries, runs `lint:boundaries` and the route test, reports what the lint can't see | `opus` | Read-only: `Read, Grep, Glob, Bash`; a hook limits Bash to the `architecture` profile; preloads both architecture skills | A target (`base..head`, branch or uncommitted tree) | **Architecture Review**: findings with severity, rule, `path:line` and evidence; `pass` / `fail` |
| [plan-verifier](plan-verifier.md) | Checks finished code against every plan item and traces every hunk back to the plan; no advice | `sonnet` | Read-only: `Read, Grep, Glob, Bash`; a hook limits Bash to the `verify` profile | A plan, a target, optionally the Test Report | **Plan Verification**: a verdict with evidence per item, unmapped changes; `verified` / `gaps` |
| [security-reviewer](security-reviewer.md) | Reviews a diff for security defects in the changed lines — workspace scoping, input validation, secrets, prompt injection into the review LLM, SSRF and path traversal, unsafe rendering, agent-hook holes — and never executes the code under review | `opus` | Read-only: `Read, Grep, Glob, Bash`; a hook limits Bash to the `security` profile (read-only git, `diff`, `gh pr view`; no test, lint or typecheck run); preloads `security` | A target (`base..head`, branch or uncommitted tree) | **Security Review**: attack surface, findings with severity, rule, `path:line`, evidence and exploit path; `pass` / `fail` |
| [doc-writer](doc-writer.md) | Documents implemented features and turns plans or other material into docs with Mermaid diagrams, in the right `docs/` or `specs/` section | `sonnet` | `Read, Grep, Glob, Edit, Write, Skill`, no Bash; a hook limits writes to docs paths; preloads `mermaid-diagram` | A subject plus material (plan, report, verified code) | **Documentation Report**: files, claim → `path:line`, index updates, ADR and insight candidates |

All ten are flat: none has the `Agent` tool, so none spawns subagents.

None of them can ask the user, because Claude Code removes `AskUserQuestion` from every subagent.
When the input is too vague to act on, each agent returns its questions to the calling session,
and that session asks the user.

None of them writes `INSIGHTS.md`. Each ends its report with **Insight candidates**, and the
main session records them once through the `engineering-insights` skill. The implementer used
to record them itself, but parallel lanes would write the same file at once
(`../decisions/2026-10-02-sdd-chain-token-and-review-order.md`).

## How they connect

```mermaid
flowchart LR
  Q[question] --> R[researcher] -- report --> S((main session))
  IDEA[rough idea] --> B[brainstorm] -- Brainstorm Brief --> S
  FEAT[feature + design sources] --> SC[spec-creator] -- Spec Report + spec file --> S
  S -- chosen approach as a request --> SC
  S -- spec-creator's research requests, one researcher each, in parallel --> R
  S -- researcher reports, answers mode --> SC
  SC -- approved spec or no-spec intent --> P[implementation-planner]
  S -- spec + execution mode --> P
  P -- Implementation Plan --> S
  S -. external facts .-> P
  P -- plan --> TW[test-writer]
  TW -- red tests + Test Report --> S
  S -- commit red tests + lane slice of the plan --> I[implementer]
  I -- Implementation Report --> S
  S -- package gate per DAG level --> S
  S -- plan + bundle path + checks already run --> PV[plan-verifier]
  I -- Implementation Report --> PV
  TW -- criterion → test map --> PV
  PV -- Plan Verification --> S
  S -- verified: bundle path + checks already run --> AR[architecture-reviewer]
  S -- verified: bundle path --> SR[security-reviewer]
  S -- verified: /code-review on the bundle --> S
  AR -- Architecture Review --> S
  SR -- Security Review --> S
  S -- findings, fix mode, at most 2 rounds --> I
  S -- plan + verified code --> DW[doc-writer]
```

The main session is the orchestrator. It passes each artifact on verbatim, because a subagent
sees no conversation history. The diff is the exception: it is never pasted into a brief. The
main session runs `.claude/scripts/review-bundle.sh <base>...<head> <out-dir>` once and passes
the path (see *Brief for reviewers*).

Review runs in two stages. **plan-verifier first**: it is the cheap completeness gate, and a
`gaps` verdict goes back to the implementer before any other review is spent on unfinished code.
It gains nothing from running later, because it marks other owners' checks `unverifiable` with
the owner named. **Then, in parallel**, on the same head: `architecture-reviewer`,
`security-reviewer` and the main session's `/code-review` (correctness bugs, which no agent in
this set looks for). All three are read-only and independent.

**Fix loop.** The main session hands the findings to the implementer in fix mode (each finding
with its `path:line`, plus the plan slice it concerns), reruns the package gate, and re-runs only
the reviewer whose findings were fixed, on the new head. At most two rounds; after that the
main session takes it to the user. A finding that says the plan or the spec is wrong goes back to
`implementation-planner` or `spec-creator`, not into a fix.

The red-first leg is required whenever the plan's `## Red-first` list names
criteria: the implementer blocks without a red-first commit, and plan-verifier marks those
criteria `partial` when the leg was skipped. Backfill after the implementer is for code that
already existed, not a substitute.

## Execution mode: multi-agent or single-agent

Before it runs `implementation-planner`, the main session asks the user with AskUserQuestion
whether the work runs multi-agent or single-agent, and passes the answer in the planner's brief.
The plan is shaped for that mode; a brief without a mode gets the question back with the
planner's recommendation (multi-agent for non-trivial work, single-agent for a small or tightly
coupled change). The main session saves the plan as `docs/plans/YYYY-MM-DD-<feature>.md`.

- **Multi-agent** runs the flow above with several implementers at once: one per lane of the
  plan's `## Lanes` table, started when the lanes it waits for (`after:`) are done. Owned paths
  never overlap between lanes that run together, and contracts come first as lane 0.
  - **Lane slice.** Each implementer's brief holds only its slice of the plan, copied verbatim:
    the header, *Constraints*, *Skills for the implementer*, its *Lanes* row, its steps, the
    *Red-first* rows they turn green and the *Contracts & data* items they touch, plus the
    plan's saved path. The whole plan went to every lane before, and at ~18k tokens it was
    re-sent on each of ~90 requests (profiled 2026-09-28).
  - **Package gate.** Lanes share one working tree, so a lane runs only targeted tests and
    judges typecheck on its own paths: a sibling lane may be mid-change, and lane 0 may end with
    a consumer's typecheck red. After every lane of a DAG level is done, the main session runs
    each touched package's typecheck and unit suite once and records the results for the
    *Checks already run* table.
- **Single-agent** runs the plan's one linear sequence in the main session alone, with no
  subagents: it writes and commits the red-first tests, executes the steps test-first, then
  runs the implementer checks and every check under *Checks for reviewers* itself.

## Spec and tests: one loop inside another

Spec-driven and test-driven development meet at the acceptance criteria. The spec says what must
be true; a red-first test is that same statement, executable and failing before any code exists.

1. **brainstorm** (only for a rough idea) classifies it (spike, bounded, architectural), writes
   back what was said and what it assumed, and hands spec-creator a self-reviewed request whose
   draft criteria carry a proof tag: `red-first unit`, `red-first integration`, `e2e` or
   `browser (main session)`.
2. **spec-creator** picks the tier from `docs/sdd-cascade.md`. Direct changes skip the spec and
   get a one-sentence intent; the others get a spec whose `AC-N` criteria are EARS statements
   with proof tags. The user approves it.
3. **implementation-planner** works from the approved spec (Status `approved`, no open
   `[NEEDS CLARIFICATION]`) and the execution mode the user chose. It restates every requirement
   as a checkable `R1`, `R2`… linked to the spec, copies the `AC-N` lines and their tags
   verbatim, sends any fix back to spec-creator instead of rewriting them, and lists the
   red-first criteria under `## Red-first`. Each step is a test-first cycle: which red tests it
   turns green, which unit tests the implementer writes first, what it consumes and produces,
   and the command that proves it.
4. **test-writer** (outer loop) turns the `## Red-first` list into failing tests and proves each
   fails for the right reason; the main session commits them.
5. **implementer** (inner loop; one per lane in multi-agent mode) writes its own unit tests
   first for internals, then the smallest code that turns everything green, without touching
   the red tests.
6. **plan-verifier** traces criterion → test → code both ways and diffs the red tests against
   the red-first commit.

When a test and the spec disagree, the spec is corrected first and the test follows it; nobody
edits a test to fit the code. What no test can state (layout, colour) is tagged `browser` and
checked by the main session, so it is visible in the plan rather than silently untested.


## Who owns which check

The implementation planner writes each check under *Checks for reviewers* with its owner, and the
implementer's **Handoff to reviewers** repeats that split.

| Check | Owner |
|---|---|
| targeted runs of a lane's own and red-first tests; typecheck judged on its owned paths | implementer (lane) |
| typecheck and the existing unit tests of each touched package | main session, once per DAG level (multi-agent); implementer for a whole plan; the main session itself in single-agent mode |
| correctness bugs (`/code-review` on the bundle) | main session, in parallel with the two reviewers |
| `pnpm lint:boundaries`, the onion-architecture step 9 report, `route-adapter-calls.test.ts` | architecture-reviewer |
| acceptance verification | plan-verifier |
| integration tests (`*.it.test.ts`, Docker) as a review check | plan-verifier, after the main session has read test-writer's new ones |
| red-first run of test-writer's integration tests | main session (Docker can't run inside test-writer's sandbox) |
| unchanged red-first tests | plan-verifier |
| e2e (`npm run e2e:hermetic`) | main session: it rebuilds `client/.next` and breaks a running dev server (`e2e/INSIGHTS.md`), and its ports live in `CLAUDE.local.md` |
| `pr-self-review` | main session: it writes a verdict artifact |
| security review, including the agent hooks | security-reviewer (read-only, never executes the diff); `/security-review` stays available to the main session |

## Brief for reviewers

A reviewer's brief carries the target and everything already known about it, so the agent
spends its turns on judgment, not on re-deriving facts the main session has. Every reviewer gets
the first three items; plan-verifier gets the fourth as well.

1. **Target:** `<base>...<head>` and the head sha.
2. **Bundle:** the absolute path `review-bundle.sh` wrote for that range.
3. **Checks already run:** every check the main session or an earlier agent ran on that head.

   | check | command | head sha | result line |
   |---|---|---|---|
   | server unit | `pnpm --dir server exec vitest run --exclude '**/*.it.test.ts'` | `abc1234` | `Tests 271 passed (271)` |
   | lint:boundaries | `pnpm --dir server lint:boundaries` | `abc1234` | `no dependency violations found` / `34 known violations ignored` |

   A row whose sha equals the target's head is evidence: the reader quotes it in its own
   Checks table with `brief` in the exit column and does not run the command again. A row with
   another sha, or a check with no row, is run as before.
4. **plan-verifier only:** the full plan, the Implementation Reports and the Test Report's
   **Tests** table when there is one.

What this saved, measured on the intent-layer PR (2026-09-26): plan-verifier had re-run three
typechecks and four unit suites the main session had just run, ~8 turns and 5 minutes; the two
reviewers had sliced the same diff 28 times.

Scope splits that are easy to get wrong:
- **researcher vs. implementation-planner.** The planner doesn't browse. When a plan needs
  external facts, the planner lists them under *Risks*, and the caller runs `researcher`.
- **test-writer vs. implementer.** The test-writer writes only tests, and the implementer only
  code. Red-first tests are read-only for the implementer, so neither can grade its own work.
- **architecture-reviewer vs. pr-self-review.** The reviewer covers the two architecture skills
  in depth and runs their checks. `pr-self-review` routes the whole diff to every skill and gates
  `gh pr create`.
- **plan-verifier vs. the global `validator`.** The validator checks a one-line definition of
  done and suggests fixes. plan-verifier requires a plan, traces it in both directions and gives
  no advice.
- **doc-writer vs. ADRs and INSIGHTS.** doc-writer describes what exists. Why a choice was made
  goes to an ADR in `../decisions/`, and a trap worth remembering goes to `INSIGHTS.md`. The main
  session writes both from the report's candidates.

## How the limits are enforced

Four mechanisms. The hooks live in `.claude/hooks/`, the sandbox in `.claude/sandbox/`. All but
one step of the audit are wired from agent frontmatter, so they apply to these agents and
nothing else:

- `agent-bash-allowlist.py <architecture | verify | test | security>` splits the command into words itself
  and allows it only when those words form one of the listed shapes. It refuses every character
  the shell would expand or interpret (braces, `$`, globs, `\`, double quotes, pipes), so the
  program receives exactly the words that were checked; literal arguments go in single quotes.
  A `;` or `&&` chain is split into segments, each judged on its own, and handed to the shell
  joined with `&&`; a bare `[`/`]` path is re-emitted single-quoted. Both go through the hook's
  `updatedInput`, so a denial no longer costs a turn (a 2026-09-26 profile counted 7 such turns
  in one plan-verifier run). Git long options are matched with git's abbreviation rule, and
  `--dir` / `--prefix` must be a package of this repo or one of its worktrees, never a directory
  under `server/clones/`. The `verify` profile also reads PR bodies (`gh pr view … --json`),
  `docker info` and a plain `diff`. The `security` profile allows only read-only git, `diff` and
  `gh pr view`: no test, lint or typecheck run, because those load scripts and configs from the
  very diff under review. Each agent's **Commands you may run** section lists the
  allowed forms.
- `agent-write-scope.py <tests | docs>` resolves the target path against `$CLAUDE_PROJECT_DIR`
  and allows only the profile's paths. `tests` also denies adding `.skip`/`.only`/`.todo` and
  removing `it(`/`test(`/`expect(` calls from an existing file, and it keeps test-writer out of
  `server/test/helpers/` and out of any path with `.it.test` before the file suffix, because
  the unsandboxed integration suite imports the helpers and selects files by that substring.
  `docs` denies `INSIGHTS.md`,
  `CLAUDE.md`, `AGENTS.md`, the root README, `docs/skills/**` and the product prompts.
- `.claude/sandbox/run-tests.sh` runs every command that executes repo code — tests, and
  `lint:boundaries`, whose config is JavaScript — inside Anthropic's `srt`
  (`@anthropic-ai/sandbox-runtime`, `npm install -g`). The process may write only to a fresh temp
  dir, vitest's results cache (`node_modules/.vite/vitest`, data only; vite's dependency cache,
  which is code, stays read-only) and vite's config temp files (`test-run.srt.json`), and gets no network and
  no Unix sockets. That is what stops a test from writing where the write-scope hook can't see:
  a test is code, and `fs.writeFileSync` or `child_process` inside it never passes through
  Write/Edit. The allowlist refuses those runs without the wrapper. srt can't start inside
  another macOS sandbox, so in a session whose Bash is sandboxed the agent runs the wrapped
  command with `dangerouslyDisableSandbox`, which the allowlist accepts for wrapped commands only.
- `agent-write-audit.py <tests | docs | none>` records `git status` plus content hashes on the
  agent's first tool call and compares at SubagentStop, writing the result to the git dir. A
  PostToolUse hook on the `Agent` tool, registered in `.claude/settings.json` (profile
  `report`), hands any problem to the main session as `additionalContext`: a changed file
  outside the profile's paths, a moved HEAD, or an audited agent whose audit never ran (its
  definition was loaded before its hooks existed). A background call returns at launch, before
  any result exists, so it leaves a marker and a `UserPromptSubmit` hook (also in
  `settings.json`) reports when the agent's completion notification arrives. A SubagentStop
  `systemMessage` would not do:
  it lands in the subagent's own transcript. The audit catches what the other mechanisms miss
  inside the repo; it can't see writes outside it.

The hooks deny with JSON (`permissionDecision: "deny"`) and exit 0, and fail closed: any error
inside a hook is a deny (the audit instead reports that it could not check). Regression tests,
including the bypasses found in the 2026-09-24 security review, run with
`python3 -m unittest discover -s .claude/hooks/tests`.

**spec-creator's write limit is a hook (Glib, 2026-10-02).** It started with the limit in its
prompt only (`../decisions/2026-10-01-spec-creator-agent.md`); `agent-write-scope.py specs` now
denies any write outside `<pkg>/specs/*.md` and root `specs/*.md`, and the prompt still states the
limit. It has no write audit: its only writes go through Write/Edit, which the hook sees.

**What stays open, deliberately.** Integration tests (`*.it.test.ts`) need Docker, and Docker
access escapes any sandbox (a container can mount the host). So test-writer writes them but
doesn't run them, and the main session reads every file test-writer added or changed before
anything runs with Docker: its own red-first run, or plan-verifier's integration suite, which
runs only when the brief says that reading happened, and only in this checkout (the allowlist
refuses another worktree's `server` for it). Because test-writer can't write shared helpers or
`.it.test` paths other than `*.it.test.ts`, the files that suite runs from test-writer are
exactly its `*.it.test.ts` files and whatever test files those import.

None of this relies on `permissionMode`, because the main session's `bypassPermissions`,
`acceptEdits` and `auto` modes override a subagent's `permissionMode`. Test a hook by piping a
PreToolUse JSON into it:

```sh
echo '{"tool_name":"Bash","tool_input":{"command":"rm x"}}' | .claude/hooks/agent-bash-allowlist.py architecture
```

## Shared contract: which skills govern which paths

The implementation planner, the implementer and the test-writer read the surface→skill routing table
in step 3 of [`../skills/pr-self-review/SKILL.md`](../skills/pr-self-review/SKILL.md). They read it
with Read and never invoke the skill, because invoking it runs the review. The architecture-reviewer
cites severities from step 5 of the same file.

The implementation planner writes the skills into every step. The implementer invokes each named
skill, or explains the skip under *Deviations*. The test-writer loads only the routed skills that
carry test rules. Change that table and you change four agents.

## Where their rules come from

**researcher** follows the NotebookLM research gate from Glib's global rules
(`~/.claude/rules/research-gate.md`): existing notebooks first, `research_import` before
querying, and the fast/deep mode rules stated in its file.

**brainstorm** follows the `brainstorming` skill of [obra/superpowers](https://github.com/obra/superpowers)
(MIT; the course ships an older copy on `demo/security-review-fixture`) adapted to a subagent:
path classification (spike / bounded / architectural), the understanding split into said and
assumed, and the spec self-review of its `spec-document-reviewer-prompt.md`, plus the parts the
course copy already had: understand the project first, one question at a time with multiple-choice options, at least two
approaches with trade-offs, YAGNI, design before code. A subagent can't hold the conversation, so
it returns one question and the main session relays it.

**security-reviewer** preloads the `security` skill (OWASP Top 10:2025) and grades with the
critical list in step 5 of `pr-self-review`. It is the only reviewer that runs no code at all:
tests, lint and typecheck all load scripts or configs from the diff under review, so for a
reviewer looking for malicious or unsafe changes they are attacker-controlled input. The same
reasoning is why the other agents' code runs go through the `srt` wrapper.

The other agents rest on these sources, checked on 2026-09-24:

| Source | Rule taken | Applied in |
|---|---|---|
| [Claude Code — Subagents](https://code.claude.com/docs/en/sub-agents) | Omitting `tools` inherits everything; `disallowedTools` is applied first | Explicit `tools` and `disallowedTools` in every agent |
| same | `AskUserQuestion` is always removed from subagents | The gate that returns `needs-answers` / `blocked` |
| same | `skills:` injects full skill bodies; others stay reachable through `Skill` | Preloads in implementer, architecture-reviewer, doc-writer |
| same | A subagent inherits no history, invoked skills or permission approvals; it does get CLAUDE.md and CLAUDE.local.md | Self-contained plans and reports; every agent re-reads `INSIGHTS.md` itself |
| same | The main session's permission mode overrides a subagent's `permissionMode`; frontmatter hooks (`PreToolUse`) apply to the subagent | The two hooks instead of `permissionMode: plan` |
| same | `description` drives delegation; `maxTurns` bounds a run | Every description says when not to use the agent and names its neighbour |
| [Claude Code — Sandboxing](https://code.claude.com/docs/en/sandboxing) | Subagents share the session's sandbox config (no per-agent sandbox); access to `docker.sock` is effectively a sandbox escape; the primitives ship as `@anthropic-ai/sandbox-runtime` | A per-command `srt` wrapper for test and lint runs; integration tests leave the sandbox only after the main session reads them |
| [anthropics/sandbox-runtime](https://github.com/anthropics/sandbox-runtime) | `srt --settings <file> <cmd>`; writes and network denied unless listed; Seatbelt on macOS; beta | `.claude/sandbox/run-tests.sh` and `test-run.srt.json` |
| [Claude Code — Hooks](https://code.claude.com/docs/en/hooks) | Hooks inside a subagent get `agent_id`; a frontmatter `Stop` hook becomes `SubagentStop`; PostToolUse `additionalContext` reaches the model (live check: a SubagentStop `systemMessage` stays in the subagent's transcript) | `agent-write-audit.py`'s per-agent baseline, result file and PostToolUse(Agent) report |
| [Claude Code — Skills](https://code.claude.com/docs/en/skills) | Progressive disclosure: a skill body loads only when it's used | Only what each agent needs is preloaded |
| [Claude Code — Best practices](https://code.claude.com/docs/en/best-practices) | Explore → Plan → Implement → Commit; "if you could describe the diff in one sentence, skip the plan" | A read-only implementation planner; the implementer never commits |
| same | "Have one Claude write tests, then another write code to pass them"; "write a failing test that reproduces the issue, then fix it" | test-writer's red-first mode; red tests read-only for the implementer |
| same | Review in a fresh context; tell a reviewer to flag only gaps against correctness or the stated requirements | Separate reviewers; plan-verifier's template has no advice section |
| [Anthropic — Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) | Start with the simplest thing; orchestrator–workers | Flat agents; the main session orchestrates; the routing table is reused, not re-created |
| [obra/superpowers](https://github.com/obra/superpowers) `brainstorming` (MIT) | Classify the request and scale the process; write back said vs. assumed; approval gates; spec self-review for completeness, consistency, clarity, scope, YAGNI | brainstorm's steps 1, 2 and 6 |
| obra/superpowers `writing-plans` | Each task is a test-first cycle with exact interfaces and a verification command; self-review for coverage, type consistency, placeholders and proportion; a review-focus list of uncovered failure modes | implementation-planner's step format, `## Red-first`, `## Review focus` and step 5 |
| obra/superpowers `test-driven-development` | No production code without a failing test first; watch it fail | implementer's inner loop; test-writer's red-first |
| [GitHub spec-kit](https://github.com/github/spec-kit) | spec → plan → tasks → implement, with acceptance criteria per task; `/analyze` reports coverage per requirement with severity | The plan's *Acceptance criteria*; plan-verifier's per-item table |
| [ISO/IEC/IEEE 29148:2018](https://www.iso.org/standard/72089.html) | Traceability in both directions | plan-verifier's reverse map (**Unmapped changes**) |
| [Anthropic — Define success criteria](https://docs.anthropic.com/en/docs/test-and-evaluate/define-success) | Specific, measurable criteria; grade per criterion, reason before the verdict | plan-verifier's discrete verdicts with evidence |
| [anthropics code-review plugin](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-review/commands/code-review.md) | Cite lines; drop low-confidence findings; don't repeat what linters catch; "no issues" is a valid result | architecture-reviewer's `verified` / `plausible` marker and its relation to `lint:boundaries` |
| [Building Evolutionary Architectures](https://www.thoughtworks.com/radar/techniques/architectural-fitness-function) (Ford, Parsons, Kua) | Protect architecture with automated fitness functions | `lint:boundaries` and the route test stay the gate; the reviewer covers what they can't express |
| [dependency-cruiser rules](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) | Rules match static import edges | The reviewer's list of what lint can't see (container calls, placement) |
| [Claude 3.7 Sonnet](https://www.anthropic.com/claude-3-7-sonnet-system-card) and [Claude 4](https://www.anthropic.com/claude-4-system-card) system cards | Models may special-case tests to make them pass | test-writer's no-weakening limits and the `tests` hook |
| [TestGen-LLM at Meta](https://arxiv.org/abs/2402.09171) (FSE 2024) | Keep a generated test only if it builds and passes reliably across repeated runs | Backfill's five green runs |
| [Mutation-guided test generation at Meta](https://arxiv.org/abs/2501.12862) | Coverage alone doesn't show a test can fail; mutants do | Backfill's named mutant per test |
| [Testing Library — Guiding principles](https://testing-library.com/docs/guiding-principles), [query priority](https://testing-library.com/docs/queries/about#priority) | Test the way the software is used; `getByRole` first, `getByTestId` last; `userEvent` | test-writer's client rules |
| [Kent C. Dodds — Testing implementation details](https://kentcdodds.com/blog/testing-implementation-details) | Implementation-detail tests break on refactor and miss bugs | Assert what the user sees |
| [Vitest — Mocking](https://vitest.dev/guide/mocking) | Mock at boundaries; restore mocks between tests | test-writer's server rules |
| [Diátaxis](https://diataxis.fr/) | Four kinds of docs by user need; apply iteratively | doc-writer's tie-breaker, not a new structure |
| [Write the Docs — Docs as code](https://www.writethedocs.org/guide/docs-as-code/) | Docs live in the repo and go through review | Docs written into package `docs/` in the same PR |
| [Nygard — Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) | An ADR records one decision and doesn't change; feature docs describe the current state | ADR candidates go to the main session |
| [Google style — Timeless documentation](https://developers.google.com/style/timeless-documentation) | Document the current state; no "new" or "now" | doc-writer's wording rule |
| [C4 model](https://c4model.com/), [Mermaid on GitHub](https://github.blog/developer-skills/github/include-diagrams-markdown-files-mermaid/) | Context and Container levels carry most value; Mermaid renders natively and diffs as text | doc-writer's diagram rule |
| EARS — Mavin, Wilkinson, Harwood, Novak (Rolls-Royce), IEEE RE'09 | Five requirement patterns that separate condition from response | spec-creator's acceptance criteria |
| [Morris — Humans and agents](https://martinfowler.com/articles/exploring-gen-ai/humans-and-agents.html) | Humans on the loop: improve the harness, not each artifact | The tiered cascade in `docs/sdd-cascade.md` |
| [InfoQ — Enterprise SDD](https://www.infoq.com/articles/enterprise-spec-driven-development/) (SpecOps) | Fix a wrong spec before the code; one bug, one lesson in the spec | spec-creator's update mode |

Judgement calls that are **not** from these sources:
- the model split (Opus brainstorms, plans and reviews architecture and security; Sonnet
  executes, writes tests, verifies and documents);
- re-reading the plan's Constraints before each step (a goal-drift guard);
- limiting the implementer's self-review to code writing plus the existing tests;
- the 150-call budget and the stop after two failed attempts;
- five green runs and a named mutant instead of running a mutation tool;
- the fail-closed allowlists and the ban on shell metacharacters;
- integration tests owned by plan-verifier, e2e by the main session;
- the `verified` / `plausible` marker instead of a 0–100 confidence score;
- reviewers and writers report insight candidates instead of recording them.

Repo rules the agents follow come from the root and package `CLAUDE.md` files,
`.claude/rules/*.md`, and the skills in `.claude/skills/`.

## Adding or changing an agent

- Keep the shape the existing files share: frontmatter, then hard limits, gate, procedure, and
  output template.
- Give `tools` explicitly, and `disallowedTools` for what must never be reachable.
- An agent that must not write gets no `Edit`/`Write`. An agent that runs Bash gets a profile in
  `agent-bash-allowlist.py`, and its prompt lists the exact command forms.
- Add the agent to the table at the top of this file and to the check-ownership table. If its
  input or output feeds another agent, update the diagram too.
