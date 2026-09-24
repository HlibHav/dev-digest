
# Deprecation policy

Removing something is easy and the cost lands on someone else. A public surface
leaves in two steps, never one: announce, then remove — with a release in
between so callers can move.

## Flag

- A public export, route, field, or config key deleted in the same release it
  was first called unwanted.
- A `@deprecated` marker with no replacement named and no removal version.
- A replacement shipped with no deprecation on the thing it replaces, so two
  ways to do one thing exist with nothing saying which wins.
- A deprecation whose stated removal version has passed and which is still here.

## The shape of a good deprecation

1. The replacement exists and works.
2. The old surface keeps working and says, in one line, what to use instead and
   when it disappears.
3. Removal happens in a later release, and the changelog names it.

## Good / bad

Bad — the field is simply gone, and the caller finds out in production:

```ts
export const PrMeta = z.object({
-  head_sha: z.string(),
+  head_ref: z.string(),
});
```

Good — both exist for one release, the marker names the replacement AND the
removal, so the next reviewer can delete it with confidence:

```ts
export const PrMeta = z.object({
  head_ref: z.string(),
  /** @deprecated use `head_ref`. Removed in v3.0. */
  head_sha: z.string(),
});
```

## Severity

- `critical` — a silent removal of a public surface.
- `warning` — a `@deprecated` with no replacement or no removal version.
- `suggestion` — a deprecation past its stated removal date.

## Do not flag

Deleting something that was never exported, or that the same diff introduced.