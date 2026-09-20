# Skills UI: how it is wired

The spec is `specs/skills-library.md`. This page covers where the pieces live
and the two things about them that are not obvious from the code.

## Components

```
src/app/skills/page.tsx                      → <SkillsListView />
src/app/skills/_components/SkillsListView/
  SkillsListView.tsx    grid + preview pane + Add menu, owns selection
  helpers.ts            filterSkills, fileToBase64, formatBytes
  constants.ts          CARD_GRID_COLS, SKILL_TYPES, IMPORT_ACCEPT, TYPE_COLOR
  _components/SkillCard         card + vetting toggle + delete
  _components/SkillPreview      rendered body, source badge, Edit
  _components/SkillEditorModal  create and edit, one form
  _components/ImportSkillDrawer file → preview → confirm

src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/
  SkillsTab.tsx         DndContext + SortableContext over the attached set
  helpers.ts            moveSkill, toggleAttached, orderedAttached, availableSkills
  _components/SkillRow  one row; sortable only when attached
```

## Data

| Hook | Endpoint |
|---|---|
| `useSkills` / `useSkill` | `GET /skills`, `GET /skills/:id` |
| `useCreateSkill` / `useUpdateSkill` / `useDeleteSkill` | `POST` / `PUT` / `DELETE /skills/:id` |
| `usePreviewSkillImport` | `POST /skills/import/preview` — parse only, invalidates nothing |
| `useAgentSkills` / `useSetAgentSkills` | `GET` / `POST /agents/:id/skills` |

Query keys follow the agents hooks exactly: `["skills"]`, `["skill", id]`,
`["agent-skills", agentId]`. Mutation errors are toasted globally by
`src/lib/providers.tsx` — no local error toasts.

## Why a deep import for `isSkillUntrusted`

`SkillCard`, `SkillPreview` and `SkillRow` import it from
`@devdigest/shared/contracts/knowledge`, not from `@devdigest/shared`.

Every other client import from the shared barrel is **type-only** and therefore
erased at compile time. This is the first runtime value the client takes from
it, and the vendored barrel re-exports with ESM `.js` specifiers that the Next
bundler cannot resolve — the page 500s with a wall of
`Module not found: Can't resolve './contracts/findings.js'`. Importing the
contract file directly resolves through the `@devdigest/shared/*` path alias and
keeps the rule in one place instead of duplicating the source list on the
client.

## Why the mutation's variables stand in for server state

`SkillsTab` reads the attached order from `setSkills.variables?.skillIds` while
a write is in flight, falling back to the query. Without it, a drag commits,
the list re-renders from the stale query, and the row visibly snaps back before
the response lands.

## Tests

- `SkillCard.test.tsx` — rendering, the description fallback, and the four
  vetting-badge cases (imported+disabled badges, the other three do not).
- `SkillsTab/helpers.test.ts` — `moveSkill`, `toggleAttached`, `orderedAttached`
  and `availableSkills`. The drag itself is dnd-kit's; what must hold here is the
  ordered list it produces, which is also the request payload.

Queries for a toggle use `getByRole("switch")` — the vendored `Toggle` renders
`role="switch"`, not a button (`INSIGHTS.md`).
