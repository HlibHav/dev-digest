# docs/

Deep dives into how a subsystem works: pipelines, diagrams, request/data
flow. Package-local only — cross-package docs go in the repo root `docs/`.

Add a file here instead of growing `CLAUDE.md` or `README.md` past their size
targets.

## Contents

- `run-cost-data-flow.md` — how a run's USD cost travels from the LLM response to `agent_runs`, the trace and the PR list; the index behind the list query.
- `skills-prompt-injection.md` — how a skill body reaches the model: the query, the tenancy and injection guards, degradation and observability.
- `blast-radius.md` — how `GET /pulls/:id/blast` reads the repo-intel index (persistent vs ripgrep fallback), the pure grouping/degraded mapping, and how the Overview-tab card and the MCP tool consume it.
