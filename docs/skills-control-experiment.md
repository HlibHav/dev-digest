# Control experiment: does a skill change the review?

A skill is only worth its tokens if the same agent, on the same diff, reviews
differently with it than without it. This is the procedure for showing that, and
the results from the run on 2026-09-20 — including the one that came out
negative.

The feature itself is documented in `server/specs/agent-skills.md` (what is
built) and `server/docs/skills-prompt-injection.md` (how a skill reaches the
model).

## Procedure

1. Import a PR. `GET /pulls/:id` — which is what opening the PR page does —
   refreshes the files from GitHub and stores each file's patch. **A PR you have
   never opened has no patch text, and a review of it silently sees an empty
   diff.** Open the PR in the UI before measuring anything.
2. Detach the agent's skills (Agent editor → Skills → toggle them off), run the
   review, and record: findings, severities, verdict, and `tokens_in` from the
   Trace drawer.
3. Attach the skills, run again on the same PR, and record the same numbers.
4. Compare. Open the Trace drawer → prompt assembly: with skills there is a
   `## Skills / rules` section, one `### <name>` block per skill, in the order
   the editor lists them.

Two controls matter, or the numbers lie:

- **Turn repo intelligence off on the agent** for the token comparison. The
  repo map and callers digest vary between runs, and that swamps the skill
  block: an uncontrolled pair in this session read 10565 vs 4415 `tokens_in`
  with the *larger* number on the run that had no skills.
- **Run the pair back to back.** The model is non-deterministic; a pair
  separated by other work is not a pair.

## Result 1 — Test Quality Reviewer, PR #6 (`feat(share): public digest share links + export bundles`)

407 added lines across 8 files, no tests. Agent: Test Quality Reviewer, skills
`branch-coverage-gate` and `test-smells`.

| | Without skills | With skills |
|---|---|---|
| `tokens_in` | 7773 | 8523 |
| Findings | **0** | **6** |
| Verdict | comment | request_changes |

Without its skills the agent declined to review at all, and said so:

> "Because there is no test change to evaluate, there are no findings to report
> for a PR that adds only untested production code."

With them it reported six, five of them CRITICAL, each naming a path that no
test reaches — the new module's repository, its `execSync` calls, its
`new Function()` helper, and all seven new routes. Same agent, same prompt, same
diff. The skills are what turned "no tests changed" into "no tests exist for any
of this".

## Result 2 — API Contract Reviewer, PR #5 (`feat(reviews): share a review to an external webhook`) — negative

One file, one new route. Agent: API Contract Reviewer, skills
`breaking-change-gate` and `api-contract-conventions`, repo intelligence off.

| | Without skills | With skills |
|---|---|---|
| `tokens_in` | 1945 | 2822 |
| Findings | 5 | 4 |
| Verdict | request_changes | comment |

With its skills the agent found **fewer** findings and lowered the severity of
the SSRF from CRITICAL to WARNING. That is not a bug, it is the skills working:
`breaking-change-gate` says a route the diff introduces cannot break a deployed
caller, and it reserves CRITICAL for contract breakage. An unvalidated outbound
URL is a real problem, but it is the Security Reviewer's problem, and a narrowed
agent hands it over instead of grading it.

The honest reading: **this PR cannot demonstrate the API Contract skills,
because nothing in it changes an existing contract.** No PR currently in
`HlibHav/dev-digest` does. To show the intended effect, the experiment needs a
PR that renames a response field, makes an optional request field required, or
changes a status code on a route that already exists.

The lesson generalises, and is worth saying out loud on the recording: a skill
narrows an agent. Narrowing raises the signal inside its remit and lowers it
outside. Measure the agent you scoped, not the agent you wish you had.

## The token cost

The skills block for two skills was 3451 characters and cost **+877
`tokens_in`** (1945 → 2822) in the controlled pair. At the seeded
`deepseek-v4-flash` pricing that is a rounding error per run; on a frontier
model and a ten-skill agent it is not. The Trace drawer's prompt-assembly
section is where you check what you are paying for.
