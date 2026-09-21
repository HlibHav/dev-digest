Add CSV export for a PR's findings

Reviewers who want to triage findings outside the studio — pasting them into a
spreadsheet for a stakeholder without studio access, or running their own
filters — currently have no way to get them out of the UI except copy-paste per
card.

This adds a small "Export CSV" action next to the existing severity filters in
the findings panel. Clicking it fetches the PR's findings as CSV from the new
`/pulls/:prId/findings.csv` endpoint and triggers a browser download. Kept it
as a plain `fetch` since the response is a file blob, not JSON, so it doesn't
go through the usual typed hooks.