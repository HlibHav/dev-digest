# Semver discipline

Decide what the change costs a consumer, and say which version bump it forces.
The question is never "how big is the diff" — it is "what breaks if someone
upgrades without reading".

## The rule

- **major** — an existing caller that changes nothing now behaves differently or
  fails: a removed or renamed field, a new required input, a narrowed type, a
  changed status code, a changed default that alters an outcome.
- **minor** — new capability, nothing existing moves: a new route, a new
  optional field, a new enum member on INPUT only.
- **patch** — behaviour already documented, now actually true: a bug fix with no
  shape change.

Route a version bump by the WORST change in the diff. One major forces a major,
however many minors surround it.

## How to report

State the bump the diff forces, quote the single change that forces it, and say
whether the version in `package.json` matches. A diff that earns a major and
bumps a patch is itself the finding.

## Good / bad

Bad — a major change shipped as a patch, so consumers upgrade silently:

```diff
- "version": "2.4.1",
+ "version": "2.4.2",
- app.get('/repos/:id/pulls', …)
+ app.get('/repos/:id/pull-requests', …)
```

Good — the bump matches the worst change, and the reason is written down:

```diff
- "version": "2.4.1",
+ "version": "3.0.0",
  # CHANGELOG: BREAKING — /repos/:id/pulls is now /repos/:id/pull-requests.
```

## Severity

- `critical` — a major-forcing change released as minor or patch.
- `warning` — a minor-forcing change released as patch.
- `suggestion` — the bump is right but the changelog does not say why.

## Do not flag

An internal refactor behind an unchanged public surface — that is a patch, and
a patch is what it should get.