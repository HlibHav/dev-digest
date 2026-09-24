# Shared brief — finding a fixture where skills show real uplift

You are one of two analysts working in parallel for an orchestrator. Read this whole file,
then your own task (in your prompt). Stay inside your task.

## Background (verified in an earlier round)

DevDigest is a local-first AI PR reviewer (course repo). A reviewer *agent* = a system prompt
+ an ordered list of *skills* (markdown rule files). `reviewer-core/src/prompt.ts`
(`assemblePrompt`, `renderSkillsBlock`) builds `[system, user]` messages: the system message
is the agent's prompt + `INJECTION_GUARD`; the user message holds `## Skills / rules`, repo
map, callers, PR description and the diff. The call goes to OpenRouter,
`deepseek/deepseek-v4-flash`, temperature 0, `response_format: json_schema` strict
(`reviewer-core/src/llm/openrouter.ts:69`). A run "blocks" when it has a CRITICAL finding.

The homework brief expects control experiments to show **"misses without skills, catches
with skills"**. The existing fixtures failed that for a structural reason: they plant defects
the base model already knows (a 201→200 status change; a happy-path-only test), so the
no-skills baseline already catches them. 59% of the 56 rules in the seeded skills are general
knowledge; only a handful are facts a model cannot infer from a diff. A fixture can only show
uplift if its defect is a defect **because of a rule the model cannot know without the skill**.

Other facts you must respect:
- Provider matters. OpenRouter routes this model to ~15 providers. OpenInference pastes the
  JSON schema into the prompt and behaves worst; DeepInfra (no reasoning) and Parasail
  (reasoning) behave cleanly. Unpinned routing is not sticky. The app runs **unpinned**, so a
  demo fixture must hold on several providers, not one.
- Temperature 0 is not deterministic even on one provider. At n = 6, 5/6 and 6/6 are the
  same. Only large gaps count.
- Skills can veto each other: `semver-discipline`'s "Do not flag: an internal refactor … is a
  patch" suppresses findings on PRs framed as refactors. Do not frame a fixture as a refactor.
- A correct finding citing the wrong line (e.g. `start_line: 1`) is dropped by the app's
  grounding gate. Record the cited `file`/`start_line`/`end_line` of the defect finding and
  whether that line range intersects a diff hunk.

## Where things are

- Repo (read-only for you), tip of `feat/agent-skills`:
  `/Users/Glebazzz/Claude/PROJECTS/NEO/dev-digest/.claude/worktrees/h1-skill-size-hypothesis-7b81ce`
  `reviewer-core/node_modules` is installed; `npx tsx` works from `reviewer-core/`. Never read
  or search `server/clones/`. Previous round's reports:
  `docs/handoff/2026-09-21-skills-deep-analysis/` (README.md first).
- Scratchpad (put ALL your files here):
  `/private/tmp/claude-503/-Users-Glebazzz-Claude-PROJECTS-NEO-dev-digest--claude-worktrees-h1-skill-size-hypothesis-7b81ce/332e6705-8aa5-4861-8830-37c4c60b506d/scratchpad`
  - `h5.py` — working caller. `import h5; h5.OUT = '<your file>.jsonl'; h5.call(arm, provider_tag, {"system":…, "user":…})`
    sends one pinned request mirroring the app and appends a record (served_by, prompt/
    completion/reasoning tokens, cost, verdict, n_critical, titles, summary). Copy it to your
    own file if you need the full findings (it truncates titles/summary and drops file/lines).
  - `review_schema.json`, `endpoints.json` (provider tags), `prompt_no_skills.json` and
    `prompt_all5.json` (API Contract Reviewer on PR #8, exactly as the app sent them).
- Dev DB, **SELECT only**:
  `DB=$(grep -E '^DATABASE_URL=' /Users/Glebazzz/Claude/PROJECTS/NEO/dev-digest/.claude/worktrees/review-agent-skills-b833b9/server/.env | cut -d= -f2- | tr -d '"')`
  Tables: `agents(id,name,system_prompt,…)`, `skills(id,name,source,body,version,enabled)`,
  `agent_skills(agent_id,skill_id,"order")`, `agent_runs`, `run_traces(run_id, trace jsonb)`
  with `trace->'prompt_assembly'` = `{system, user, skills, memory, specs, callers, repo_map, pr_description}`,
  `reviews`, `findings`, `pull_requests(id, number, title)`.
  API Contract Reviewer `3291d6c0-241b-4d8d-9a14-fbf3d2f6bdb0` (skills: breaking-change,
  response-schema, semver-discipline, deprecation-policy[imported → `<untrusted>`], repo-conventions).
  Test Quality Reviewer `f3451435-c875-42f3-b115-7f9b29d7ff69` (skills: branch-coverage-gate, test-smells).

## Hard rules

1. No writes outside the scratchpad: no repo edits, no git operations that change anything,
   no `INSIGHTS.md` edits, no GitHub writes (no `gh pr create`, no pushes). Read-only `gh` is fine.
2. Dev DB: SELECT only. Never call the local API (`localhost:3201`) with POST/PUT/DELETE.
   Never run a review through the app. The DB is staged for a recorded demo.
3. Never print, echo or log the OpenRouter key or the `DATABASE_URL` value.
4. OpenRouter: always pinned `provider: {order: [tag], allow_fallbacks: false}`, temperature 0,
   max 3 concurrent requests, hard 150 s wall-clock timeout per call (use a thread/`signal`
   based deadline — `urlopen(timeout=)` only bounds each read), record timeouts and HTTP
   errors as rows. Providers: `deepinfra/fp8`, `parasail/fp8`, `open-inference/fp8`.
   Hard spend cap: **$0.30** per analyst.
5. Before any arm, prove your prompt construction: rebuild a prompt the app really sent and
   match its md5. No arm runs on an unverified construction.
6. Interleave arms and providers. Pre-registered reading per (arm, provider), n = 6:
   "catches" ≥ 5/6, "misses" ≤ 1/6, otherwise inconclusive.
7. For each call decide "defect found" by reading the finding titles and rationale (not by
   counting criticals): the finding must be about the planted defect. Report two rates:
   **found** (any severity) and **blocks** (a CRITICAL about the defect).
8. Separate what you verified from what you infer. A negative result is a result.
9. Budget: 150 tool calls or 45 minutes. If you hit it, stop, write
   `reports/<letter>-STATUS.md` (done / not done / how to resume) and report.

## Deliverable

`reports/<letter>-<slug>.md` in the scratchpad, English, complete sentences: answer first,
then a per-(arm, provider) table (n, found, blocks, verdicts, median prompt tokens, cited
lines and whether they intersect the diff), then what you did not check. Save every prompt
you sent as `prompt_<letter>_<arm>.json`. Reply with ≤ 300 words plus the report path.
