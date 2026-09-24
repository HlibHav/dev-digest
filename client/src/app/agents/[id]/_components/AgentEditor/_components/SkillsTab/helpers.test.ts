import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { availableSkills, matchesQuery, moveSkill, orderedAttached, toggleAttached } from "./helpers";

/**
 * The Skills tab sends `skill_ids` as one ordered set, so these four functions
 * ARE attach, detach and reorder. The drag itself is dnd-kit's; what has to hold
 * here is the list it produces.
 */

function skill(id: string, name = id): Skill {
  return {
    id,
    name,
    description: `${name} description`,
    type: "custom",
    source: "manual",
    body: "body",
    enabled: true,
    version: 1,
    evidence_files: null,
  };
}

describe("moveSkill", () => {
  it("moves an id down and shifts the rest up", () => {
    expect(moveSkill(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("moves an id up", () => {
    expect(moveSkill(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("returns the same order for a no-op or an out-of-range index", () => {
    const ids = ["a", "b", "c"];
    expect(moveSkill(ids, 1, 1)).toEqual(ids);
    expect(moveSkill(ids, -1, 1)).toEqual(ids);
    expect(moveSkill(ids, 0, 9)).toEqual(ids);
  });

  it("does not mutate the input", () => {
    const ids = ["a", "b", "c"];
    moveSkill(ids, 0, 2);
    expect(ids).toEqual(["a", "b", "c"]);
  });
});

describe("toggleAttached", () => {
  it("attaches at the end, so a new skill lands last in the prompt", () => {
    expect(toggleAttached(["a"], "b")).toEqual(["a", "b"]);
  });

  it("detaches without disturbing the order of the rest", () => {
    expect(toggleAttached(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});

describe("orderedAttached", () => {
  const skills = [skill("a"), skill("b"), skill("c")];

  it("returns the skills in link order, not library order", () => {
    expect(orderedAttached(skills, ["c", "a"]).map((s) => s.id)).toEqual(["c", "a"]);
  });

  it("drops an id whose skill was deleted rather than rendering a hole", () => {
    expect(orderedAttached(skills, ["a", "gone", "b"]).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("applies the filter to attached rows too, since the tab shows one list", () => {
    const named = [skill("a", "branch-coverage-gate"), skill("b", "test-smells")];
    expect(orderedAttached(named, ["a", "b"], "smell").map((s) => s.id)).toEqual(["b"]);
    expect(orderedAttached(named, ["a", "b"], "").map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("matchesQuery", () => {
  it("matches everything on an empty or whitespace query", () => {
    expect(matchesQuery(skill("a"), "")).toBe(true);
    expect(matchesQuery(skill("a"), "   ")).toBe(true);
  });

  it("matches name and description, case-insensitively", () => {
    const s = skill("a", "branch-coverage-gate");
    expect(matchesQuery(s, "COVERAGE")).toBe(true);
    expect(matchesQuery(s, "description")).toBe(true);
    expect(matchesQuery(s, "nothing")).toBe(false);
  });
});

describe("availableSkills", () => {
  const skills = [skill("a", "branch-coverage-gate"), skill("b", "test-smells")];

  it("excludes what is already attached", () => {
    expect(availableSkills(skills, ["a"], "").map((s) => s.id)).toEqual(["b"]);
  });

  it("filters by name and description, case-insensitively", () => {
    expect(availableSkills(skills, [], "SMELL").map((s) => s.id)).toEqual(["b"]);
    expect(availableSkills(skills, [], "coverage description").map((s) => s.id)).toEqual([]);
    expect(availableSkills(skills, [], "branch-coverage-gate desc").map((s) => s.id)).toEqual(["a"]);
  });
});
