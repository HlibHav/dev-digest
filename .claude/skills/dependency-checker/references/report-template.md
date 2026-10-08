# Dependency report: <repo> (<YYYY-MM-DD>)

One paragraph: how many packages, total installed size, the single most important finding.

## Summary

| Package | Manager | Prod | Dev | Installed size | Installed packages | Install health |
|---|---|---|---|---|---|---|

## Map

```mermaid
graph LR
  %% packages with their links (path alias, mirrored copy, HTTP), plus the heaviest prod deps
```

## Packages

### <package>

Top direct dependencies by own installed size (up to 10):

| Dependency | Type | Kind | Range | Installed | Own size |
|---|---|---|---|---|---|

Possibly unused (each with its priority from the table in SKILL.md and the grep evidence):

- `<dep>`: P1 | P2, what the grep found, or "used only through `<other dep>`"

Or "none found".

<repeat per package>

## Across packages

| Dependency | Declared in (range) | Major drift |
|---|---|---|

## Findings

1. **<short title>.** What is wrong, with the evidence (numbers from the collector, grep results).

## Recommendations

| Priority | Package | Dependency | Evidence | Action |
|---|---|---|---|---|

## Method and limits

Collected with `collect_deps.py` on <date>, read-only, no network. Sizes are installed disk size
(own directory per dependency), not bundle size. "Possibly unused" is a static search.
