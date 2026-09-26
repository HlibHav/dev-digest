# PR age label

`prAgeLabel(openedAt, now?)` in `src/modules/pulls/age.ts` turns GitHub's `created_at`
into the "opened 3 hours ago" string shown in the PR list. It uses the `ms` package for the
humanized duration; `now` is injectable so tests stay deterministic.

`prAgeSortKey(openedAt)` is the sort key for "oldest first" ordering.
