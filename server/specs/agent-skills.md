# Spec: Skills for review agents (server)

Lab 2. A **skill** is reusable review guidance stored in the database, edited by
the user, and linked to any number of agents in an explicit order. At review
time the linked, enabled skill bodies are injected into the assembled prompt as
`## Skills / rules`, ahead of the diff.

A skill is text and nothing else: no tools, no file access, nothing executed.
Its entire effect on a run is the characters it contributes to the prompt.

The client half is `client/specs/skills-library.md`; how a body actually reaches
the model is `server/docs/skills-prompt-injection.md`.

## Data model

No migration: `skills`, `skill_versions` and `agent_skills` already exist in
`0000_init.sql`, and `.claude/rules/db-schema.md` calls them intentional
scaffolding.

| Table | Role |
|---|---|
| `skills` | name, description, `type`, `source`, body, `enabled`, `version`, `evidence_files` — workspace-scoped |
| `skill_versions` | `(skill_id, version, body)` — an immutable snapshot per body change |
| `agent_skills` | `(agent_id, skill_id, order)` — which skills an agent carries, and in which order |

`enabled` is the **library-level vetting flag**, not a per-agent switch: a skill
is either fit to be used or not. Which agent uses it is `agent_skills`.

## API

| Route | Behaviour |
|---|---|
| `GET /skills` | list, workspace-scoped |
| `GET /skills/:id` | one skill; 404 across workspaces |
| `POST /skills` | create → 201. `imported: true` records provenance and forces `enabled: false` |
| `PUT /skills/:id` | update; a **body** change bumps `version` and snapshots |
| `DELETE /skills/:id` | delete; versions and agent links cascade |
| `GET /skills/:id/versions` | body history, newest first |
| `GET /skills/:id/versions/:version` | one snapshot; a non-integer version is 422 |
| `POST /skills/import/preview` | parse an upload and return what WOULD be saved. **Writes nothing** |

Linking stays on the agent side, where it already was:
`GET/POST /agents/:id/skills`. `POST` takes the whole ordered set as
`skill_ids`, so attach, detach and reorder are one call.

Out of scope: URL import, the community catalogue, `extracted` skills and
convention mining, and pinning an agent to a past skill version.

## Versioning: the body only

`skill_versions` stores `(skill_id, version, body, created_at)` and nothing
else, so only a body edit bumps `skills.version` and writes a snapshot. A name,
description, type or `enabled` edit changes the row and leaves the history
alone. This diverges from `agents`, where any config field bumps the version;
changing it would need a migration. `isBodyChange` in
`modules/skills/helpers.ts` is the rule, and says so.

## Import

Markdown file or archive, parsed server-side, **previewed before anything is
written**.

- The upload arrives base64 in JSON (`server/` has no multipart plugin); the
  route raises its own `bodyLimit` above the app-wide 1 MiB.
- A zip is recognised by its magic number, not its extension.
- From an archive, exactly one entry is decompressed: `SKILL.md` if present,
  else the shallowest markdown file. `fflate`'s filter decides from the central
  directory, so **every other entry — scripts, binaries, references — is listed
  and never inflated**. That is how "executable parts are not processed" is
  enforced, and it caps zip bombs: `originalSize` is checked before inflation.
- Name, description and type come from YAML front matter, else from the first
  heading and paragraph, else from the filename.
- The saved row is `source: 'imported_url'` (the enum's only "imported" member —
  renaming it needs a migration) and `enabled: false`.

## Trust

`manual` and `extracted` bodies render plainly. `imported_url` and `community`
bodies are wrapped with `wrapUntrusted()`, like the diff and the PR
description — someone else's skill is someone else's instructions inside your
agent's prompt. The rule lives in `vendor/shared/contracts/knowledge.ts`
(`isSkillUntrusted`) because the client badges the same sources. Rationale and
alternatives: `../decisions/2026-09-20-skill-trust-model.md`.

## Acceptance criteria

1. A skill created through `POST /skills` returns 201 and has exactly one
   version holding its body.
2. Editing a body bumps `version` and appends a snapshot; the previous body is
   still readable at its own version. Editing name, description, type or
   `enabled` does neither.
3. A skill is invisible across workspaces: `GET`, `LIST` and the repository all
   refuse. A non-uuid `:id` is 422, a missing one 404.
4. A review run's persisted trace shows, in `prompt_assembly.skills`, exactly
   the skills that are attached to that agent **and** enabled, in
   `agent_skills.order`.
5. An agent with no skills produces a prompt byte-identical to the pre-skills
   shape — no empty section.
6. An imported body appears in the prompt only after it is enabled, and appears
   wrapped in `<untrusted source="skill-N">` with its name inside the block.
7. A skill from another workspace never reaches a prompt, even when a link row
   is forced directly into `agent_skills`; the link API rejects it with 422.
8. Importing an archive returns a preview without creating a row, names the
   entry the body came from, and lists every entry it did not process.
