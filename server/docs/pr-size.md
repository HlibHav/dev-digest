# PR size bucket and patch size label

## Goal

Reviewers triage the PR list faster when they can see at a glance how big a pull request is.
The list gets an S / M / L badge per PR, and the Files changed tab can show how heavy each
file's patch is.

## Scope

- `sizeBucket(additions, deletions)` in `src/modules/pulls/size.ts`: fewer than 100 changed
  lines is S, fewer than 400 is M, 400 or more is L — the same thresholds as the client's badge.
- `patchSizeLabel(patch)`: a human-readable size of a file's unified-diff patch, via the
  `pretty-bytes` package.
- Both exported from the `pulls` module barrel.

## Out of scope

- Rendering the badge or the label in the client (a follow-up PR).
- Any change to how the list sorts or filters PRs.
