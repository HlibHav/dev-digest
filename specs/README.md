# specs/

Normative specs for features that touch **two or more packages** (for example a server contract
plus the client surface that reads it). Only cross-package specs live here. A spec for a single
package goes in that package's own `specs/` folder (`server/specs/`, `client/specs/`,
`reviewer-core/specs/`, `mcp-server/specs/`).

A spec says what to build and how to tell it is done: the problem, goals and non-goals,
acceptance criteria in EARS form, edge cases, and where every input comes from. It may show
workflows (Mermaid), communication between services and contracts, without implementation
details. It does not describe how the code works today (that is `docs/`) or what was already
tried (`INSIGHTS.md`). Files are named `YYYY-MM-DD-<feature>.md`, dated the day the spec is
created.

Specs are written by the `spec-creator` agent (`.claude/agents/spec-creator.md`) following
[`docs/sdd-cascade.md`](../docs/sdd-cascade.md): which tier a change needs, the `SPEC-NN`
numbering, the changelog, and when a spec may change. Design inputs for a spec go in
`designs/<feature>/` next to it.

## Contents

(none yet)
