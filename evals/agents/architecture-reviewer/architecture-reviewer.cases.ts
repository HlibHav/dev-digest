import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

const REVIEW_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("checkout-service.diff")}`;

// Cases follow THIS repo's architecture-reviewer output contract (.claude/agents/architecture-reviewer.md,
// "Output — the Architecture Review"): a `Verdict: pass | fail` line, severity critical/major/minor,
// each finding's rule cited as `<skill> step <n>` or the rules file, a `path:line` and a quoted line,
// marked verified or plausible. They replace the course template's cases, which expected rule ids
// (`inward-only-dependencies`, `reviewer-core-zero-io`) that no doc in this repo defines.
//
// Every diff is pasted, not applied to any branch — the way a caller hands the agent a patch. So
// the checks cannot run on it; the agent should say so and still give a pass/fail verdict.
// reviewer-core-fs-read.diff and benign-rename.diff are made from the real files at this commit;
// checkout-service.diff touches a module that doesn't exist here, so its findings are `plausible`.
// The fixtures carry the new-side line column that review-bundle.sh writes into hunks/*.patch
// (number_hunks there), since that is what the agent gets in a real review.
const REVIEWER_CORE_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("reviewer-core-fs-read.diff")}`;

const BENIGN_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("benign-rename.diff")}`;

export const cases: AgentCase[] = [
  {
    name: "flags both violations in the checkout diff with severity and a citable rule",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    grounding: ["Verdict: fail"],
    practices: [
      "Flags server/src/modules/checkout/domain/checkout.ts:1 — the domain file imports a type from 'fastify' — as a boundary violation (imports must point inward; application/domain code imports no fastify).",
      "Flags the `new PgCheckoutRepository()` in server/src/modules/checkout/service.ts — the service builds its own repository instead of receiving it as a port built in wiring.ts / the container.",
      "Every finding cites the rule it breaks as a skill step (e.g. `onion-architecture step 3`) or the rules file (`.claude/rules/onion-boundaries.md`), not prose alone.",
      "Every finding has a severity from critical / major / minor, and these boundary leaks are `major` or higher.",
      "Every finding gives a `path:line` and quotes the offending line verbatim, not a paraphrase.",
      "States that the checks (`pnpm lint:boundaries`, the route-adapter test) did not run on this diff, or ran only on the unchanged tree, rather than presenting their output as a verdict on the diff.",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "does not fabricate an architecture finding for the out-of-scope security-shaped change",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    // A pasted diff is a target: the review must reach a verdict, not stop at needs-answers.
    grounding: ["Verdict: fail"],
    practices: [
      "Does not raise a finding for the optional `reply?: FastifyReply` parameter beyond the fastify import itself (no runtime bug or security finding dressed up as an architecture rule); a one-line note under 'Out of scope, noticed' is not a finding.",
      "Stays scoped to layering, import direction and composition; it does not comment on naming, style or test coverage (a one-line 'Out of scope, noticed' entry is fine).",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "flags filesystem I/O added to reviewer-core against its purity rule",
    kind: "quality",
    prompt: REVIEWER_CORE_PROMPT,
    grounding: ["Verdict: fail"],
    practices: [
      "Flags `import { readFileSync } from 'node:fs'` at reviewer-core/src/review/run.ts:18 (and its use in reviewPullRequest) as a violation: reviewer-core is pure — no database, GitHub, filesystem or env access.",
      // Any documented source counts: the I/O rule lives in reviewer-core/AGENTS.md, in more than
      // one onion-architecture step (the Domain ring, ports) and in the rules file. Version-B runs
      // showed the agent citing "onion-architecture step 1" — a real citation a narrower wording failed.
      "Cites a documented rule by name — reviewer-core/AGENTS.md's purity rule, any `onion-architecture step <n>`, or `.claude/rules/onion-boundaries.md` — rather than describing it only in prose.",
      "Gives the finding a severity of major or higher, a `path:line` and the quoted import line.",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "a benign rename passes with no findings",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    grounding: ["Verdict: pass"],
    practices: [
      "Reports zero findings for the local-variable rename in server/src/modules/blast/helpers.ts (an `info`-level note at most); it does not invent a critical, major or minor finding.",
      "Gives a final verdict of pass, not needs-answers or inconclusive.",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
