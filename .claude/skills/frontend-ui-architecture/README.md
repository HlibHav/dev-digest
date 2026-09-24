# frontend-ui-architecture — provenance and sources

Where the rules in [SKILL.md](SKILL.md) and [reference.md](reference.md) come from:
every source consulted, what each one contributed, where the sources contradict
each other, and which of those contradictions this skill had to settle by decision
rather than by citation.

Research date: 2026-09-20. Skill version 1.0.0.

## Version history

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-09-20 | First release. Codifies the existing `client/` architecture: route colocation, promote-on-second-route, per-component barrels. |

## Decisions taken, and why

The sources disagree on four points (see *Where the sources disagree* below). This
skill is prescriptive by design, so each was settled:

1. **Architecture: codify `client/`'s route colocation, not `src/features/`.** The
   canonical sources (bulletproof-react, FSD) prescribe a `src/features/` tree. This
   package does not use one, and a skill that contradicts every existing file would
   fire on every task. Next.js itself declines to prescribe a layout and asks only
   for consistency — that settles it in favour of what is already here.
2. **Barrels: keep one `index.ts` per component folder.** Against bulletproof-react,
   with two reasons stated in `reference.md`. The counter-argument is real and no
   source measures the cost either way.
3. **No enforcement mechanism shipped.** No path-scoped rule in `.claude/rules/`, no
   ESLint config. `client/` has no linter at all today; introducing one is a separate
   decision. The skill says so rather than pretending the boundaries are enforced.
4. **Naming: the repo's own scheme**, not the community colocation template. No
   authority exists on file naming; the one already in 36 component folders wins.

## Motivation

Two neighbouring skills exist in this repo, and neither answers the question.

| Skill | Covers | Does not cover |
|---|---|---|
| `react-best-practices` (SKILL.md 175 lines + examples.md 369) | anti-pattern catalogue with severity tags: derived state, `useEffect` misuse, memoization, keys, conditional rendering, a11y, error boundaries. Its `Code Organization` section is **four bullets** | directory trees, `constants/` vs `types/` vs `lib/` placement, import boundaries, promote-to-shared rule |
| `next-best-practices` (SKILL.md 153 + 20 topic files) | `file-conventions.md` covers **routing** only: `page.tsx`, `layout.tsx`, `route.ts`, segments, `(group)`, `@slot`, private `_folders` | where non-route code lives: `lib` / `utils` / `constants` / `types` / feature modules |

Planned negative scope for the new skill, to be stated in its frontmatter the way
the `zod` skill states its own:

- component-internal hygiene, hooks, anti-patterns → `react-best-practices`
- `app/` file conventions and RSC mechanics → `next-best-practices`
- performance → out of scope

The new skill owns: directory topology for non-route code, the colocate-then-promote
rule, constants / types / utils / business-logic placement, import boundaries
between features, and naming + barrel policy.

## How these sources were gathered

NotebookLM deep research (49 results, 43 imported), then three targeted
`notebook_query` passes — one per pair of research questions — each required to
name its source per claim. Four primary sources the deep research missed were
fetched directly and read: the Next.js project-structure page, Kent C. Dodds on
colocation, the Redux style guide, and the React docs on Effects. Two heavily
cited sources (bulletproof-react `project-structure.md`, the FSD overview) were
re-fetched and read directly rather than trusted through the summary.

Notebook: [React/Next.js frontend architecture — file layout, business logic placement, import boundaries (2026-09)](https://notebooklm.google.com/notebook/d75a0db8-75be-45d8-86b7-9496ffe24e75)

Every URL below was opened — through NotebookLM's own fetch or through a direct
read. Sources returned by the research but not usable (an Obsidian plugin page, a
Stack Overflow tag listing, a "hand-picked resources" link farm, a Remix data-loading
piece) are not listed.

## Sources by question

### Q1 — Where components live: directory topology

- [Project structure and organization — Next.js docs](https://nextjs.org/docs/app/getting-started/project-structure) — read directly. The official position is that Next.js is **unopinionated**, and it names three strategies: store project files outside `app`, in top-level folders inside `app`, or split by feature/route. Also the normative colocation rule: a route is not public until `page.js`/`route.js` exists, so project files "can be **safely colocated** inside route segments", and private `_folder` opts a folder and all subfolders out of routing. The counterweight to every prescriptive methodology below.
- [project-structure.md — alan2207/bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — read directly. The full annotated `src/` tree (`app`, `assets`, `components`, `config`, `features`, `hooks`, `lib`, `stores`, `testing`, `types`, `utils`) and the feature tree (`api`, `assets`, `components`, `hooks`, `stores`, `types`, `utils`). The reference implementation of flat feature folders.
- [Overview — Feature-Sliced Design](https://feature-sliced.design/docs/get-started/overview) — read directly. The six layers with official one-line definitions (App, Pages, Widgets, Features, Entities, Shared; Processes deprecated), and the definitions of slices and segments.
- [Slices and segments — Feature-Sliced Design](https://feature-sliced.design/docs/reference/slices-segments) — the internal shape of a slice: `ui`, `model`, `api`, `lib`, `config`, and the rule that segments are named by purpose rather than by file type.
- [Structure Files as Feature Folders with Single-File Logic — Redux style guide](https://redux.js.org/style-guide/) — read directly. Priority B, Strongly Recommended: "most applications should structure files using a 'feature folder' approach", against the older folder-by-type layout. The oldest clear statement of the argument, with a concrete `/src/app` + `/src/features/todos` tree.
- [Colocation — Kent C. Dodds](https://kentcdodds.com/blog/colocation) — read directly. The maxim: "Place code as close to where it's relevant as possible", plus Dan Abramov's "Things that change together should be located as close as reasonable". Names the three benefits (maintainability, applicability, ease of deletion) and the specific failure of a global `utils/`.
- [The Ultimate Next.js App Router Architecture — Feature-Sliced Design](https://feature-sliced.design/blog/nextjs-app-router-guide) — how `app/` relates to a `src/` feature layer: route files stay thin and delegate to `src/pages/`. A full FSD-on-App-Router tree. Vendor-authored, so read as advocacy.
- [Feature-Based Architecture in React: A Structure That Scales Without Turning Into Chaos — alexey79, dev.to](https://dev.to/alexey79/feature-based-architecture-in-react-a-structure-that-scales-without-turning-into-chaos-32mo) — the `features/core/` idea: a domain-aware shared layer for things like `UserAvatar` or `PermissionGate` that carry business knowledge and therefore must not land in `shared/`. Fills a real gap between bulletproof and FSD.
- [Mastering Feature-Sliced Design: Lessons from Real Projects — dev.to](https://dev.to/arjunsanthosh/mastering-feature-sliced-design-lessons-from-real-projects-2ida) — the promotion rule stated as practice: code starts in the feature that created it and moves only on real multi-context reuse.
- [The Ultimate Frontend Project Structure Guide — Feature-Sliced Design](https://feature-sliced.design/blog/frontend-structure-best-practices) — the case against type-based folders: low cohesion, high coupling, circular dependencies. Vendor-authored.
- [Scalable React Application Architecture Guide — dev.to](https://dev.to/himanshusinghtomar/scalable-react-application-architecture-guide-43j7) — the type-folder failure mode described from the other direction, plus the conventional `/services/` role.

### Q2 — How components are split

- `~/.agents/skills/vercel-composition-patterns/` — **on disk, not a URL.** Vercel-authored, MIT, 8 rule files with `title`/`impact`/`tags` frontmatter: `architecture-avoid-boolean-props`, `architecture-compound-components`, `state-lift-state`, `state-context-interface`, `state-decouple-implementation`, `patterns-children-over-render-props`, `patterns-explicit-variants`, `react19-no-forwardref`. Answers "how is a component split" at the API level — composition over configuration, explicit variants instead of boolean modes. Its `rules/` + compiled `AGENTS.md` shape is also the best structural model available for a rules-based skill.
- [react-colocation — LobeHub skills marketplace](https://lobehub.com/skills/avayne2-skills-react-colocation) — the most explicit answer to "when does a component become a folder and what goes in it": `ComponentName.tsx`, `index.ts`, `useComponentName.ts`, `ComponentNameContext.tsx`, `componentName.types.ts`, `ComponentName.styles.ts`, `ComponentName.test.tsx`, `componentName.helpers.ts`, optional `ComponentName.container.tsx`. Community skill, not an authority — useful as a concrete template, its naming is one convention among several.
- [Colocation — Kent C. Dodds](https://kentcdodds.com/blog/colocation) — the brake on all of the above: don't extract before there is a real problem.
- [What happened to Components being just a visual thing? — dev.to](https://dev.to/redbar0n/what-happened-to-components-being-just-a-visual-thing-22hc/comments) — the "single unifying concern" framing for what one component should hold.
- [Feature Sliced Design: Stop Complicating Your App — feature-sliced.design](https://feature-sliced.design/vi/blog/what-is-feature-sliced) — page-first decomposition: split a page into layout blocks (widgets), interactions (features), and data objects (entities).

### Q3 — Where constants live

- [Slices and segments — Feature-Sliced Design](https://feature-sliced.design/docs/reference/slices-segments) — the `config` / `consts` segment: constants belonging to one slice live inside that slice.
- [Colocation — Kent C. Dodds](https://kentcdodds.com/blog/colocation) — a constant used by one module stays at the top of that module.
- [Structure Files as Feature Folders — Redux style guide](https://redux.js.org/style-guide/) — the feature-folder argument applies to constants as much as to components.
- [Feature-Sliced Design: Stop Complicating Your App](https://feature-sliced.design/vi/blog/what-is-feature-sliced) and [The Perfect Folder Structure for Scalable Frontend](https://feature-sliced.design/zh/blog/frontend-folder-structure) — global config and environment loading in `shared/config/` (`env.ts`, `constants.ts`).

**Thin.** No first-tier source treats constant placement as its own subject; the
rule has to be derived from the colocation and segment rules. See Gaps.

### Q4 — utils vs helpers vs lib vs services

- [Colocation — Kent C. Dodds](https://kentcdodds.com/blog/colocation) — the strongest statement of the problem: a utility in a global folder survives the deletion of its only consumer, because nobody can tell it is now dead. "Wasted effort and cognitive load."
- [project-structure.md — bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — the concrete split it actually ships: `lib` is "reusable libraries preconfigured for the application", `utils` is "shared utility functions", and each feature carries its own `utils`.
- [Slices and segments — Feature-Sliced Design](https://feature-sliced.design/docs/reference/slices-segments) — `lib` as the slice-internal segment for supporting code, distinct from `api` and `model`.
- [Layered Architecture: Still Relevant for Frontend? — feature-sliced.design](https://feature-sliced.design/blog/frontend-layered-architecture) — the purity requirement and the split between domain policies, application use cases, and infrastructure. Concrete paths: `domain/policies/canApplyDiscount.ts`, `application/useCases/placeOrder.ts`, `infrastructure/http/ordersRepoHttp.ts`.
- [10 anti-AI slop moves for frontend projects — Evil Martians](https://evilmartians.com/chronicles/ten-anti-ai-slop-moves-for-frontend-projects-going-faster-than-humans-can-review) — the hard constraint stated as a lint-able rule: business layers must never import components, pages, or hooks. Directly relevant to a skill meant to steer agents.
- [Scalable React Application Architecture Guide — dev.to](https://dev.to/himanshusinghtomar/scalable-react-application-architecture-guide-43j7) — the conventional `/services/` definition (API clients, side effects) that the layered sources argue against.

### Q5 — Where business logic lives, and import boundaries

- [You Might Not Need an Effect — react.dev](https://react.dev/learn/you-might-not-need-an-effect) — read directly. The official placement rule, and the only first-party source on the question. Effects are "an escape hatch from the React paradigm"; transform data at the top level of the component; "Use Effects only for code that should run *because* the component was displayed to the user"; user-event logic belongs in event handlers.
- [Put as Much Logic as Possible in Reducers — Redux style guide](https://redux.js.org/style-guide/) — read directly. Priority B: push state-calculation logic into the reducer rather than the click handler, because reducers are pure and testable.
- [Layered Architecture: Still Relevant for Frontend? — feature-sliced.design](https://feature-sliced.design/blog/frontend-layered-architecture) — pure policy functions decoupled from React, hooks as facades over them, data access isolated behind ports.
- [project-structure.md — bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — read directly. The unidirectional rule "shared -> features -> app", the statement that features should not import from each other but be composed at the application level, and the full `import/no-restricted-paths` zone config that enforces both.
- [Overview — Feature-Sliced Design](https://feature-sliced.design/docs/get-started/overview) — read directly. The two import laws, verbatim: "modules on one layer can only know about and import from modules from the layers strictly below", and "Slices cannot use other slices on the same layer".
- [javierbrea/eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) — the general-purpose enforcement tool: element types plus an allow/disallow policy matrix.
- [Migration Guide v6 → v7 — JS Boundaries](https://www.jsboundaries.dev/docs/releases/migration-guides/v6-to-v7/) — the v7 entity model (`element` / `file` / `module`), `rules` renamed to `policies`, `no-unknown` → `boundaries/no-unknown-dependencies`, `mode: "file"` deprecated in favour of `boundaries/files`. Needed so the skill does not ship a v6 config.
- [ESLint 9 support — issue #329](https://github.com/javierbrea/eslint-plugin-boundaries/issues/329) · [TypeScript Support — JS Boundaries](https://www.jsboundaries.dev/docs/guides/typescript-support/) — flat-config support landed in v5, and TS path aliases need `eslint-import-resolver-typescript` under `settings["import/resolver"]`.
- [Exercise 6: Architectural Linting — Steve Kinney, Enterprise UI](https://stevekinney.com/courses/enterprise-ui/architectural-linting-exercise) — a working flat-config `boundaries/element-types` matrix, plus TypeScript project references as a second, compiler-level enforcement layer.
- [Architecture boundaries — ttsc](https://ttsc.dev/docs/lint/rules/boundaries/) and [eslint-plugin-import-boundaries](https://www.jsdelivr.com/package/npm/eslint-plugin-import-boundaries) — alternative enforcers; the latter ships `no-wildcard-barrel` and `index-sibling-only`, which are the barrel question turned into lint rules.

### Q6 — Next.js: RSC as an architectural boundary

- [Project structure and organization — Next.js docs](https://nextjs.org/docs/app/getting-started/project-structure) — read directly. Private folders, route groups, the optional `src` folder, and the three organization strategies.
- [Server and Client Boundary — Next.js docs](https://nextjs.org/docs/app/guides/server-and-client-boundary) — the boundary as a split of the module graph: the client graph cannot import the server graph, props crossing it must be serializable, and a Server Component can be passed into a Client Component as `children` without entering the client graph.
- [The Ultimate Next.js App Router Architecture — Feature-Sliced Design](https://feature-sliced.design/blog/nextjs-app-router-guide) — the division of labour between route handlers (webhooks, third-party integrations, client polling) and Server Actions (UI-driven mutations, owned by the feature slice, paired with `revalidateTag`). Vendor-authored.
- [Edge Runtime vs Node.js Runtime — dev.to](https://dev.to/pockit_tools/edge-runtime-vs-nodejs-runtime-when-your-serverless-functions-mysteriously-fail-14a) — runtime choice as a constraint on where server-only code can live.

## Where the sources disagree

Four live disagreements. The skill has to take a position on each; they are not
resolved here.

1. **Barrel files.** FSD and the colocation template require an `index.ts` public
   API per slice or component folder. bulletproof-react says the opposite,
   verbatim: "In the past, it was recommended to use barrel files to export all
   the files from a feature. However, it can cause issues for Vite to do tree
   shaking and can lead to performance issues. Therefore, it is recommended to
   import the files directly."
2. **Granularity.** FSD separates `entities` / `features` / `widgets` as distinct
   layers; bulletproof keeps one flat `features/<name>/` folder with everything in it.
3. **Cross-feature domain sharing.** FSD pushes shared domain code *down* to
   `entities/`; the dev.to feature-architecture piece adds a `features/core/`
   layer instead, on the grounds that `shared/` must stay business-agnostic.
4. **When to abstract.** Kent C. Dodds says wait for a real problem. FSD and the
   colocation template scaffold the segment folders up front. Next.js itself
   declines to pick: "choose a strategy that works for you and your team and be
   consistent across the project."

## Gaps

- **Constant placement (Q3)** has no dedicated first-tier source. Everything
  listed is inference from the colocation principle and the FSD segment rule.
- **`utils` vs `helpers` (Q4)** — no source defines the distinction. Kent C. Dodds
  argues against the global folder, bulletproof ships both `lib` and `utils`
  without stating a criterion, FSD renames the problem to `lib`. The skill will
  have to legislate this rather than cite it.
- **Naming conventions** — only the LobeHub colocation skill gives a full file
  naming scheme, and it is a community source. No authority found.
- **Barrel-file costs** are asserted (tree-shaking, circular imports, dev-server
  and test slowness) but no source provides a measurement.
- FSD sources dominate the imported set, and roughly a dozen of them are
  `feature-sliced.design` blog posts or downstream restatements. Treat the weight
  of FSD in the source list as sampling bias, not as consensus.

## One project's instantiation: dev-digest `client/`

This repo's own `client/` is a live example, but it is an **illustration, not the
norm**. Split deliberately:

**Generalizes.** Route files stay thin and the screen lives in a named component.
`_components/<PascalName>/` as the unit: `<Name>.tsx` + `<Name>.test.tsx` +
`index.ts` + optional `constants.ts` / `helpers.ts` (+ `helpers.test.ts`);
it recurses through nested `_components/`. Promotion to `src/components/<kebab-name>/`
when a component is used across routes. Route-level `constants.ts` / `helpers.ts`
beside `page.tsx` when several sibling `_components` share them. Helpers are pure,
typed against the shared contracts, and unit-tested without React. One fetch client
(`src/lib/api.ts`), one hook layer (`src/lib/hooks/*` split by domain); components
never fetch.

**Local to this project, do not generalize.** `styles.ts` exporting an inline-style
object `s` typed `CSSProperties` (postcss is present, Tailwind is not used).
`var(--warn)` CSS custom properties stored in constants. Vendored
`@devdigest/shared` contracts mirrored from the server. next-intl
namespace-per-file with `labelKey` in constants instead of text.

**Anti-example.** 55 of 118 `.tsx` files under `src/` carry `"use client"` (63 across
all `.ts` + `.tsx`), `find src/app -name route.ts` returns 0, and there is no
server-side fetching, because the API is a separate Fastify service. The central Next.js architecture question — where the RSC boundary goes —
is simply absent from this codebase. Q6 has to be answered from the external
sources above, never from this repo.

## Appendix — every link the research returned

NotebookLM deep research returned 49 results; 43 imported into the notebook. The
curated list above is the subset the skill actually rests on. This is the full set,
so nothing is hidden: **used** means it backs a rule or is cited above, **unused**
means it was read and rejected as off-topic, a downstream restatement, or a link farm.

| # | Source | Used |
|---|---|---|
| 0 | Enterprise React and Next.js Architecture: Scalable Frontend Codebases and Directory Structures (2025–2026) (NotebookLM's own generated report — not an external source) | — |
| 1 | [Overview - Feature-Sliced Design](https://feature-sliced.design/docs/get-started/overview) | used |
| 2 | [Feature-Based Architecture in React: A Structure That Scales Without Turning Into Chaos](https://dev.to/alexey79/feature-based-architecture-in-react-a-structure-that-scales-without-turning-into-chaos-32mo) | used |
| 3 | [react-colocation \| Skills Marketplace - LobeHub](https://lobehub.com/skills/avayne2-skills-react-colocation) | used |
| 4 | [Slices and segments - Feature-Sliced Design](https://feature-sliced.design/docs/reference/slices-segments) | used |
| 5 | [project-structure.md - alan2207/bulletproof-react - GitHub](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | used |
| 6 | [Feature-Sliced Design: Stop Complicating Your App](https://feature-sliced.design/vi/blog/what-is-feature-sliced) | used |
| 7 | [The Ultimate Frontend Project Structure Guide \| Feature-Sliced Design](https://feature-sliced.design/blog/frontend-structure-best-practices) | used |
| 8 | [eslint-plugin-boundaries - NPM](https://www.npmjs.com/package/eslint-plugin-boundaries) | unused |
| 9 | [Architecture boundaries - ttsc](https://ttsc.dev/docs/lint/rules/boundaries/) | used |
| 10 | [alan2207/bulletproof-react: 🛡️ ⚛️ A simple, scalable, and powerful architecture for building production ready React applications. - GitHub](https://github.com/alan2207/bulletproof-react) | unused |
| 11 | [The Ultimate Next.js App Router Architecture - Feature-Sliced Design](https://feature-sliced.design/blog/nextjs-app-router-guide) | used |
| 12 | [The Perfect Folder Structure for Scalable Frontend \| Feature-Sliced Design](https://feature-sliced.design/zh/blog/frontend-folder-structure) | used |
| 13 | [Navigating the Modern Frontend Ecosystem \| Feature-Sliced Design](https://feature-sliced.design/zh/blog/frontend-ecosystem-map) | unused |
| 14 | [MarchHare/src/example/README.md at main - GitHub](https://github.com/Wildhoney/MarchHare/blob/main/src/example/README.md) | unused |
| 15 | [Mastering Feature-Sliced Design: Lessons from Real Projects - DEV Community](https://dev.to/arjunsanthosh/mastering-feature-sliced-design-lessons-from-real-projects-2ida) | used |
| 16 | [Layered Architecture: Still Relevant for Frontend? \| Feature-Sliced Design](https://feature-sliced.design/blog/frontend-layered-architecture) | used |
| 17 | [How to Structure a Scalable React Project (2026 Guide) \| by Kasun Nadeera - Medium](https://medium.com/@kasunnadeera100/how-to-structure-a-scalable-react-project-2026-guide-d533298dff24) | unused |
| 18 | [Scalable React Application Architecture Guide - DEV Community](https://dev.to/himanshusinghtomar/scalable-react-application-architecture-guide-43j7) | used |
| 19 | [bulletproof-react: Structure large React apps with feature-based architecture patterns and testing standards \| skills.rest](https://skills.rest/skill/bulletproof-react) | unused |
| 20 | [10 anti-AI slop moves for frontend projects going faster than humans can review](https://evilmartians.com/chronicles/ten-anti-ai-slop-moves-for-frontend-projects-going-faster-than-humans-can-review) | used |
| 21 | [Exercise 6: Architectural Linting \| Enterprise UI - Steve Kinney](https://stevekinney.com/courses/enterprise-ui/architectural-linting-exercise) | used |
| 22 | [Guides: Server and Client Boundary - Next.js](https://nextjs.org/docs/app/guides/server-and-client-boundary) | used |
| 23 | [React Server Components: Talks, Workshops, Tutorials and Presentations for JavaScript Developers - GitNation](https://gitnation.com/tags/react-server-components) | unused |
| 24 | [What happened to Components being just a visual thing? - DEV Community](https://dev.to/redbar0n/what-happened-to-components-being-just-a-visual-thing-22hc/comments) | used |
| 25 | [Application State Management with React - Kent C. Dodds](https://kentcdodds.com/blog/application-state-management-with-react) | unused |
| 26 | [feed.xml - GitHubのGist](https://gist.github.com/jgierer12/e4e92eefddd14f1ace4f671f4507365d) | unused |
| 27 | [Episode #52: Tanner Linsley - TanStack - devtools.fm](https://www.devtools.fm/episode/52) | unused |
| 28 | [Edge Runtime vs Node.js Runtime: When Your Serverless Functions Mysteriously Fail](https://dev.to/pockit_tools/edge-runtime-vs-nodejs-runtime-when-your-serverless-functions-mysteriously-fail-14a) | used |
| 29 | [feature sliced: A Practical Frontend Architecture Guide - GradeCalcs](https://gradecalcs.com/feature-sliced-a-practical-frontend-guide/) | unused |
| 30 | [Feature Sliced Design: The Smart Way To Scale Fast - DenebrixAI](https://denebrixai.com/blog/feature-sliced-design-guide/) | unused |
| 31 | [Next.js - Full Context Review](https://www.fullcontextdevelopment.com/blog/next-full-context-review) | unused |
| 32 | [Case studies & examples \| LemmaScript](https://docs.lemmascript.org/case-studies/) | unused |
| 33 | [Engineering Lightning-Fast React Apps at Scale: Lessons in Frontend Performance Optimization - SARC Publisher](https://sarcouncil.com/download-article/SJECS-82-2025-337-348.pdf) | unused |
| 34 | [Feature-Sliced Design and good frontend architecture - codecentric AG](https://www.codecentric.de/en/knowledge-hub/blog/feature-sliced-design-and-good-frontend-architecture) | unused |
| 35 | [Hand-picked resources to build your next web project. Make it beautiful, fast, and amazing. - Jonas Schmedtmann](https://jonas.io/resources/react/knowledge) | unused |
| 36 | [Blogs - AdeptDev – Project Management for Web Developers](https://www.adeptdev.io/blogs) | unused |
| 37 | [10+ Inspirational React Typescript Example GitHub - ThemeSelection](https://themeselection.com/blog/react-typescript-example/) | unused |
| 38 | [[Docs]: boundaries/elements instead of boundaries/element-types in the README? · Issue #350 · javierbrea/eslint-plugin-boundaries - GitHub](https://github.com/javierbrea/eslint-plugin-boundaries/issues/350) | unused |
| 39 | [Migration Guide from v6 to v7 \| JS Boundaries](https://www.jsboundaries.dev/docs/releases/migration-guides/v6-to-v7/) | used |
| 40 | [javierbrea/eslint-plugin-boundaries: Enforce architectural boundaries in your JavaScript and TypeScript projects - GitHub](https://github.com/javierbrea/eslint-plugin-boundaries) | used |
| 41 | [TypeScript Support - JS Boundaries](https://www.jsboundaries.dev/docs/guides/typescript-support/) | used |
| 42 | [Metadata Auto Classifier – Obsidian Plugin](https://www.obsidianstats.com/plugins/metadata-auto-classifier) | unused |
| 43 | [Newest 'eslint' Questions - Page 4 - Stack Overflow](https://stackoverflow.com/questions/tagged/eslint?tab=Newest&page=4) | unused |
| 44 | [Eslint 9 support · Issue #329 · javierbrea/eslint-plugin-boundaries - GitHub](https://github.com/javierbrea/eslint-plugin-boundaries/issues/329) | used |
| 45 | [eslint-plugin-import-boundaries CDN by jsDelivr - A CDN for npm](https://www.jsdelivr.com/package/npm/eslint-plugin-import-boundaries) | used |
| 46 | [feature-sliced-design — AI agent skill \| explainx.ai](https://explainx.ai/skills/aiko-atami/fsd/feature-sliced-design) | unused |
| 47 | [Introduction to Remix: A Fullstack React Framework \| by Claire Chu - Medium](https://medium.com/@Makoto_29712/introduction-to-remix-a-fullstack-react-framework-cb89f36f9b0c) | unused |
| 48 | [Remix Single: Loading data into components - Remix Guide](https://remix.guide/resources/8egdEVsOwVQQ?limit=750&open=menu) | unused |

Two further sources are not in that table because they are not web pages:

- `~/.agents/skills/vercel-composition-patterns/` — on disk, Vercel-authored, MIT. **used**
- `https://www.npmjs.com/package/eslint-plugin-boundaries` — returns 403 to non-browser
  clients, so it is deliberately not linked above; the plugin is cited through its
  GitHub repository instead. **not linked**
