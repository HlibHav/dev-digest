# Spec: findings on the PR list (server)

Homework criteria 20–21. The PR list shows how many findings the latest run
produced, and the popover previews them. The client half is
`client/specs/findings-popover.md`. The decision record is
`decisions/2026-09-16-pr-list-findings-popover.md` in the course workspace.

## API

`GET /repos/:id/pulls` adds `PrMeta.latest_findings`:

```ts
latest_findings: {
  review_id: string;              // the latest kind='review' review of the PR
  counts: { CRITICAL: number; WARNING: number; SUGGESTION: number };
} | null                          // null until the PR has a review
```

The field is `.nullish()` in the contract because other endpoints that return
`PrMeta` don't fill it.

## Semantics

- "Latest run" is the newest `reviews` row with `kind = 'review'`, the same
  review the list's `score` comes from.
- Counts cover every finding of that review, dismissed ones included, which
  matches the "N findings" label in the Review runs accordion.
- A reviewed PR whose latest review has no findings gets all-zero counts, not
  `null`.
- The findings themselves aren't in the list response. The popover reads them
  from the existing `GET /pulls/:id/reviews` and picks the review by
  `review_id`.

## Acceptance criteria

1. An unreviewed PR lists `latest_findings: null`.
2. After two reviews, `review_id` is the newer review's id and the counts are
   that review's findings per severity.
3. No new endpoint, and no LLM call.

Covered by `server/test/reviews.it.test.ts` ("PR list: latest_findings …") and
`server/test/contracts.test.ts` ("PR list findings contracts").
