Flag PRs with a merge conflict in the list

Right now a PR that's fallen out of sync with its base branch just looks like
any other open PR in the Pull Requests list — you only find out it can't be
merged once you click into it and check GitHub directly, which wastes a trip
for something the list could show at a glance.

This adds a `merge_conflict` field to the PR-list response, computed the next
time a repo's PRs sync from GitHub. It's `null`/absent until the first sync
after this ships, and every existing consumer that doesn't know about the
field keeps working exactly as before — this is groundwork only, the actual
list-view badge is a follow-up PR once design has a mock ready.
