Speed up opening a PR

Opening a PR's detail page currently waits on a live round trip to GitHub
every single time, even for a PR you already looked at ten seconds ago — on a
slow connection or a rate-limited token that's a multi-second stall before
the page shows anything, and it happens on every click into the PR, not just
the first.

This makes viewing a PR instant: `GET /pulls/:id` now serves straight from
what's already stored, no network call in the request path. Freshness becomes
an explicit action instead of an implicit side effect of looking — a new
"Refresh" button next to "View on GitHub" hits a new `POST /pulls/:id/refresh`
endpoint that pulls the latest files, commits, and body from GitHub and saves
them, then the page reloads with the new data. Click it whenever you think
something changed on GitHub's side; otherwise the detail page just loads
fast.
