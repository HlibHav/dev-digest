# Spec: Severity counters (client)

Homework criteria 16–19. Each review run in the PR page's Review runs accordion
shows how many findings it has per severity, and those counts filter the list.

## Surface

A pill row `N CRITICAL · N WARNING · N SUGGESTION` sits at the top of the run's
findings panel, directly under the verdict banner with its score. Only the
severities the run actually has get a pill: a run with one warning shows just
`1 WARNING`, and a run without findings shows no pills.

## Rules

- Counts are taken over the findings the panel shows before the severity filter.
  With "Hide low confidence" on, low-confidence findings leave the count too, so
  a pill's number always equals the cards you get by clicking it.
- Clicking a pill shows only that severity. The other pills keep their numbers
  and stay clickable. Clicking the active pill again resets the filter.
- If "Hide low confidence" removes the last finding of the selected severity,
  that pill disappears and the filter is dropped, so the list never gets stuck
  empty with no pill to reset it. Switching the toggle back off doesn't bring
  the old filter back.
- Counting is `Array.filter` on the client over `ReviewRecord.findings`. No LLM
  call and no new endpoint.
- `INFO` is not in the `Severity` contract, so it has no pill.

## i18n keys

`prReview.panel.severityCount.{CRITICAL,WARNING,SUGGESTION}`.

## Acceptance criteria

1. The row appears under the verdict and score in every open accordion, with pills
   only for severities that are present.
2. Each count matches the number of finding cards of that severity.
3. Toggling "Hide low confidence" recomputes the counts.
4. Click filters by severity; a second click on the same pill resets.
5. No network or model call is involved in counting.
