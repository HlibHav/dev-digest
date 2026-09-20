# Spec: FINDINGS column and popover (client)

Homework criteria 20–21. Server half: `server/specs/pr-list-findings.md`.

## Surface

- **Column.** The Pull Requests list gets a **Findings** column between Score
  and Status, as in the design.
- **Cell.** One severity icon plus a count for each severity the latest run
  has, in the order critical, warning, suggestion. A PR without a review, or
  whose latest review has no findings, shows `—`.
- **Popover.** Hovering the icons, or focusing them with the keyboard, opens a
  popover titled `N FINDINGS IN THIS RUN`, where N is the sum of the counts.
- **Previews.** Each finding in the popover is text only: severity icon, title,
  category, `file:line`, `NN% conf`, and a short description. There are no
  buttons. Accept and Reject stay on the PR page's Review runs cards.

## Rules

- **Which findings.** The popover shows the findings of `latest_findings.review_id`,
  so it always describes the run the cell counted, not simply the newest review
  in the response.
- **Order.** Previews are ordered critical → warning → suggestion.
- **Short description.** The `rationale` markdown as one line of plain text,
  clipped to about 140 characters on a word boundary. Emphasis markers and code
  ticks are removed, but underscores inside identifiers such as `sk_live_` or
  `user_id` are kept.
- **Loading.** Findings load only when the popover opens. Until then the list
  makes no extra request.
- **Clicks.** A click inside the popover doesn't open the PR. The row still
  navigates as before.
- **Closing.** The popover closes 150 ms after the pointer leaves, and
  immediately on scroll.

## i18n keys

`prReview.list.columns.findings`, `prReview.list.findingsCell.{label,CRITICAL,WARNING,SUGGESTION}`,
`prReview.list.findingsPopover.{title,loading,error,missing}`.

## Acceptance criteria

1. The Findings column sits between Score and Status and shows counts only for
   present severities, or `—`.
2. Hovering the icons opens `N FINDINGS IN THIS RUN` with one read-only preview
   per finding of that run.
3. Each preview shows severity icon, title, category, file:line, confidence and
   a short description, and contains no buttons.
4. Nothing is fetched before the popover opens.
