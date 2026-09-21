# Research brief — rebuilding DevDigest reviewer skills from scratch

You are one of three researchers working in parallel for an orchestrator. Your topic is in your
prompt. This file is the shared context. Read it first.

## What a "skill" is here

DevDigest is a local-first AI PR reviewer. A reviewer *agent* is a system prompt plus an ordered
list of *skills*: markdown rule files that are ALWAYS pasted into the user message under
`## Skills / rules`, before the PR description and the diff. The model is
`deepseek/deepseek-v4-flash` via OpenRouter, temperature 0, JSON output with findings
(severity CRITICAL / WARNING / SUGGESTION; CRITICAL blocks the merge). These are not Claude
Agent Skills: nothing triggers them by description, and the reader is a mid-size model that
often does no reasoning before answering.

## What two rounds of measurement found (verified, 2026-09-21)

1. **Skills mostly restate what the model already knows.** Of 56 rules in the 7 seeded skills,
   59% are general engineering knowledge, 34% severity/threshold policy, and ~4 are repo facts a
   model cannot infer from a diff. A skill made of general knowledge cannot add a catch; the
   no-skills baseline already catches the planted defects on the existing fixtures.
2. **Skills veto each other.** Every skill ended with `## Do not flag`. `semver-discipline`'s
   "an internal refactor is a patch" suppressed `breaking-change`'s catch on a PR framed as a
   refactor (pair: 0/6). Removing the other skills' "Do not flag" sections restored it (6/6).
   Nothing in the prompt says an exemption is local to its own skill.
3. **More skills, fewer catches.** One skill alone catches; five together miss — on two
   fixtures with two different rules. Size-matched neutral prose also degrades (4/12), so part
   of it is volume, part competition. Moving the key skill last also restored the catch (5/6).
4. **Terse extracted rules don't fire on non-reasoning backends.** A repo convention
   ("Normalize every API error into ApiError…") caught a violation 6/6 on a provider that
   reasons, 0/6 on two that don't. Rewriting it as an explicit check helped little.
5. **Severity lives in the wrong place.** Only CRITICAL blocks, but every repo-specific rule was
   WARNING or unrated; meanwhile an agent's role prompt kept an impact band that decided the
   fixture on its own, leaving the skills nothing to add.
6. Other: headings inside a skill colliding with the prompt's own `##` sections did NOT matter
   (fencing: 0/6). A skill wrapped as untrusted data behaved differently from the same skill
   rendered trusted (unexplained).

## What the orchestrator needs from research

Sources we will later cite in a README and use to write new skills with a version. For every
source: title, author/org, URL, date (or "undated"), type (official doc / paper / engineering
blog / standard / tool docs), 2–4 takeaways in your own words, and which of findings 1–6 it
supports, contradicts or extends (or "new"). Prefer primary sources (official docs, papers,
standards, the engineering blog of the team that built the thing). Mark anything you could not
open and read yourself as "not verified". Quote at most one short phrase per source.

## Rules

- Use WebSearch and WebFetch (load them with ToolSearch: `select:WebSearch,WebFetch`). Read the
  pages you cite; do not cite from search snippets alone.
- Write only in the scratchpad `research/` folder:
  `/private/tmp/claude-503/-Users-Glebazzz-Claude-PROJECTS-NEO-dev-digest--claude-worktrees-h1-skill-size-hypothesis-7b81ce/332e6705-8aa5-4861-8830-37c4c60b506d/scratchpad/research/`
  No repo edits, no git, no DB access, no LLM API calls.
- Budget: at most 120 tool calls or 40 minutes. Aim for 12–20 strong sources, not 50 weak ones.
- Deliverable: `research/<letter>-<slug>.md` in English: (1) the 5–8 most actionable principles
  for writing these skills, each tied to sources; (2) the source list in the format above;
  (3) open questions. Reply with ≤ 250 words and the path.
