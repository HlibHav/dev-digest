# reviewer-core — insights

Findings that are true about this code but not visible in it. Maintained by the
`engineering-insights` skill: read before working here, add an entry after a
non-trivial task, skip routine changes. Append-only — never rewrite or delete an
entry; correct a stale one with a dated sub-bullet beneath it. Sections are
fixed — add to the one that fits.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-09-20** — `wrapUntrusted(label, content)` neutralises `</untrusted>` in the **content** but interpolates `label` straight into `source="${label}"`. Every caller before skills passed a literal (`'diff'`, `'pr-description'`, `` `spec-${i}` ``), so it had never mattered. Any new caller must pass a constant label and put caller-controlled text **inside** the block — a quote in a label would otherwise close the attribute. Evidence: `reviewer-core/src/prompt.ts:33`, `reviewer-core/src/prompt.ts:86`

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

- **2026-09-20** — `PromptParts.skills` went `string[]` → `PromptSkill[]` and `renderSkillsBlock` now owns the trusted/untrusted split → Codebase Patterns. Evidence: `reviewer-core/src/prompt.ts:80`

## Open Questions
