# Shared brief — why DevDigest reviewer "skills" don't work as designed

You are one of four analysts working in parallel for an orchestrator. Read this whole file
first. Your own task is in the prompt you were given. Stay inside it.

## The product, in three sentences

DevDigest is a local-first AI PR reviewer (course repo). A reviewer *agent* has a system
prompt and an ordered list of *skills* (markdown rule files). At review time
`reviewer-core/src/prompt.ts` (`renderSkillsBlock`, `assemblePrompt`) puts the skills under
`## Skills / rules` in the user message, followed by repo map, PR description and the diff,
and asks an LLM (OpenRouter, `deepseek/deepseek-v4-flash`, temperature 0) for a JSON `Review`
(`verdict, summary, score, findings[]`) via `response_format: json_schema` strict
(`reviewer-core/src/llm/openrouter.ts:69`).

## The intended behaviour, and what happens instead

Homework expectation: a reviewer **misses** a defect without skills and **catches** it with
them. Fixture PR #8: `POST /agents` changes `reply.status(201)` to 200, buried in a refactor
whose description says the handler "answers 200 like the rest of the module". Agent: API
Contract Reviewer, five skills in this order: `breaking-change`, `response-schema`,
`semver-discipline`, `deprecation-policy` (imported → rendered inside `<untrusted>`),
`repo-conventions`.

Measured so far (2026-09-21). "Caught" = at least one CRITICAL finding about the status code.

| Prompt (byte-identical, taken from run traces) | Pinned to OpenInference | Other 9 providers |
|---|---|---|
| no skills | 5/6 | blocks in the app (4/4) |
| `breaking-change` alone | 5/6 | blocks |
| + one neutral sentence / + 1997 chars neutral prose / + `repo-conventions` | 6/6 each | blocks |
| all five | **0/6** | 10/11 (one call each; Alibaba missed) |

- OpenInference is the only provider that reports 7186 `prompt_tokens` for the all-five prompt
  (others 5854–5856) and it spends 0 reasoning tokens. DeepInfra and DigitalOcean also spent 0
  reasoning tokens and caught it (n=1 each). The +1332 tokens ≈ the size of the `Review` JSON
  schema (3942 chars) — *inferred*: OpenInference may emulate `json_schema` by pasting the
  schema into the prompt.
- Unpinned OpenRouter routing is not sticky; 2 of 4 unpinned calls landed on OpenInference. The
  client sends no `provider` preference and records no provider.
- Temperature 0 is NOT deterministic, even on one pinned provider (same prompt: 5 ×
  request_changes, 1 × approve). At n=6 you cannot tell 5/6 from 6/6. Only large gaps count.
- Note: the baseline (no skills) already catches this fixture. So PR #8 has no headroom for
  "misses without, catches with" — skills can only be neutral or harmful on it.
- Known embedding defects (confirmed by reading code, not proven causal): (1) skill bodies
  carry `#`/`##` headings that collide with the prompt's own `##` sections, no boundary between
  skills; (2) an imported skill is wrapped in `<untrusted>` while `INJECTION_GUARD` says
  untrusted text is data, never instructions; (3) every skill ends with a `## Do not flag`
  section, and `semver-discipline` says an internal refactor is a patch.

Full history: `docs/handoff/2026-09-21-skills-dilution.md` in the repo (read the sections
"H1 probe" and "H5 result"). Also read `reviewer-core/INSIGHTS.md` (short).

## Where things are

- Repo (read-only for you), at the tip of `feat/agent-skills`:
  `/Users/Glebazzz/Claude/PROJECTS/NEO/dev-digest/.claude/worktrees/h1-skill-size-hypothesis-7b81ce`
  `reviewer-core/node_modules` is installed there, so `npx tsx` works from `reviewer-core/`.
  Never read or search `server/clones/`.
- Scratchpad (your working dir for ALL files you create):
  `/private/tmp/claude-503/-Users-Glebazzz-Claude-PROJECTS-NEO-dev-digest--claude-worktrees-h1-skill-size-hypothesis-7b81ce/1ebd9edd-72b0-473c-af07-2d2829d4f89f/scratchpad`
  Already there:
  - `prompt_all5.json`, `prompt_bc_alone.json`, `prompt_no_skills.json`, `prompt_neutral_full.json`,
    `prompt_neutral_tiny.json`, `prompt_bc_rc.json` — each `{"system": …, "user": …}`, the exact
    text the app sent. `prompt_all5.json` user md5 = `efe2022466b3f37b599e4cb3147db454`.
  - `review_schema.json` — the JSON schema sent as `response_format`.
  - `endpoints.json` — OpenRouter's provider list for the model (`tag` is what you pin).
  - `h5.py` — working caller. `call(arm, provider_tag, prompt_dict)` sends one request that
    mirrors the app and appends a record to `h5.OUT`. Importing it is safe. Copy it to your own
    file if you need to change the request body. **Set your own output file**; do not append to
    `h5_results.jsonl`.
  - `h5_results.jsonl` — the 55 calls behind the table above (read-only for you).
  - `run_arm.sh` — **DO NOT RUN.** It relinks skills in the dev DB.
- Dev DB (Postgres, **read-only: SELECT only**). Connection string:
  `DB=$(grep -E '^DATABASE_URL=' /Users/Glebazzz/Claude/PROJECTS/NEO/dev-digest/.claude/worktrees/review-agent-skills-b833b9/server/.env | cut -d= -f2- | tr -d '"')`
  then `psql "$DB" -X -A -t -c "…"`. Useful: `skills(id,name,source,body,version)`,
  `skill_versions`, `agent_skills(agent_id,skill_id,"order")`, `agents`, `agent_runs`
  (`pr_id, agent_id, blockers, score, findings_count, tokens_in, tokens_out, ran_at`),
  `run_traces(run_id, trace jsonb)` with `trace->'prompt_assembly'->>'user'|'system'|'skills_tokens'`
  and `trace->>'raw_output'`, `reviews(run_id, verdict, summary)`, `findings(review_id, severity, title, rationale)`.
  API Contract Reviewer agent id `3291d6c0-241b-4d8d-9a14-fbf3d2f6bdb0`; fixture PR #8 id
  `c2a14ddb-7637-4159-a690-d3ca1fea7fa4`.

## Hard rules

1. No writes outside the scratchpad. No repo edits, no git commits, no `INSIGHTS.md` edits.
2. Dev DB: SELECT only. Never call the local API (`localhost:3201`) with POST/PUT/DELETE. Never
   run `pnpm db:seed`, migrations, or a conventions scan. The DB is staged for a recorded demo.
3. Secrets: the OpenRouter key lives in `~/.devdigest/secrets.json` and `h5.py` already loads
   it. Never print, echo or log the key or the `DATABASE_URL` value.
4. OpenRouter calls: always pinned with `provider: {order: [tag], allow_fallbacks: false}`,
   temperature 0, max 2 concurrent requests, retry a 429 up to 3 times with 20 s backoff, then
   record it as an error. Record `served_by`, `prompt_tokens`, `completion_tokens`,
   `reasoning_tokens`, `cost` for every call. Hard spend cap per analyst: **$0.25**.
5. "Caught" is decided by reading the finding titles/summary, not by counting criticals: it
   needs a CRITICAL finding that is about the 201 → 200 status code.
6. Interleave arms (A1,B1,C1,A2,B2,…) rather than running one arm after another, so provider
   drift hits all arms equally.
7. Separate what you **verified** (ran it, read it, quoted it) from what you **infer**. No
   confident language on anything unverified. A negative result is a result — report it.
8. Budget: at most 150 tool calls or 45 minutes. If you hit it, stop, write
   `reports/<your-letter>-STATUS.md` (done / not done / how to resume) and report.

## Deliverable

Write `reports/<letter>-<slug>.md` in the scratchpad (English, complete sentences):
1. Answer to your questions, most important first.
2. Evidence for each claim: `path:line`, a quoted prompt span with its location, run ids, or a
   table of calls with counts.
3. What you did not check, and what would change your conclusion.

Then reply to the orchestrator with a summary of at most 300 words plus the report path.
