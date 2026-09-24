# skills-v0 — export of the current five API Contract Reviewer skills

Bodies and order are read straight from the dev DB (`agent_skills.order` for agent
`3291d6c0-241b-4d8d-9a14-fbf3d2f6bdb0`, joined to `skills.body`), one folder per skill,
`meta.json` carrying `{name, source, untrusted, order}`.

**Trust rendering**: the real app renders `03-deprecation-policy` (source `imported_url`)
INSIDE an `<untrusted>` block per `isSkillUntrusted()` (`server/src/vendor/shared/contracts/knowledge.ts:129`,
`UNTRUSTED_SKILL_SOURCES = ['imported_url', 'community']`) and the other four trusted
(`### name\n<body>`). `evals/run.ts` reproduces this exactly via each skill's
`meta.json["untrusted"]` flag when it builds the `PromptSkill[]` passed to the real
`assemblePrompt` — this is what the `verify` command's md5 match proves.

The brief allows also measuring v0 with every skill rendered trusted (i.e. ignoring the
`untrusted` flag) "if budget allows." That second variant was **not run** in this pass —
the wall-clock budget (45 min) was spent on the two required arms (no-skills, skills-v0
as the app renders it) × 3 providers × 5 cases × n=4 = 120 calls plus construction proof
and case-building. To run it: copy this directory, edit each `meta.json` to `"untrusted":
false`, and pass that copy's path as `--skills` to `run.ts run` with a different `--label`
(e.g. `skills-v0-all-trusted`).
