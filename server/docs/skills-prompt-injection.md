# How a skill reaches the model

The spec is `specs/agent-skills.md`. This page is the path a skill body travels
from its row to the assembled prompt, and the two places that path is guarded.

## The path

```
skills row ──┐
             ├─ AgentsRepository.enabledSkillsForAgent(workspaceId, agentId)
agent_skills ┘        │  attached AND skills.enabled AND same workspace
                      │  ORDER BY agent_skills.order
                      ▼
        ReviewRunExecutor.resolveSkills()      → PromptSkill[] { name, body, untrusted }
                      │
                      ▼
        reviewPullRequest({ …, skills })       → reviewer-core
                      │
                      ▼
        assemblePrompt() → renderSkillsBlock() → "## Skills / rules"
                      │
                      ▼
        run_traces.trace.prompt_assembly.skills (what the Trace drawer shows)
```

| Step | Where |
|---|---|
| The query | `src/modules/agents/repository.ts` → `enabledSkillsForAgent` |
| Resolution + logging | `src/modules/reviews/run-executor.ts` → `resolveSkills` |
| Rendering + wrapping | `../reviewer-core/src/prompt.ts` → `renderSkillsBlock` |
| Trust classification | `src/vendor/shared/contracts/knowledge.ts` → `isSkillUntrusted` |

## Why the query lives on the agents repository

`.claude/rules/onion-boundaries.md`: a module never imports another module's
internals; cross-module work goes through the container or a port. The seam
already existed — `container.agentsRepo` is exposed with the comment
"instead of reaching into another module's folder", and `ReviewRunExecutor`
already took it. The prompt-side read is the *agent* side of the link, which
`modules/agents/repository.ts` documents as its own. So no new container facade
was added.

`linkedSkills` (unfiltered) stays for the editor, which must list a skill that
is attached but disabled. `enabledSkillsForAgent` is the only read allowed to
feed a prompt.

## The two guards

**Tenancy.** `enabledSkillsForAgent` joins `agent_skills → agents → skills` and
requires `agents.workspaceId = skills.workspaceId = $ws`. This is load-bearing:
a link row is a pair of ids and carries no workspace, and before this change
`AgentsService.setSkills`/`linkSkill` validated the agent's workspace but never
the skill ids. Both ends are now checked — the write rejects a foreign id with
422, and the read would drop it anyway.

**Injection.** An imported or community body is delimiter-wrapped exactly like
the diff. Two details matter:

- The wrapper label is a fixed `skill-<i>` and the skill's **name goes inside**
  the block. `wrapUntrusted` escapes its content but interpolates the label raw
  into `source="${label}"`, and an imported skill's name is the first
  caller-influenced value that could ever reach it.
- Names are flattened to one line, trusted or not, so a name carrying
  `\n## Diff to review` cannot forge a section header.

## Degradation and observability

`resolveSkills` is best-effort, like the repo-intel digests: a DB failure logs
and returns `[]` rather than failing the run — skills are context, not the
review. When skills resolve, the run log carries one line:

```
skills: 2 attached (0 untrusted) — branch-coverage-gate, test-smells
```

`prompt_assembly.skills` is `null` when an agent has no skills, and the section
is omitted from the prompt entirely, so such a run is byte-identical to one
assembled before this feature existed.

On the failure path `traceFromBuffer` carries the rendered block when the run
got far enough to resolve it, so a failed run's trace still shows what the model
was given. The pre-work failure (`failAll`, diff load) keeps `null`: no prompt
was ever assembled there, and showing a block would misreport the run.

## Tests

- `test/skills-injection.it.test.ts` — the gate. Asserts on the **persisted
  trace**: order, the disabled and unattached exclusions, the omitted section,
  the untrusted wrap after vetting, and the forced cross-workspace link.
- `test/skills-versions.it.test.ts` — CRUD, body-only versioning, the 404/422
  matrix, cross-workspace invisibility.
- `test/skills-import.test.ts` — the parser, including a zip whose skipped
  entries carry a deliberately corrupted deflate stream: the import succeeds,
  which proves those entries were never inflated.
- `../reviewer-core/test/prompt-skills.test.ts` — rendering, ordering, and the
  two name-escape attempts.
