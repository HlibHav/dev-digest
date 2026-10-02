# specs/

Normative specs for features that touch **two or more packages** (for example a server contract
plus the client surface that reads it). Only cross-package specs live here; a spec for a single
package goes in that package's own `specs/` folder.

| Spec touches | Folder |
|---|---|
| `server` only | `server/specs/` |
| `client` only | `client/specs/` |
| `reviewer-core` only | `reviewer-core/specs/` |
| `mcp-server` only | `mcp-server/specs/` |
| **two or more packages** | `specs/` (here) |

`e2e/specs/` is not a spec folder: it holds the browser flows as JSON.

## What a spec is

Specs are written by the `spec-creator` agent (`.claude/agents/spec-creator.md`) following
[`docs/sdd-cascade.md`](../docs/sdd-cascade.md), which decides how much spec a change needs.

A spec says **what** a feature must do and **why**: the problem, goals and non-goals, EARS
acceptance criteria, edge cases, where every input comes from, and it may show workflows
(Mermaid), communication between packages and contracts. It stops short of **how** to build it
(file-by-file steps, layers, code); that is the `implementation-planner`'s plan in `docs/plans/`.
It does not describe how the code works today (`docs/`) or what was already tried
(`INSIGHTS.md`). The chain is:

```
brainstorm (optional) → spec-creator → spec (WHAT/WHY) → implementation-planner → plan (HOW) → implementer → code
```

## Conventions

- **File name:** `YYYY-MM-DD-<kebab-feature-name>.md`, dated the day the spec is created. An
  update keeps the file and its date and adds a `## Changelog` row.
- **Spec ID** (in the header): `SPEC-YYYY-MM-DD-<kebab-feature-name>`, the file name without
  `.md`.
- **Status lifecycle:** `draft` → `approved` → `implemented`; a Discovery-First spec starts as
  `discovery`. Only the user sets `approved`.
- **Language:** English, EARS keywords included.
- A spec that replaces an earlier decision links it on the `Supersedes:` header line.
- Design inputs for a spec go in `designs/<feature>/` next to it.

## Contents

- `2026-10-02-project-context.md` — Project Context: discover repo `.md` docs, attach them to agents and skills, inject them into review prompts, per-doc snapshot in the run trace (server, reviewer-core, client). Status: implemented.
