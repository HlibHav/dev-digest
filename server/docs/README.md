# docs/

Deep dives into how a subsystem works: pipelines, diagrams, request/data
flow. Package-local only — cross-package docs go in the repo root `docs/`.

Add a file here instead of growing `CLAUDE.md` or `README.md` past their size
targets.

## Contents

- `run-cost-data-flow.md` — how a run's USD cost travels from the LLM response to `agent_runs`, the trace and the PR list; the index behind the list query.
