# client — insights

Findings that are true about this code but not visible in it. Maintained by the
`engineering-insights` skill: read before working here, add an entry after a
non-trivial task, skip routine changes. Append-only — never rewrite or delete an
entry; correct a stale one with a dated sub-bullet beneath it. Sections are
fixed — add to the one that fits.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

- **2026-09-16** — Vendored `Chip` renders a plain `<button>` with no `aria-pressed` prop, and `Toggle` renders `role="switch"`, not `button`. In tests, query the toggle with `getByRole("switch")` and assert a chip filter's active state through what it renders (the filtered cards), not an ARIA attribute; add the prop upstream rather than patching `src/vendor/ui` locally. Evidence: `client/src/vendor/ui/primitives/Chip.tsx:4`, `client/src/vendor/ui/primitives/Toggle.tsx:15`

## Recurring Errors & Fixes

## Session Notes

- **2026-09-16** — Severity counter pills with filter in the findings panel → Tool & Library Notes
  - **2026-09-16** — Refined: the session's main code change, the pill row rendered for present severities. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:75`

## Open Questions
