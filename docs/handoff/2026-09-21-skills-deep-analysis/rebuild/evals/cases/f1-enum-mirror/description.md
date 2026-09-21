Add a `needs_discussion` verdict for non-blocking design concerns

Right now every review has to resolve to `approve`, `comment`, or `request_changes`,
but a chunk that raises a genuine design or architecture question doesn't fit any of
those cleanly — it isn't a blocking defect, but forcing it into `comment` buries it
next to typo-level notes where nobody reads it twice.

This adds a fourth verdict, `needs_discussion`, for exactly that case: substantive
but subjective findings the author and reviewer should talk through rather than
mechanically fix. The map-reduce reducer now ranks it between `comment` and
`request_changes`, so a single chunk that raises it doesn't get silently
overridden when the other chunks in the same PR come back clean.

Agents can start returning it whenever a finding reads more like "let's discuss"
than "please fix".