Let a finding reference the other findings it relates to

Reviewers keep asking for a way to tell that two findings from the same run
are connected — e.g. a "missing null check" finding that's really the root
cause of a "possible crash" finding three files over. Right now each finding
stands alone with no way to link them, so a reader has to notice the
connection themselves.

This adds an optional `related_finding_ids` array to the `Finding` contract,
mirrored in both the server and client copies of the shared contract as
usual. It's optional so nothing about today's findings changes shape — an
agent that doesn't set it (which is all of them, for now) behaves exactly as
before, and the findings panel silently ignores it until a later PR adds the
UI to actually render the links.
