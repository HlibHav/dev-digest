Add a "Dismiss all suggestions" bulk action to the findings panel

Reviewers who only care about warnings and criticals currently have to dismiss
every suggestion-level finding one at a time with `d`, which gets tedious on a
PR with a lot of style nits.

This adds a `POST /pulls/:id/findings/dismiss-suggestions` route (nothing
meaningful to return, so it's a 204) plus a client mutation and a button in
the findings toolbar that calls it. On success we invalidate the findings
query so the panel refreshes without a full reload.