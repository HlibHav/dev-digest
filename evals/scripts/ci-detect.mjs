/**
 * CI change detector for the harness evals (.github/workflows/evals.yml).
 *
 * Pull request / push: reads a newline-separated list of changed files (repo-relative) from
 * $CHANGED_FILES and maps them onto the eval suites that should run:
 *
 *   .claude/skills/<name>/**   OR  evals/skills/<name>/**   → run evals/skills/<name>  (content tier)
 *   .claude/agents/<name>.md   OR  evals/agents/<name>/**   → run evals/agents/<name>  (tool tier)
 *   anything the live harness reads → run the workflow tier: CLAUDE.md / AGENTS.md (root or a
 *   package's), TESTING.md, .claude/rules/**, any agent, a skill the workflow cases name, the
 *   workflow cases or the eval engine
 *
 * workflow_dispatch: $DISPATCH_TIER (all | skills | agents | workflow) and an optional
 * $DISPATCH_NAME pick the suites instead of the diff. A name with no evals fails the run.
 *
 * A changed artifact with NO written evals is NOT a failure: it is reported on the `skipped_*`
 * outputs and as a ::warning:: annotation instead of going red.
 *
 * Emits GitHub Actions step outputs (skills, agents, run_workflow, skipped_skills, skipped_agents)
 * to $GITHUB_OUTPUT. Pure filesystem + string work — no deps.
 */

import { existsSync, readdirSync, readFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Does evals/<tier>/<name>/ contain at least one *.eval.ts? */
function hasEvals(tier, name) {
  const dir = join(EVALS_DIR, tier, name);
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.endsWith(".eval.ts"));
}

/** Every artifact name under evals/<tier>/ that has evals. */
function allWithEvals(tier) {
  const dir = join(EVALS_DIR, tier);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => hasEvals(tier, n)).sort();
}

const out = process.env.GITHUB_OUTPUT;
const write = (k, v) => (out ? appendFileSync(out, `${k}=${v}\n`) : console.log(`${k}=${v}`));

function emit({ skills, agents, runWorkflow, skippedSkills = [], skippedAgents = [], source }) {
  write("skills", JSON.stringify(skills));
  write("agents", JSON.stringify(agents));
  write("run_workflow", String(runWorkflow));
  write("skipped_skills", skippedSkills.join(" "));
  write("skipped_agents", skippedAgents.join(" "));

  // Human-readable summary in the step log.
  console.error(`── eval change detection (${source}) ──`);
  console.error(`skills → run  : ${skills.join(", ") || "(none)"}`);
  console.error(`agents → run  : ${agents.join(", ") || "(none)"}`);
  console.error(`workflow tier : ${runWorkflow ? "run" : "skip"}`);
  // Workflow commands are read from stdout.
  for (const n of skippedSkills) console.log(`::warning title=No evals::skill ${n} changed but has no evals in evals/skills/${n}/ — nothing checked it`);
  for (const n of skippedAgents) console.log(`::warning title=No evals::agent ${n} changed but has no evals in evals/agents/${n}/ — nothing checked it`);
}

// ── workflow_dispatch ─────────────────────────────────────────────────────────────────────────
const tier = (process.env.DISPATCH_TIER ?? "").trim();
if (tier) {
  const name = (process.env.DISPATCH_NAME ?? "").trim();
  if (!["all", "skills", "agents", "workflow"].includes(tier)) {
    console.log(`::error::unknown tier '${tier}' (all | skills | agents | workflow)`);
    process.exit(1);
  }
  const pick = (t) => {
    if (tier !== "all" && tier !== t) return [];
    if (!name) return allWithEvals(t);
    return hasEvals(t, name) ? [name] : [];
  };
  const skills = pick("skills");
  const agents = pick("agents");
  if (name && tier !== "workflow" && skills.length + agents.length === 0) {
    console.log(`::error::'${name}' has no evals under evals/${tier === "all" ? "{skills,agents}" : tier}/`);
    process.exit(1);
  }
  emit({ skills, agents, runWorkflow: tier === "all" || tier === "workflow", source: `dispatch: ${tier}${name ? ` ${name}` : ""}` });
  process.exit(0);
}

// ── pull_request / push ───────────────────────────────────────────────────────────────────────
const changed = (process.env.CHANGED_FILES ?? "")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

/** Collect distinct artifact names touched under a `.claude` and/or `evals` prefix. */
function touched(reClaude, reEvals) {
  const names = new Set();
  for (const f of changed) {
    const m = f.match(reClaude) ?? f.match(reEvals);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

const skillNames = touched(/^\.claude\/skills\/([^/]+)\//, /^evals\/skills\/([^/]+)\//);
const agentNames = touched(/^\.claude\/agents\/([^/]+)\.md$/, /^evals\/agents\/([^/]+)\//);

// The tool tiers (agents, workflow) run through the LiteLLM proxy and this workflow; a change to
// either can break every agent run, so it re-runs every agent that has evals.
const toolInfraChanged = changed.some(
  (f) => /^evals\/proxy\//.test(f) || f === ".github/workflows/evals.yml",
);
if (toolInfraChanged) agentNames.push(...allWithEvals("agents"));

/** Skills the workflow cases name in a quoted string (skill:, expectSkills, forbidSkills). */
function skillsNamedByWorkflowCases() {
  const dir = join(EVALS_DIR, "workflow");
  if (!existsSync(dir)) return new Set();
  const text = readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
  return new Set(skillNames.filter((n) => text.includes(`"${n}"`)));
}
const workflowSkills = skillsNamedByWorkflowCases();

const skills = skillNames.filter((n) => hasEvals("skills", n));
const skippedSkills = skillNames.filter((n) => !hasEvals("skills", n));
const agents = [...new Set(agentNames)].filter((n) => hasEvals("agents", n));
const skippedAgents = [...new Set(agentNames)].filter((n) => !hasEvals("agents", n));

// The workflow tier measures the LIVE harness, so anything it reads re-triggers it.
const runWorkflow =
  workflowSkills.size > 0 ||
  toolInfraChanged ||
  changed.some(
    (f) =>
      /^([^/]+\/)?(CLAUDE|AGENTS)\.md$/.test(f) || // root or a package's; CLAUDE.md is a symlink to AGENTS.md
      f === ".claude/CLAUDE.md" ||
      f === "TESTING.md" ||
      /^\.claude\/rules\//.test(f) ||
      /^\.claude\/agents\/.+\.md$/.test(f) ||
      /^evals\/workflow\//.test(f) ||
      /^evals\/src\//.test(f),
  );

console.error(`changed files : ${changed.length}`);
emit({ skills, agents, runWorkflow, skippedSkills, skippedAgents, source: "diff" });
