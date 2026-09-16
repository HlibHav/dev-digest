# FINDINGS column and popover: how it is wired

The spec is `specs/findings-popover.md`. The code lives in
`src/app/repos/[repoId]/pulls/_components/FindingsCell/`.

## Data flow

1. `usePulls` → `GET /repos/:id/pulls` returns `PrMeta.latest_findings`
   (`review_id` plus per-severity counts, counted in SQL on the server).
2. `PRRow.tsx:59` renders `<FindingsCell prId latest />` between Score and
   Status. `constants.ts` has `"findings"` in `COLUMN_KEYS` and an 8th `GRID`
   track, so the header and the rows stay aligned.
3. `FindingsPopover` mounts only while open, and only then calls
   `usePrReviews(prId)` (`FindingsPopover.tsx:27`) → `GET /pulls/:id/reviews`. It
   picks `reviews.find((r) => r.id === reviewId)`. React Query caches the
   response per PR, so hovering the row again doesn't refetch while the cache is
   fresh.

## Pieces

- `FindingsCell.tsx`: counts, open and close state, positioning. The hover
  handlers sit on a wrapper around both the trigger and the popover, so moving
  the pointer from the icons into the popover keeps it open. The close is
  delayed by 150 ms, and `open()` cancels a pending close. The trigger is a
  focusable `role="button"`, so keyboard focus opens the popover too.
- **Positioning.** `tableCard` in `../../styles.ts` has `overflow: hidden`, so an
  absolutely positioned popover inside a row would be clipped by the card. The
  popover uses `position: fixed` with coordinates from `getBoundingClientRect()`
  (`FindingsCell.tsx:35`). It flips above the row when there's no room below and
  closes on any scroll (`FindingsCell.tsx:53`), because a fixed panel would
  drift away from its row.
- `FindingsPopover.tsx`: title, loading, error and missing states, and one
  `Preview` per finding built from vendored `SeverityBadge` (compact),
  `CategoryTag` and `ConfidenceNum`. The file label reuses `lineLabel` from the
  PR page's `FindingCard/helpers.ts`. It renders no `Button` or link, and
  `onClick` stops propagation so reading doesn't navigate.
- `helpers.ts`: `CELL_SEVERITIES`, `sortBySeverity`, `shortDescription`.
  `shortDescription` strips `**`, `*`, backticks, headings and quotes, and
  removes `_` only when it wraps a word (`helpers.ts:22`). An earlier version
  stripped every `_` and turned the seeded "`sk_live_`" into "sklive".

## Tests

- `FindingsCell.test.tsx` mocks `@/lib/hooks` and checks:
  - `—` without a review or with zero findings;
  - counts only for present severities;
  - no fetch before hover;
  - the dialog name `3 FINDINGS IN THIS RUN`;
  - previews come from the counted review, not the newest one, critical first,
    with category, file:line, confidence and description;
  - zero buttons inside the dialog;
  - the loading state;
  - keyboard focus opens it, and it closes 150 ms after mouse leave.
- `helpers.test.ts`: markdown stripping, clipping, and identifier underscores.
- `PRRow.test.tsx`: the findings cell is wired into the row.
