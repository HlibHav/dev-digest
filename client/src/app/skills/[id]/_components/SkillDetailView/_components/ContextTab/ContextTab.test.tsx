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
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: h.repo, repoId: h.repo?.id ?? null }),
}));
vi.mock("@/lib/hooks/core", () => ({ useContextFiles: () => h.files }));
vi.mock("@/lib/hooks/project-context", () => ({
  useSkillContext: () => h.ctx,
  useSetSkillContext: () => ({ mutate: h.setCtx, isPending: false, variables: undefined }),
  useContextDoc: () => ({ data: undefined, isLoading: true, isError: false }),
}));

import { ContextTab } from "./ContextTab";

const SKILL = { id: "sk1", name: "pr-quality-rubric" } as Skill;

const file = (path: string, tokens: number): SpecFile => ({
  path,
  category: "specs",
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
});
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

  it("previews the serialized block exactly as the run sends it (AC-20)", () => {
    setup([file("specs/public-api.md", 10)], {
      attached: [{ path: "specs/public-api.md", order: 0, tokens: 10, present: true }],
      serialized: SERIALIZED,
    });
    expect(screen.getByText("Serializes as")).toBeInTheDocument();
    const pre = document.querySelector("pre")!;
    expect(pre.textContent).toBe(SERIALIZED);
    expect(pre.textContent!.startsWith("## Project context")).toBe(true);
    expect(pre.textContent).toContain("specs/public-api.md");
  });

  it("shows no preview when nothing is attached", () => {
    setup([file("a.md", 1)], { attached: [], serialized: null });
    expect(document.querySelector("pre")).toBeNull();
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
