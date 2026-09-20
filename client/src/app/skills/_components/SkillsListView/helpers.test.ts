import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { filterSkills, formatBytes } from "./helpers";

function skill(name: string, description = ""): Skill {
  return {
    id: name,
    name,
    description,
    type: "custom",
    source: "manual",
    body: "body",
    enabled: true,
    version: 1,
    evidence_files: null,
  };
}

describe("filterSkills", () => {
  const skills = [
    skill("branch-coverage-gate", "Flag every conditional a diff adds."),
    skill("test-smells", "Flag assertion-free tests and over-mocking."),
  ];

  it("returns everything for an empty or whitespace query", () => {
    expect(filterSkills(skills, "")).toHaveLength(2);
    expect(filterSkills(skills, "   ")).toHaveLength(2);
  });

  it("matches the name, case-insensitively", () => {
    expect(filterSkills(skills, "BRANCH").map((s) => s.name)).toEqual(["branch-coverage-gate"]);
  });

  it("matches the description too", () => {
    expect(filterSkills(skills, "over-mocking").map((s) => s.name)).toEqual(["test-smells"]);
  });

  it("returns nothing when neither field matches", () => {
    expect(filterSkills(skills, "nothing here")).toEqual([]);
  });
});

describe("formatBytes", () => {
  it("keeps bytes under a kilobyte", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("switches to KB at a kilobyte and rounds", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("2 KB");
  });

  it("switches to MB at a megabyte, with one decimal", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1024 * 1024 * 2.5)).toBe("2.5 MB");
  });
});
