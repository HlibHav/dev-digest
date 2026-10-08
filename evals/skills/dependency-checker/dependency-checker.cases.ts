import type { SkillCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// Quality cases run with no tools (skillTask measures SKILL.md + references/ in isolation), so
// each prompt hands over what the skill would gather itself: the collector's JSON and the greps
// it is told to run before claiming anything. Both fixtures are real `collect_deps.py` runs on
// this repo (2026-10-08): `installed` from a checkout with client/server/reviewer-core/evals
// installed, `uninstalled` from a worktree where only evals is. The practices are the answer key.
//
// The last four cases pin gaps the 2026-10-08 run exposed (sizes missing without an install,
// "unused" depending on install state, type-only major drift, own vs transitive size). They are
// expected to fail against dependency-checker v1.0.0 until the skill covers them.
const installed = fx("collector-installed.json");
const uninstalled = fx("collector-uninstalled.json");
const greps = fx("grep-evidence.txt");

const withData = (ask: string, json: string, extra = "") =>
  `${ask}\n\nThe collector already ran; here is its JSON — treat it as collected and write the report from it (do not ask for tool access):\n\n\`\`\`json\n${json}\n\`\`\`${extra}`;

const grepBlock = `\n\nAnd the greps you would run before claiming anything is unused or broken:\n\n\`\`\`\n${greps}\`\`\``;

export const cases: SkillCase[] = [
  {
    name: "full report follows the template: sections in order, Mermaid map, tables",
    kind: "quality",
    prompt: withData(
      "Run a dependency audit of this repo: map, sizes, findings and prioritized recommendations.",
      installed,
      grepBlock,
    ),
    grounding: ["```mermaid", "## Summary", "## Recommendations", "## Method and limits"],
    practices: [
      "The report's sections appear in this order: Summary, Map, Packages, Across packages, Findings, Recommendations, Method and limits.",
      "The Summary is a table with one row per package (client, e2e, evals, mcp-server, reviewer-core, server) giving manager, prod and dev counts, installed size and install health.",
      "The Mermaid map shows all six packages and their internal links (path alias, mirrored vendor/shared copy, HTTP) and stays at roughly 25 nodes or fewer.",
      "Sizes match the JSON's KB values, in either MB convention (client node_modules 620 or 635 MB, next own size 152 or 156 MB), not estimates.",
      "The report says at least once that the sizes are installed disk size, not bundle size shipped to users.",
      "The Recommendations section is a table whose rows each carry a priority (P0/P1/P2), the package, the dependency, the evidence and one action, ordered P0 before P1 before P2.",
    ],
    threshold: 0.75,
    maxTurns: 10,
  },
  {
    name: "stale installs are P0 and the fix stays a recommendation, not an action",
    kind: "quality",
    prompt: withData(
      "Check our dependencies and fix whatever is broken while you're at it.",
      installed,
      grepBlock,
    ),
    practices: [
      "Calls out that client's @dnd-kit/core, @dnd-kit/sortable and @dnd-kit/utilities are declared and imported (SkillsTab.tsx / SkillRow.tsx) but missing from the install, and ranks this P0.",
      "Calls out that server's fflate is imported in server/src/modules/skills/import.ts but missing from the install, and ranks this P0.",
      "Does not claim to have run an install, update or package.json edit; it states the skill is read-only and gives the install as an action for the user to run.",
    ],
    threshold: 0.75,
    maxTurns: 10,
  },
  {
    name: "possibly-unused flags are checked against grep evidence before any removal advice",
    kind: "quality",
    prompt: withData("What dependencies can we safely remove?", installed, grepBlock),
    practices: [
      "Treats client's postcss as declared directly but used only through @tailwindcss/postcss (client/postcss.config.mjs:4; @tailwindcss/postcss depends on postcss itself), so dropping the direct declaration is P2 hygiene, not a P0/P1 unused prod dependency.",
      "Recommends removing server's @fastify/autoload (a prod dep whose only mention is a comment in server/src/modules/index.ts:24) at P1.",
      "Notes that server's testcontainers is not imported directly, only @testcontainers/postgresql is (server/test/helpers/pg.ts:1), and treats dropping the direct declaration as P2 hygiene, not a P0/P1 removal.",
      "Names reviewer-core's tsx specifically (not just tsx across packages) as a possibly unused dev dependency at P2, because nothing in reviewer-core uses it.",
    ],
    threshold: 0.75,
    maxTurns: 10,
  },
  {
    name: "gap: packages without node_modules get n/a sizes and a way to get real numbers",
    kind: "quality",
    prompt: withData(
      "How much does each package in this repo weigh on disk? I need numbers for all of them.",
      uninstalled,
    ),
    practices: [
      "Reports sizes as n/a (or not available) for client, server, reviewer-core, mcp-server and e2e, and does not invent or estimate a size for any of them.",
      "Reports evals' real size from the JSON (node_modules_kb 360064, i.e. about 352 or 360 MB).",
      "Does not install anything to get the numbers, and lists the uninstalled packages as a finding.",
      "Tells the user how to get real numbers without changing this tree, e.g. re-running the collector on a checkout where those packages are installed, or installing them in a separate step and re-running.",
    ],
    threshold: 0.75,
    maxTurns: 10,
  },
  {
    name: "gap: a dep flagged unused only because the package is not installed is not removed",
    kind: "quality",
    prompt: withData(
      "The collector says client has unused dependencies. Which ones should we remove?",
      uninstalled,
      grepBlock,
    ),
    practices: [
      "Does not recommend removing client's react-dom; it explains react-dom is required alongside react/next (a peer they need) even though no file imports it directly.",
      "Notes that client is not installed, so peer and config references could not be checked and the 'possibly unused' list is less reliable than on an installed tree.",
      "Treats client's postcss as used through @tailwindcss/postcss (client/postcss.config.mjs:4), not as plainly unused; any removal of the direct declaration is P2 hygiene.",
    ],
    threshold: 0.75,
    maxTurns: 10,
  },
  {
    name: "gap: zod 3 vs 4 across shared code with type-only imports is graded below P0",
    kind: "quality",
    prompt: withData(
      "Is the zod version split across our packages a real problem? How urgent is it?",
      installed,
      grepBlock,
    ),
    practices: [
      "Identifies the split: mcp-server on zod ^4.6.5 while client, server and reviewer-core are on zod ^3.24.1, and mcp-server reads the shared contract code (@devdigest/shared), whose schemas are built with zod 3.",
      "Uses the grep evidence that every mcp-server import of @devdigest/shared is `import type`, and concludes the two zod majors do not meet at runtime today.",
      "Ranks the split P1 (plan it), not P0, and names what would make it P0: mcp-server parsing the shared zod-3 schemas at runtime.",
    ],
    threshold: 0.75,
    maxTurns: 10,
  },
  {
    name: "gap: own installed size is not presented as a dependency's total weight",
    kind: "quality",
    prompt: withData(
      "How much does next weigh in client, including everything it pulls in?",
      installed,
    ),
    practices: [
      "Gives next's own installed size from the JSON (about 152 MB, own_size_kb 155972) and says it is the package's own directory without its dependencies.",
      "Does not present the own size, or client's whole node_modules (about 620 MB), as next's total including its dependencies; comparing next's own size to the whole node_modules (e.g. 'about a quarter of it') is fine.",
      "Says the collector does not measure transitive weight and names a concrete way to measure it (e.g. summing the sizes of next's resolved dependency tree from the lockfile or `pnpm why`/`pnpm list --depth`).",
    ],
    threshold: 0.75,
    maxTurns: 10,
  },
];
