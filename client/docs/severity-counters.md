# Severity counters: how they are wired

The spec is `specs/severity-counters.md`. Everything lives in
`src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/`.

## Data flow

The PR page calls `usePrReviews` (`GET /pulls/:id/reviews`) and hands the
reviews to `FindingsTab`, which renders one `ReviewRunAccordion` per review. The
accordion passes `review.findings` to `FindingsPanel`. No new request: counts
are derived in the browser.

## Two derived lists

`FindingsPanel.tsx` keeps `hideLow` and `severity` in local state and derives:

- `base = visibleFindings(findings, hideLow)`: the counts come from here.
- `present`: the severities with a non-zero count in `counts`, the only ones that get a pill.
- `activeSeverity`: the selected severity while it still has findings, otherwise `null`.
- `shown = visibleFindings(findings, hideLow, activeSeverity)`: the cards come from here.

Counting from `shown` would zero the other pills once one is selected, so there
would be nothing left to click. Counting from raw `findings` would drift from the
cards when low-confidence findings are hidden. Changing the filter resets
`focusIdx` to 0, so the `a`/`d` shortcuts keep a valid target.

The toggle goes through `changeHideLow`, not `setHideLow` directly: when the new
setting would empty the selected severity, it clears `severity` in state. The
derived `activeSeverity` alone would hide the filter, but it would come back as
soon as the toggle is switched off.

## Pieces

- `constants.ts`: `SEVERITY_FILTERS`, the pill order.
- `helpers.ts`: `visibleFindings(findings, hideLow, severity?)` and
  `countsBySeverity(findings)`, both pure.
- Pills are the vendored `Chip` with icon and colour from `SEV` (`@devdigest/ui`).
  `Chip` has no `aria-pressed`, so the active state is visual only.

## Tests

- `helpers.test.ts`: counts with zeros, filter, filter plus hide-low.
- `FindingsPanel.test.tsx`: counts match cards, only present severities get a pill,
  no pills without findings, hide-low recounts, click filters and a second click
  resets, and hide-low drops a filter it empties without reviving it later.
