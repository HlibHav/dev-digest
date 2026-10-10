import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "ci-detect.mjs");

/** Run the detector with the given env; return its step outputs, stdout and exit code. */
function detect(env: Record<string, string>) {
  const outFile = join(mkdtempSync(join(tmpdir(), "ci-detect-")), "out");
  const res = spawnSync("node", [SCRIPT], {
    env: { PATH: process.env.PATH ?? "", GITHUB_OUTPUT: outFile, ...env },
    encoding: "utf8",
  });
  let raw = "";
  try {
    raw = readFileSync(outFile, "utf8");
  } catch {
    // no outputs written (the run failed before writing)
  }
  const out: Record<string, string> = {};
  for (const line of raw.split("\n").filter(Boolean)) {
    const i = line.indexOf("=");
    out[line.slice(0, i)] = line.slice(i + 1);
  }
  return { out, stdout: res.stdout, status: res.status };
}

const changed = (...files: string[]) => detect({ CHANGED_FILES: files.join("\n") });

describe("ci-detect: pull request / push diff", () => {
  it("runs a changed skill that has evals, skips one without", () => {
    const { out, stdout } = changed(
      ".claude/skills/dependency-checker/SKILL.md",
      ".claude/skills/zod/SKILL.md",
    );
    expect(JSON.parse(out.skills)).toEqual(["dependency-checker"]);
    expect(out.skipped_skills).toBe("zod");
    expect(stdout).toContain("::warning");
  });

  it("runs a changed agent with evals and the workflow tier", () => {
    const { out } = changed(".claude/agents/architecture-reviewer.md");
    expect(JSON.parse(out.agents)).toEqual(["architecture-reviewer"]);
    expect(out.run_workflow).toBe("true");
  });

  it("a package AGENTS.md re-runs the workflow tier (cases route through it)", () => {
    expect(changed("server/AGENTS.md").out.run_workflow).toBe("true");
    expect(changed("client/CLAUDE.md").out.run_workflow).toBe("true");
  });

  it("TESTING.md and .claude/rules re-run the workflow tier", () => {
    expect(changed("TESTING.md").out.run_workflow).toBe("true");
    expect(changed(".claude/rules/onion-boundaries.md").out.run_workflow).toBe("true");
  });

  it("a skill the workflow cases name re-runs the workflow tier", () => {
    expect(changed(".claude/skills/engineering-insights/SKILL.md").out.run_workflow).toBe("true");
  });

  it("a skill the workflow cases never name does not", () => {
    expect(changed(".claude/skills/zod/SKILL.md").out.run_workflow).toBe("false");
  });

  it("an unrelated change runs nothing", () => {
    const { out } = changed("client/src/app/page.tsx");
    expect(JSON.parse(out.skills)).toEqual([]);
    expect(JSON.parse(out.agents)).toEqual([]);
    expect(out.run_workflow).toBe("false");
  });
});

describe("ci-detect: workflow_dispatch", () => {
  it("tier=all runs every suite that has evals", () => {
    const { out } = detect({ DISPATCH_TIER: "all" });
    expect(JSON.parse(out.skills)).toEqual(["dependency-checker", "onion-architecture"]);
    expect(JSON.parse(out.agents)).toEqual(["architecture-reviewer"]);
    expect(out.run_workflow).toBe("true");
  });

  it("tier=skills with a name runs only that skill", () => {
    const { out } = detect({ DISPATCH_TIER: "skills", DISPATCH_NAME: "onion-architecture" });
    expect(JSON.parse(out.skills)).toEqual(["onion-architecture"]);
    expect(JSON.parse(out.agents)).toEqual([]);
    expect(out.run_workflow).toBe("false");
  });

  it("tier=workflow runs only the workflow tier", () => {
    const { out } = detect({ DISPATCH_TIER: "workflow" });
    expect(JSON.parse(out.skills)).toEqual([]);
    expect(JSON.parse(out.agents)).toEqual([]);
    expect(out.run_workflow).toBe("true");
  });

  it("a name with no evals fails the run instead of running nothing", () => {
    const { status, stdout } = detect({ DISPATCH_TIER: "agents", DISPATCH_NAME: "security-reviewer" });
    expect(status).not.toBe(0);
    expect(stdout).toContain("::error");
  });
});
