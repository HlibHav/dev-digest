import type { SkillCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// Each fixture is a realistic backend change (a git diff against main) with planted onion
// violations and, where a practice says "does NOT flag", sanctioned code the skill must leave
// alone. The fixtures carry no comments that point at the plants; the practices below are the
// only answer key. Line numbers refer to the files after the diff is applied.
const review = (diff: string) =>
  `I'm about to open a PR from this branch. Review its backend changes against main: is the code structured the way this repo wants it? List what you'd change before merge.\n\nThe diff:\n\n${diff}`;

export const cases: SkillCase[] = [
  {
    name: "stale-pr-reminders: finds the planted violations and leaves sanctioned code alone",
    kind: "quality",
    prompt: review(fx("stale-pr-reminders.diff")),
    practices: [
      "Flags server/src/modules/reminders/routes.ts:45 — the POST /reminders/:id/send handler calls container.github() / gh.postReview itself instead of going through the service.",
      "Flags reminders/service.ts:1-2 — the service imports drizzle-orm and db/schema and runs queries itself; the queries belong in a repository.",
      "Flags reminders/service.ts:12 — the new RemindersService takes the whole Container instead of the ports it uses.",
      "Flags that routes.ts builds the service (:27 `new RemindersService(container)`) and registers the job (:29) itself; both belong in a reminders/wiring.ts `buildRemindersService(container, log)`.",
    ],
    threshold: 0.75,
    maxTurns: 10,
  },
  {
    name: "review-slack-notify: finds the planted violations and leaves sanctioned code alone",
    kind: "quality",
    prompt: review(fx("review-slack-notify.diff")),
    practices: [
      "Flags that the new Slack adapter has no port in vendor/shared/adapters.ts (ReviewNotifier is declared in notify/service.ts:4) and/or no double in adapters/mocks.ts.",
      "Flags adapters/slack/webhook.ts:13 — the webhook URL is read from process.env instead of container.secrets.",
      "Flags notify/routes.ts:35 (GET /pulls/:id/notifiable-reviews) — the handler runs a DB query (container.db + drizzle/schema imports) instead of going through the repository and service.",
      "Flags notify/routes.ts:22-26 — the route file builds NotifyRepository and NotifyService (wiring container.slack into its ports) itself; that belongs in notify/wiring.ts.",
    ],
    threshold: 0.75,
    maxTurns: 10,
  },
  {
    name: "nightly-reindex: finds the planted violations and leaves sanctioned code alone",
    kind: "quality",
    prompt: review(fx("nightly-reindex.diff")),
    practices: [
      "Flags reindex/scheduler.ts — the background sweep runs on its own setInterval + p-queue instead of container.jobs.",
      "Flags reindex/service.ts (clearIndex(tx: ReindexTx, ...)) and the repository tx params — Drizzle's transaction handle leaks into the service; atomicity should be a withTransaction(work) port.",
      "Flags reindex/entity.ts + mapper.ts as an unneeded layer for a simple read.",
      "Flags reindex/routes.ts:19-25 — the route file builds the repository, service and scheduler and starts the timer itself; that belongs in reindex/wiring.ts.",
    ],
    threshold: 0.75,
    maxTurns: 10,
  },
  {
    name: "pr-label-suggestions: finds the planted violations and leaves sanctioned code alone",
    kind: "quality",
    prompt: review(fx("pr-label-suggestions.diff")),
    practices: [
      "Flags labels/routes.ts:21 — the GET /pulls/:id/labels/suggestions handler reads container.secrets itself and passes the token into the service.",
      "Flags labels/service.ts:67-68 — the service calls the GitHub REST API with global fetch: new I/O outside an adapter, with no port in vendor/shared/adapters.ts and no double (GitHubClient should grow the method instead).",
      "Flags labels/helpers.ts:3 — application code imports the PullRow type from src/db/rows.",
      "Does NOT flag as a violation any of: labels/wiring.ts:23 `llm: (provider) => container.llm(provider)`, :12 container.reviewRepo, :4 the import of settings/feature-models, or :26-28 the job registered in wiring.ts reading container.secrets.",
    ],
    threshold: 0.75,
    maxTurns: 10,
  },
  {
    name: "team-digest: finds the planted violations and leaves sanctioned code alone",
    kind: "quality",
    prompt: review(fx("team-digest.diff")),
    practices: [
      "Flags digest/wiring.ts:3 — wiring imports BriefRepository from another module (brief/repository.ts) and builds it; another module's data must come through its builder/service or a container repository.",
      "Flags digest/repository.ts:4 — the repository imports getRepo from reviews/repository/pull.repo.ts, another module's data access (container.reviewRepo.getRepo exists).",
      "Flags digest/routes.ts:14 — routes.ts imports the SkillRow type from skills/repository.ts (another module's data access, type-only).",
      "Flags digest/routes.ts:57 — the POST /digests handler calls container.github() / currentLogin itself.",
      "Flags digest/service.ts:4 — the service imports FastifyBaseLogger from fastify (application code imports no fastify).",
      "Flags digest/service.ts:1,93-95 — the service writes Markdown files to the home directory with node:fs: new I/O outside an adapter, with no port or double.",
      "Flags digest/routes.ts:31 — the job handler is registered in routes.ts instead of digest/wiring.ts.",
      "Does NOT flag as a violation any of: wiring.ts:4 importing settings/feature-models, wiring.ts using container.skillsRepo / container.llm in port lambdas, routes.ts:12-13 importing _shared/context and _shared/schemas.",
    ],
    threshold: 0.75,
    maxTurns: 10,
  },
];
