# docs/

Deep dives into how a subsystem works: pipelines, diagrams, request/data
flow. Package-local only — cross-package docs go in the repo root `docs/`.

Add a file here instead of growing `CLAUDE.md` or `README.md` past their size
targets.

## Contents

- `cost-accounting.md` — how per-call cost is attributed (OpenRouter `usage.cost`, injected estimator) and folded into a run.
- `skills-block.md` — the `## Skills / rules` section: PromptSkill, the trusted/untrusted split, and why the wrapper label is fixed.
