# Spec: Skills library and the agent's Skills tab (client)

Lab 2, client half. The server half is `server/specs/agent-skills.md`.

Two surfaces: a library at `/skills` where skills are written, imported, vetted
and edited, and a **Skills** tab in the agent editor where an agent picks the
skills it carries and the order they appear in its prompt.

## Surfaces

| Surface | Where | Content |
|---|---|---|
| Sidebar entry | `src/vendor/ui/nav.ts` | "Skills", `Sparkles`, `/skills`, chord `g s` |
| Library | `/skills` | card grid + preview pane + Add menu |
| Card | `SkillCard` | name, type badge, description, version, enabled toggle, delete |
| Preview | `SkillPreview` | rendered body, source badge, vetting toggle, Edit |
| Editor | `SkillEditorModal` | name, description, type, markdown body |
| Import | `ImportSkillDrawer` | file picker → parsed preview → Confirm |
| Agent tab | `/agents/:id?tab=skills` | attached (sortable) + available, with a filter |

Out of scope: a `/skills/:id` detail route, the community catalogue, URL import.

## Rules

1. **The card grid is the library.** Clicking a card selects it; the right pane
   previews the selected skill and is the only place `enabled` is explained.
2. **`enabled` means vetted, not attached.** The library toggle sets
   `skills.enabled`. The agent tab's toggle writes `agent_skills`. A skill
   reaches a prompt only when both are true.
3. **A skill that cannot reach the prompt must not look active.** An imported,
   not-yet-enabled skill shows a "needs vetting" badge and dimmed text — in the
   grid and in the agent tab.
4. **The description is the skill's interface.** Its field carries a hint saying
   so and asking for an instruction, not a topic ("Flag N+1 queries and missing
   indexes" over "about performance").
5. **Import previews before it saves.** Picking a file posts it to the parse-only
   endpoint and renders what would be saved, including every archive entry that
   was listed and never decompressed. Nothing is created until Confirm.
6. **Import states its trust model in the drawer**, next to the preview: an
   imported skill enters the prompt as data and stays disabled until the user
   enables it.
7. **Order is the payload.** The agent tab sends `skill_ids` as one ordered set,
   so attach, detach and reorder are the same request. Attached rows are
   drag-sortable (`@dnd-kit`) and numbered by prompt position.
8. **Body edits are versioned.** The preview says a changed body creates a new
   immutable version; the version is shown as `v{n}`.

## i18n keys

Everything lives in `messages/en/skills.json` (`page.*`, `create.*`, `card.*`,
`preview.*`, `listItem.*`, `drawer.*`, `importer.*`) and the tab's strings under
`agents.skills.*` in `messages/en/agents.json`. No inline English.

## Acceptance criteria

1. `/skills` lists every workspace skill as a card with its name, type,
   description and version; clicking one previews its rendered body.
2. Add offers exactly two ways in: write one, or import a file or archive.
3. Creating and editing both go through the same form and persist — an edited
   body comes back with an incremented version.
4. Importing a `.zip` shows the derived name, description, type and body, plus
   the list of entries that were not processed, and saves only on Confirm. The
   saved skill is disabled and badged "needs vetting".
5. The agent tab shows `{linked} of {total} enabled`, lists attached skills
   first with their prompt position, and everything else under Available.
6. Toggling a row attaches or detaches it; dragging an attached row reorders it;
   both persist and survive a reload.
7. A row that is attached but not enabled in the library is dimmed and badged.
