import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextDocList, Skill, SkillContext, SpecFile } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";

const h = vi.hoisted(() => ({
  repo: { id: "r1" } as { id: string } | null,
  files: {} as Record<string, unknown>,
  ctx: {} as Record<string, unknown>,
  setCtx: vi.fn(),
  doc: { data: undefined, isLoading: true, isError: false } as Record<string, unknown>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: h.repo, repoId: h.repo?.id ?? null }),
}));
vi.mock("@/lib/hooks/core", () => ({ useContextFiles: () => h.files }));
vi.mock("@/lib/hooks/project-context", () => ({
  useSkillContext: () => h.ctx,
  useSetSkillContext: () => ({ mutate: h.setCtx, isPending: false, variables: undefined }),
  useContextDoc: () => h.doc,
}));

import { ContextTab } from "./ContextTab";

const SKILL = { id: "sk1", name: "pr-quality-rubric" } as Skill;

const file = (path: string, tokens: number, category: SpecFile["category"] = "specs"): SpecFile => ({
  path,
  category,
  tokens,
  used_by: { agents: 0, skills: 0 },
});

function setup(files: SpecFile[], ctx: SkillContext, cloned = true) {
  const data: ContextDocList = { cloned, scanned_at: null, files };
  h.files = { data, isLoading: false, isError: false };
  h.ctx = { data: ctx, isLoading: false, isError: false };
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ContextTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  h.repo = { id: "r1" };
  h.setCtx.mockClear();
  h.doc = { data: undefined, isLoading: true, isError: false };
});

/** Each group heading in the "Serializes as" region with the paths listed under it. */
function groupsIn(region: HTMLElement) {
  return within(region)
    .getAllByRole("heading", { level: 3 })
    .map((hd) => ({
      heading: hd.textContent,
      paths: Array.from(hd.nextElementSibling?.querySelectorAll("li") ?? []).map((li) => li.textContent),
    }));
}
afterEach(cleanup);

const SERIALIZED = "## Project context\n\n### specs/public-api.md\n\n<untrusted>x</untrusted>";

describe("skill ContextTab", () => {
  it("shows the token total of the attached docs present in the repo (AC-19)", () => {
    setup([file("a.md", 40), file("b.md", 60), file("c.md", 5)], {
      attached: [
        { path: "a.md", order: 0, tokens: 40, present: true },
        { path: "b.md", order: 1, tokens: 60, present: true },
        { path: "gone.md", order: 2, tokens: 0, present: false },
      ],
      serialized: null,
    });
    expect(screen.getByText("≈ 100 tokens")).toBeInTheDocument();
    expect(screen.getByText("3 attached")).toBeInTheDocument();
  });

  it("AC-20: Serializes as groups present docs under Project specifications, Project docs, Project insights", () => {
    setup(
      [
        file("docs/b.md", 10, "docs"),
        file("server/INSIGHTS.md", 10, "insights"),
        file("specs/public-api.md", 10, "specs"),
        file("README.md", 10, "other"),
      ],
      {
        attached: [
          { path: "docs/b.md", order: 0, tokens: 10, present: true },
          { path: "server/INSIGHTS.md", order: 1, tokens: 10, present: true },
          { path: "specs/public-api.md", order: 2, tokens: 10, present: true },
          { path: "README.md", order: 3, tokens: 10, present: true },
          { path: "specs/gone.md", order: 4, tokens: 0, present: false },
        ],
        serialized: SERIALIZED,
      },
    );
    const region = screen.getByRole("region", { name: "Serializes as" });
    expect(groupsIn(region)).toEqual([
      { heading: "Project specifications", paths: ["specs/public-api.md"] },
      { heading: "Project docs", paths: ["docs/b.md", "README.md"] },
      { heading: "Project insights", paths: ["server/INSIGHTS.md"] },
    ]);
    expect(within(region).queryByText(/specs\/gone\.md/)).toBeNull();
  });

  it("AC-48: paths keep attachment order within a group; empty groups are hidden", () => {
    const files = [file("specs/a.md", 10), file("specs/b.md", 10)];
    setup(files, {
      attached: [
        { path: "specs/a.md", order: 1, tokens: 10, present: true },
        { path: "specs/b.md", order: 0, tokens: 10, present: true },
      ],
      serialized: SERIALIZED,
    });
    expect(groupsIn(screen.getByRole("region", { name: "Serializes as" }))).toEqual([
      { heading: "Project specifications", paths: ["specs/b.md", "specs/a.md"] },
    ]);
    cleanup();
    setup(files, {
      attached: [
        { path: "specs/a.md", order: 0, tokens: 10, present: true },
        { path: "specs/b.md", order: 1, tokens: 10, present: true },
      ],
      serialized: SERIALIZED,
    });
    expect(groupsIn(screen.getByRole("region", { name: "Serializes as" }))).toEqual([
      { heading: "Project specifications", paths: ["specs/a.md", "specs/b.md"] },
    ]);
  });

  it("AC-49: Serializes as shows paths only, no doc text", () => {
    h.doc = { data: { path: "specs/a.md", content: "## Goals" }, isLoading: false, isError: false };
    setup([file("specs/a.md", 10)], {
      attached: [{ path: "specs/a.md", order: 0, tokens: 10, present: true }],
      serialized: "## Project context\n\n### specs/a.md\n\nGoals",
    });
    const region = screen.getByRole("region", { name: "Serializes as" });
    expect(within(region).getByText("specs/a.md")).toBeInTheDocument();
    expect(within(region).queryByText(/Goals/)).toBeNull();
  });

  it("AC-47: warns above the 8000-token budget, blocks nothing; 8000 is silent", () => {
    const WARNING = "Attached docs exceed the 8000-token budget.";
    const ctxOf = (second: number): SkillContext => ({
      attached: [
        { path: "a.md", order: 0, tokens: 4000, present: true },
        { path: "b.md", order: 1, tokens: second, present: true },
      ],
      serialized: null,
    });
    setup([file("a.md", 4000), file("b.md", 4001)], ctxOf(4001));
    expect(screen.getByText(WARNING)).toBeInTheDocument();
    for (const box of screen.getAllByRole("checkbox")) expect(box).not.toBeDisabled();
    cleanup();
    setup([file("a.md", 4000), file("b.md", 4000)], ctxOf(4000));
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it("shows no preview when nothing is attached", () => {
    setup([file("a.md", 1)], { attached: [], serialized: null });
    expect(screen.queryByRole("region", { name: "Serializes as" })).toBeNull();
  });

  it("toggling a doc saves the full ordered own paths", () => {
    setup([file("a.md", 1), file("b.md", 1)], {
      attached: [{ path: "a.md", order: 0, tokens: 1, present: true }],
      serialized: null,
    });
    const row = screen.getByText("b.md").closest("div")!;
    fireEvent.click(within(row).getByRole("checkbox"));
    expect(h.setCtx).toHaveBeenCalledWith({ skillId: "sk1", paths: ["a.md", "b.md"] });
  });

  it("asks for a repository when none is active (NC-11)", () => {
    h.repo = null;
    setup([], { attached: [], serialized: null });
    expect(screen.getByText("Select a repository")).toBeInTheDocument();
  });

  it("says the repo is not cloned and shows no list (NC-11)", () => {
    setup([], { attached: [], serialized: null }, false);
    expect(screen.getByText("This repository isn’t cloned yet")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});
