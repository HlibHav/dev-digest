Link straight to a PR's findings from the list

A dashboard widget we're building needs to link a PR straight to its latest
review's findings tab, but today it has to reconstruct that URL by hand from
the repo id and PR number and hope the query params don't drift from what the
PR detail page actually expects.

This adds a `reviewUrl` field to each row of the PR-list response: a
ready-to-use path straight to the findings tab of the PR's latest review, or
`null` when the PR hasn't been reviewed yet. Saves every consumer from
hand-building the link and keeps it in one place if the detail page's routing
ever changes.
