# R3 — API contract domain: standards, machine-checkable catalogues, house policy

Researcher: R3 (api-contract-domain). All sources below were fetched and read (WebFetch), not
taken from search snippets. Repo evidence was read directly from this worktree.

## 1. Most actionable principles (tied to sources and to findings 1–6)

1. **Encode only what a diff-only, non-reasoning reader cannot already know.** The universal
   breaking-change catalogue (SemVer 2.0.0, Google AIP-180, GitHub's breaking/non-breaking list,
   oasdiff's 300+ rules, Buf's rules) is textbook material a mid-size model likely already has —
   this is exactly what finding 1 measured (59% of the 56 existing rules are general knowledge).
   A skill's entire payload should be the ~9 un-inferable repo facts in §3 below, cited by
   `path:line`, not prose paraphrase — the path:line *is* the checkable, non-generic content.
2. **Where the literature disagrees, that disagreement is the policy-dependent boundary — state
   it, don't default to it.** Concrete case: adding a new enum member to a *response* field.
   GitHub's own docs list "Adding enum values" under non-breaking; oasdiff's default rule set
   marks it breaking unless the enum is `x-extensible-enum`; Zalando's Rule 108 makes it safe by
   requiring clients to tolerate unknown values. A skill must name which answer *this org* picked
   and tie severity to that, instead of leaving it to whichever way the base model leans (ties to
   finding 5 — severity has no anchor).
3. **Scope every "Do not flag" to the rule(s) it exempts, in the same sentence.** Finding 2 showed
   one skill's exemption ("an internal refactor is a patch") silently vetoed an unrelated skill's
   catch (breaking-change: 0/6, restored to 6/6 once removed). Nothing in the prompt tells the
   model an exemption is local — so the skill text has to.
4. **Put the un-inferable repo fact first, not last, and prefer one skill over five.** Finding 3/5
   showed catch rate depends on skill count and position independent of content quality (moving
   the key skill last restored a catch that 5-skills-together missed). If skills are consolidated,
   the envelope shape, the casing map, workspace scoping, and the GET-that-writes fact (§3) belong
   at the top.
5. **Pair every un-inferable rule with a real before/after snippet from this repo's own files**,
   not an abstract description. Finding 4 showed a terse repo convention fired 6/6 on a reasoning
   provider, 0/6 on two non-reasoning ones, and that rewriting it as "an explicit check" alone
   barely helped. Buf and oasdiff both externalize rules as literal, nameable checks
   (`FIELD_NO_DELETE`, rule IDs) — the repo's own `BREAKING_CHANGE_GATE` skill already does this
   with ```ts before/after``` blocks; extend that pattern to the repo-fact rules, which currently
   don't get it.
6. **Reserve CRITICAL for rules that are both universally breaking *and* un-inferable.** Only
   CRITICAL blocks the merge, yet the existing `API_CONTRACT_CONVENTIONS` skill rates "contract
   changed on one side only" as `warning` (seed-skills.ts:199) and the deprecation/response skills
   rate most repo-specific misses as `warning` too — this is finding 5's exact failure mode.
   "Shared contract edited on one side only" and "a GET route's write side-effect changed" should
   move to critical: they are the costliest-to-miss, cheapest-to-state facts in §3.
7. **Treat "semantics" as its own category, staffed entirely by named repo facts** — no
   schema-diff tool surveyed here (oasdiff, Buf) can see behavior, only shape, because neither
   tool has "the codebase," only two schema snapshots. The one example already living in this
   repo — `GET /repos/:id/pulls` and `GET /pulls/:id` silently trigger a GitHub sync/DB write
   (`server/AGENTS.md`, `client/AGENTS.md` gotchas) — is the right *shape* for a semantics rule:
   name the exact route and the exact hidden effect. A generic "flag semantic changes" line (the
   current `BREAKING_CHANGE_GATE`'s "Semantics" bullet) is the general-knowledge restatement
   finding 1 says does nothing.
8. **Add the one genuinely new, cheap, currently-missing machine-checkable signal**: the
   Deprecation/Sunset header pair (RFC 9745 + RFC 8594, used verbatim by GitHub and Zalando). The
   repo's seeded `DEPRECATION_POLICY` skill checks only changelog/`@deprecated`-comment discipline
   and never the actual runtime signal a real deprecation emits — a real gap, not a restatement,
   and gate-able by a simple diff grep.

## 2. Consolidated breaking-change catalogue

Built from AIP-180/181/185, Microsoft Azure REST API Guidelines (vNext), Zalando's
`compatibility.adoc`, GitHub's breaking-changes doc, oasdiff's rule set, Buf's rule set, and
SemVer 2.0.0. "Universal" = every source surveyed agrees; "most policies" = the default position
of nearly all sources, with a stated carve-out somewhere; "policy-dependent" = sources actively
disagree or explicitly hand the choice to the API owner.

| # | Category | Change | Verdict | Sources agreeing |
|---|---|---|---|---|
| 1 | Request | New required field/param/header on an existing route | **Universally breaking** | SemVer(major), AIP-180, MS Azure, GitHub, oasdiff, Buf(required-field rules) |
| 2 | Request | Existing optional field becomes required | **Universally breaking** | Same set as #1 |
| 3 | Request | Field/param removed or renamed | **Universally breaking** | AIP-180 (rename = remove+add), GitHub, Zalando, Buf (`FIELD_NO_DELETE`, `FIELD_SAME_NAME`), oasdiff |
| 4 | Request | New optional field/param/header added | **Universally safe** (not breaking) | AIP-180, GitHub, oasdiff, Zalando Rule 107 |
| 5 | Request | Narrower type / stricter validator on an existing field | **Breaking under most policies** | GitHub ("adding a new validation rule…"), oasdiff, AIP-180 — but AIP-180/Zalando carve out "reduce enum range if server still accepts old values" |
| 6 | Request | New accepted enum value on an input field | **Policy-dependent, leans safe** | AIP-180 allows for input-only schemas; Zalando requires servers accept unknowns; but a closed/strict validator (this repo's zod schemas, Buf's typed enums) can still reject it |
| 7 | Response | Field removed, renamed, or retyped | **Universally breaking** | All sources; Buf: "changing a field's type breaks everything" |
| 8 | Response | Field becomes nullable/optional where callers dereference it today | **Universally breaking** | oasdiff, AIP-180 (output-only fields must stay populated), this repo's `RESPONSE_SCHEMA` skill |
| 9 | Response | New optional field added | **Universally safe** | GitHub, oasdiff, AIP-180 |
| 10 | Response | New enum value added to an existing field | **Policy-dependent (flagship disagreement)** | GitHub: explicitly non-breaking; oasdiff: breaking by default unless `x-extensible-enum`; Zalando: safe *only if* Rule 108 (clients tolerate unknowns) is enforced |
| 11 | Response | List shape changes (bare array → paginated object) | **Universally breaking** | Type-change rule applies transitively (array→object); this repo's own skills |
| 12 | Status codes | Changed success status on existing behavior (200→201/204) | **Universally breaking** | oasdiff, this repo's `BREAKING_CHANGE_GATE`; no source treats it as safe |
| 13 | Status codes | A previously-documented status/response option is withdrawn | **Breaking under most policies** | oasdiff: "withdrawing response options is breaking even though narrower" |
| 14 | Status codes | A new, previously-undocumented status code becomes possible | **Policy-dependent** | Depends on whether clients are required to fall back gracefully by status-code class; no source in this set states a universal rule |
| 15 | Errors | Error body **shape/envelope** itself | **Policy-dependent by construction** | No standard surveyed defines a universal error envelope (Google, Microsoft, Zalando, Stripe and GitHub each define their own); RFC 7807 (Problem Details) exists as an attempt but none of the sources here adopt it as *the* standard |
| 16 | Errors | Machine-readable error `code` string changes for the same failure condition | **Breaking under most policies** | This repo's `BREAKING_CHANGE_GATE` (critical); implied by every vendor's own docs treating their error codes as part of the contract |
| 17 | Defaults | Default behavior changes for a caller that sends nothing | **Breaking under most policies** | SemVer's general definition, this repo's own rule; not itemized separately by AIP-180/GitHub/oasdiff, so it is inferred rather than directly stated by most |
| 18 | Semantics | Same shape, different behavior (soft-delete → hard-delete, a previously-ignored filter now applies) | **Not machine-checkable by any surveyed tool; breaking by definition (SemVer/AIP-180), but requires domain knowledge no schema diff carries** | SemVer ("incompatible API changes"), AIP-180 ("code unaware… continues functioning identically") — but oasdiff/Buf, being schema diffs, structurally cannot see this category at all |

## 3. House policy in this repo (read-only; path:line evidence; inferable-from-diff? assessed)

1. **Error envelope `{ error: { code, message, details } }` for every API error.**
   `server/src/platform/errors.ts:4`, `server/src/vendor/shared/contracts/platform.ts:285-292`
   (`ApiErrorBody` zod schema), `server/src/app.ts:132,155,162` (error handler always sends this
   shape), `server/src/db/seed-skills.ts:185`. **Not inferable** from a route-only diff — only
   from seeing `platform.ts`/`app.ts` in context.
2. **JSON fields snake_case (`head_sha`, `cost_usd`), Drizzle/TS properties camelCase, mapped in a
   helper, not inline.** `CLAUDE.md:74-76`, `seed-skills.ts:177-179`. **Not inferable** — a generic
   model reviewing a new response field named `headSha` would see idiomatic JS/TS and would not
   flag a casing-convention break.
3. **Validation failures return 422 (not 400), via `ValidationError`/zod issues.**
   `server/src/platform/errors.ts:25-29`, `server/src/app.ts:126-149`. **Partially inferable** —
   the 404/422 split is common REST practice, but that *this* codebase's specific classes and
   the zod-error-handler path are the only sanctioned way to produce it is repo-specific.
4. **`:id` addressing a row uses the shared `IdParams` (uuid) schema; a name-like `:id` (provider,
   section) gets its own enum schema.** `seed-skills.ts:174-176` (`API_CONTRACT_CONVENTIONS` rule
   2). **Not inferable** — purely an internal schema-reuse convention.
5. **Contract types live in `server/src/vendor/shared/contracts/` and are hand-mirrored to
   `client/src/vendor/shared`, with no sync script — one side changing alone is a silent drift.**
   `.claude/rules/shared-contracts.md`, `seed-skills.ts:187-189, 223-224`, `client/AGENTS.md`
   ("this copy is not canonical… Change the server copy first"). **Not inferable** from a diff
   that touches only one copy unless the model already knows both copies exist and is shown both
   paths — the single clearest "repo fact a model cannot infer from a diff" in this codebase.
6. **zod schemas doubling as LLM structured-output schemas (`strict: true`) must use `.nullish()`
   / `.nullable()` for optional fields — `.optional()` silently becomes required (console warning
   only, no error).** `.claude/rules/shared-contracts.md`. **Not inferable at all** — a fact about
   OpenAI structured-output semantics applied to this repo's specific `Review`/`Finding` schemas
   in `contracts/findings.ts`. This is exactly finding 4's "terse repo fact that needs an explicit
   check to fire on non-reasoning backends."
7. **Enum values are stored as plain text in DB columns and rendered verbatim by the client —
   renaming a stored value needs a data migration *and* a UI copy change, not just a schema
   edit.** `.claude/rules/shared-contracts.md`. **Not inferable** — nothing in a contracts-only
   diff reveals the storage representation.
8. **`POST` that creates returns 201.** `seed-skills.ts:186`. **Mostly inferable** — this is
   standard HTTP convention a generic model likely already applies; lower value as a "fact," but
   still worth stating as an explicit check per finding 4.
9. **Workspace scoping is mandatory: every handler resolves `getContext(container, req)` first
   and every query filters by workspace — a row fetched by id alone is a cross-tenant read.**
   `seed-skills.ts:181-183`. **Not inferable** — requires knowing the data model is
   multi-tenant by workspace, which isn't visible in a route/contract diff alone.
10. **`pulls/`, `polling/`, `settings/`, `workspace/` are grandfathered exceptions to the
    routes→service→repository layering (SQL directly in `routes.ts`) — don't extend the pattern.**
    `seed-skills.ts:205-206`, `server/AGENTS.md` ("don't copy that pattern into new modules").
    **Not inferable** — a generic reviewer would otherwise correctly flag the existing pattern as
    a layering violation; the exception is a pure allowlist fact (see MEMORY.md's
    `skill-needs-grandfathering-clause` entry for this repo).
11. **`GET /repos/:id/pulls` and `GET /pulls/:id` are not pure reads — they trigger a GitHub sync
    and write to the DB as a side effect.** `server/AGENTS.md`, `client/AGENTS.md` gotchas.
    **Not inferable** — GET is conventionally assumed idempotent/side-effect-free; this repo
    deliberately violates that, and no schema diff shows it. This is the concrete instance of
    catalogue row #18 (semantics) above.

## 4. Sources

1. **AIP-180: Backwards Compatibility** — Google / aip.dev (official standard/design doc, org
   maintained). `https://google.aip.dev/180`. Undated (living doc). Takeaways: new fields/enum
   values may be added without breaking unaware clients; new required fields on existing
   messages/resources are forbidden; removal/rename is prohibited in-version (rename ≈
   remove+add); resource names must never change even across major versions. Quote: "New required
   fields must not be added to existing request messages or resources." Relation: **supports
   finding 1** (this is exactly the general-knowledge catalogue the measurement found already
   restated); **extends finding 5** via its severity anchor (stability level, see AIP-181).
2. **AIP-181: Stability Levels** — Google / aip.dev. `https://google.aip.dev/181`. Undated.
   Takeaways: alpha/beta/stable each carry a different compatibility guarantee and required
   notice period; stable forbids breaking changes except with governance-level exception treated
   "with equal or greater gravity as creating a new major version." Relation: **extends finding
   5** — shows an external system where severity is anchored to a declared stability level per
   surface, which this repo's skills don't have (severity floats without such an anchor).
3. **AIP-185: API Versioning** — Google / aip.dev. `https://google.aip.dev/185`. Undated.
   Takeaways: expose only major versions (no minor/patch in the API surface); a new major version
   must not depend on a previous one; channel-based (alpha/beta/stable) versioning preferred over
   parallel version numbers; beta needs 180 days' notice before removal. Relation: **new** — the
   channel-versioning concept isn't present anywhere in this repo's skills or code.
4. **Microsoft Azure REST API Guidelines (vNext)** — Microsoft / Azure org (official guidelines,
   binding on Azure services). `https://raw.githubusercontent.com/microsoft/api-guidelines/vNext/azure/Guidelines.md`.
   Undated (vNext, actively maintained). Takeaways: breaking changes include new required fields
   past v1, removed enum values, required→optional flips; versioning is a **required query
   parameter** `api-version` (`YYYY-MM-DD[-preview]`), explicitly **not** a URL path segment;
   deprecation needs a Breaking-Change-Review-Board-approved `azure-deprecating` header naming a
   retirement date; previews must go GA or be removed within 1 year. Relation: **supports finding
   1** (overlaps heavily with this repo's existing `BREAKING_CHANGE_GATE`); **new** mechanism
   (query-param versioning + governance-gated header) absent from this repo.
5. **Zalando RESTful API Guidelines — Compatibility** — Zalando SE (engineering org guidelines).
   `https://github.com/zalando/restful-api-guidelines/blob/main/chapters/compatibility.adoc`.
   Undated, actively maintained. Takeaways: input-only schemas may add optional fields and extend
   enums; output-only schemas may add fields but must never extend enum ranges without client
   opt-in; Rule 108 (MUST): "clients must tolerate unknown fields and extensible enums." Relation:
   **new** — direct evidence for the policy-dependent "new response enum value" case in §2 row 10,
   and a concrete counter-example to treating enum additions as universally safe or universally
   breaking.
6. **Zalando RESTful API Guidelines — Deprecation** — Zalando SE.
   `https://github.com/zalando/restful-api-guidelines/blob/main/chapters/deprecation.adoc`.
   Undated. Takeaways: deprecation must be part of the OpenAPI spec (`deprecated: true` +
   description of the alternative); producers must get all clients' consent on a sunset date
   before shutdown; both `Deprecation` and `Sunset` headers are used, using the earliest
   affected-element date. Relation: **new** — this repo's `DEPRECATION_POLICY` skill has no
   header-based signal at all, only changelog/comment discipline.
7. **RFC 8594 — The Sunset HTTP Header Field** — Erik Wilde / IETF (informational RFC).
   `https://www.rfc-editor.org/rfc/rfc8594.html`. Published May 2019. Takeaways: a single
   HTTP-date value signaling a resource will become unresponsive; explicitly a *hint*, not a
   guarantee; appropriate only for the "resource genuinely stops working" stage, not the earlier
   "still works but not preferred" stage. Quote: "indicates that a URI is likely to become
   unresponsive at a specified point in the future." Relation: **new** — no equivalent runtime
   signal exists in this repo's deprecation handling.
8. **RFC 9745 — The Deprecation HTTP Response Header Field** (formerly
   `draft-ietf-httpapi-deprecation-header`) — IETF HTTPAPI working group (Standards Track RFC).
   `https://www.rfc-editor.org/rfc/rfc9745.html` (confirmed published version; draft -09 also read
   at `https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-deprecation-header-09`). Published
   March 2025. Takeaways: value is a Structured-Fields Date (e.g. `@1688169599`), not a boolean;
   its timestamp must not be later than the paired `Sunset` header's; also defines a
   `deprecation` link relation for pointing at migration docs. Quote: "Signal to consumers of a
   resource that it will be or has been deprecated." Relation: **new**; directly usable to close
   the gap named in principle 8 above.
9. **oasdiff — OpenAPI Breaking Changes: The Complete List of Rules** — Tufin/oasdiff project
   (tool docs, open source, 300+ rules). `https://www.oasdiff.com/docs/breaking-changes`.
   Undated (actively released tool). Takeaways: severity is assigned per check and is explicitly
   **overridable per-org via a severity-levels file** ("if a check's default severity does not
   match your API's compatibility policy, you can raise, lower, or disable it per check"); a
   `readOnly`/`writeOnly` property is provably safe to restrict because it can never appear on the
   other side of the wire; enum additions are breaking by default unless `x-extensible-enum` is
   used. Relation: **supports finding 1** (this is the exhaustive general catalogue); **extends
   finding 5** — externalizes exactly the "policy overrides a specific rule's severity" mechanism
   this repo's skills lack (they instead use blanket `## Do not flag` sections, which finding 2
   showed leak across skills). Not verified beyond the fetched summary page (did not independently
   audit all 300+ individual rule pages).
10. **Buf — Breaking Change Rules and Categories** — Buf Technologies (tool docs, protobuf/gRPC).
    `https://buf.build/docs/breaking/rules/`. Undated. Takeaways: four strictness tiers
    (FILE > PACKAGE > WIRE_JSON > WIRE) trade source-compat for wire-compat, chosen once per repo
    rather than per rule; renaming a field breaks FILE/PACKAGE and WIRE_JSON but not WIRE; changing
    a field's type breaks every tier. Relation: **supports finding 1**; **extends finding 5**
    differently from oasdiff — severity is a single upfront strictness-category choice rather than
    a per-rule override, a second concrete design this repo's skills could borrow from instead of
    the current "5 independent skills that veto each other."
11. **Stripe — APIs as infrastructure: future-proofing Stripe with versioning** — Stripe (company
    engineering blog). `https://stripe.com/blog/api-versioning`. Undated (present on Stripe's
    current blog). Takeaways: breaking = "removes or alters existing fields... fields should
    always preserve their same type and name"; new endpoints/fields are safe; every account is
    **pinned** to the API version live at signup and stays there until it explicitly upgrades;
    versions are dated (`YYYY-MM-DD`) rolling releases, not big-bang majors. Relation: **extends**
    — shows breaking-change *safety* engineered structurally (account pinning) rather than caught
    at review time, which reframes what a PR-time reviewer skill can realistically be responsible
    for versus what belongs to platform architecture.
12. **GitHub REST API — Breaking Changes** — GitHub (official product docs).
    `https://docs.github.com/en/rest/about-the-rest-api/breaking-changes`. Undated (current docs).
    Takeaways: explicit two-column list — breaking includes removing/renaming an
    operation/parameter/response field, new required parameter, optional→required, type changes,
    removed enum values, new validation rules, changed auth requirements; **non**-breaking
    explicitly includes "Adding enum values" and "Adding a response field." Relation: **supports
    finding 1** (near-identical to this repo's own `BREAKING_CHANGE_GATE`); **directly contradicts
    oasdiff's default** on response enum additions — the concrete evidence for catalogue row 10's
    "policy-dependent" verdict.
13. **GitHub REST API — API Versions** — GitHub (official product docs).
    `https://docs.github.com/en/rest/about-the-rest-api/api-versions`. Undated (current docs).
    Takeaways: date-based version string via required `X-GitHub-Api-Version` header (default
    `2022-11-28` if omitted); ≥24 months support after a newer version ships; `Deprecation`
    (RFC 7231 date) and `Sunset` (RFC 8594) response headers appear during the closing-down
    window; expired versions return `410 Gone`. Relation: **new** — a live, large-scale
    implementation of RFC 8594/9745 in production, reinforcing principle 8.
14. **Semantic Versioning 2.0.0** — Tom Preston-Werner et al. / semver.org (community-maintained
    standard). `https://semver.org/`. Spec dated 2013, in force. Takeaways: MAJOR = incompatible
    API changes, MINOR = backward-compatible additions, PATCH = backward-compatible fixes; "given
    a version number MAJOR.MINOR.PATCH, increment the: 1. MAJOR... 2. MINOR... 3. PATCH..."; the
    spec defines compatibility by contrast (does dependent code still work unchanged) rather than
    by an exhaustive rule list. Relation: **supports finding 1** — the most universally-known
    source in this set, and the direct ancestor of this repo's own `SEMVER_DISCIPLINE` skill,
    which is close to a restatement of it.

## 5. Open questions

- No source surveyed defines a universal error-body envelope (row 15) — worth confirming whether
  RFC 7807 (Problem Details) is relevant enough to this repo to research separately, since none of
  the three researchers' briefs mention it and this repo's own envelope diverges from it.
- Whether DevDigest's reviewer should ever be given oasdiff- or Buf-style per-rule severity
  overrides directly (as structured config, not a prose skill) is an architecture question outside
  this research brief's scope — flagging it for the orchestrator, not deciding it here.
