---
name: dependencies-checker
description: Audits the npm dependencies of every package in this repo (server, client, reviewer-core, e2e, mcp-server) and reports how the packages depend on each other, what each one depends on by type (prod or dev; runtime, types or build tool), how much each installed dependency and each node_modules weighs, version drift across packages, stale installs and possibly unused dependencies, with a Mermaid map and prioritized recommendations at the end. Use it whenever someone asks about dependencies, packages, node_modules size, what is heavy, what can be removed, version drift (for example zod 3 vs 4), unused packages, a dependency audit or cleanup, or says "залежності", "скільки важить", "що можна викинути", "аудит пакетів", even if they name only one package. Read-only. Not for adding or upgrading one dependency (use the package manager) or for import boundaries inside server/ (onion-architecture).
metadata:
  version: 1.0.0
---

# dependencies-checker

Produces one structured report a developer can act on. Every number in it comes from the
collector's JSON, so two runs on the same tree give the same facts; your judgement goes into the
findings and the priorities.

**Read-only.** Never install, update, dedupe or audit-fix, and never edit a `package.json` or a
lockfile: those change only through the package manager, in a change of their own. When something
isn't installed, report it; don't install it to get a number.

## 1. Collect

```sh
python3 <this skill's folder>/scripts/collect_deps.py <repo root> --json <scratch dir>/deps.json
```

It finds every package (skipping `node_modules`, `.claude/`, `.skill-evals/`, `server/clones/`) and
records, per package: declared deps by type and kind, installed version and **own installed size**
of each direct dep (its directory without its own deps, so a pnpm store or hoisted tree is counted
once), total `node_modules` size and installed package count, install health, possibly unused deps,
and internal links (tsconfig path aliases, the mirrored `vendor/shared` copy, HTTP clients of the
API). Across packages it lists deps declared more than once and flags major-version drift. The
`mermaid` field is a ready graph. No network.

## 2. Check before you claim

- **Possibly unused** means no import, script, peer or config reference was found. Before you
  recommend removing one, grep for it yourself and quote what you found (or didn't). Transitive
  helpers declared directly (a plugin's own dependency) are "declared but only used through X".
- **Sizes** are installed disk size, not bundle size. Say so once in the report; a 150 MB `next`
  is not 150 MB shipped to users.
- **Not installed / stale**: a package without `node_modules` gets "n/a" for sizes; a declared dep
  missing from `node_modules` means the install is older than `package.json`. Both are findings.
- Network checks (`pnpm outdated`, `npm audit`) only when asked, labelled as such.

## 3. Prioritize

Every recommendation carries a priority, the package, the dependency, the evidence and one action.

| Priority | Use it for |
|---|---|
| **P0**, fix now | Something is broken or will break: a declared prod dep missing from the install; a major-version split in a library that crosses packages through shared code (a contract schema read by two packages on different majors); a vulnerability, if an audit was run |
| **P1**, plan it | Real cost: a prod dep with no usage found; a dev-only tool declared as prod; a heavy prod dep (own size over ~20 MB) that has a lighter or narrower option; a major split that doesn't cross packages |
| **P2**, hygiene | Possibly unused dev deps, deps declared directly but used only through another, `@types/*` out of step with their library, packages not installed locally |

Order recommendations P0 → P2, then by size of the win.

## 4. Report

Use the template in `references/report-template.md` exactly: same sections, same order, tables
where it has tables. Keep the Mermaid map to about 25 nodes: all packages and their links, plus the
heaviest few prod deps. Give the report in your reply; write it to a file only where the user asks.
End with the method and its limits, in two or three lines.
