import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentContext, ContextDocList, SpecFile } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const h = vi.hoisted(() => ({
  repo: { id: "r1" } as { id: string } | null,
  files: { data: undefined, isLoading: false, isError: false } as Record<string, unknown>,
  ctx: { data: undefined, isLoading: false, isError: false } as Record<string, unknown>,
  setCtx: vi.fn(),
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: h.repo, repoId: h.repo?.id ?? null }),
}));
vi.mock("@/lib/hooks/core", () => ({ useContextFiles: () => h.files }));
vi.mock("@/lib/hooks/project-context", () => ({
  useAgentContext: () => h.ctx,
  useSetAgentContext: () => ({ mutate: h.setCtx, isPending: false, variables: undefined }),
  useContextDoc: () => ({ data: undefined, isLoading: true, isError: false }),
}));

import { ContextTab } from "./ContextTab";

const AGENT = { id: "ag1", name: "Sec", strategy: "single-pass" } as Agent;

const file = (path: string, tokens: number, category: SpecFile["category"] = "docs"): SpecFile => ({
  path,
  category,
  tokens,
  used_by: { agents: 0, skills: 0 },
});

function setFiles(files: SpecFile[], cloned = true) {
  const data: ContextDocList = { cloned, scanned_at: null, files };
  h.files = { data, isLoading: false, isError: false };
}
function setCtx(ctx: AgentContext) {
  h.ctx = { data: ctx, isLoading: false, isError: false };
}
function renderTab(agent: Agent = AGENT) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ContextTab agent={agent} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  h.repo = { id: "r1" };
  h.setCtx.mockClear();
});
afterEach(cleanup);

const SEVEN = [
  "specs/security-baseline.md",
  "specs/public-api.md",
  "specs/rate-limiting.md",
  "docs/architecture.md",
  "docs/deployment.md",
  "insights/incident.md",
  "insights/perf-budget.md",
].map((p) => file(p, 10));

describe("agent ContextTab", () => {
  it("lists every repo doc with one checked and shows '1 of 7 attached' (AC-11)", () => {
    setFiles(SEVEN);
    setCtx({ attached: [{ path: "specs/public-api.md", order: 0, tokens: 10, present: true }], inherited: [] });
    renderTab();
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);
    expect(screen.getAllByRole("checkbox").filter((c) => c.getAttribute("aria-checked") === "true")).toHaveLength(1);
    expect(screen.getByText("1 of 7 attached")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Preview" })).toHaveLength(7);
  });

  it("totals own plus inherited once per path, with an inherited line (AC-14)", () => {
    setFiles([file("a.md", 100), file("b.md", 50), file("c.md", 30)]);
    setCtx({
      attached: [
        { path: "a.md", order: 0, tokens: 100, present: true },
        { path: "b.md", order: 1, tokens: 50, present: true },
      ],
      inherited: [
        { path: "c.md", skill_id: "s", skill_name: "rubric", tokens: 30, present: true },
        { path: "a.md", skill_id: "s", skill_name: "rubric", tokens: 100, present: true },
      ],
    });
    renderTab();
    expect(screen.getByText("≈ 180 tokens")).toBeInTheDocument();
    expect(screen.getByText("inherited ≈ 30")).toBeInTheDocument();
  });

  it("marks an inherited doc and does not let it be detached (AC-15)", () => {
    setFiles([file("specs/public-api.md", 10)]);
    setCtx({
      attached: [],
      inherited: [{ path: "specs/public-api.md", skill_id: "s", skill_name: "pr-quality-rubric", tokens: 10, present: true }],
    });
    renderTab();
    expect(screen.getByText("inherited from pr-quality-rubric")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(h.setCtx).not.toHaveBeenCalled();
  });

  it("shows a missing attached doc as 'not in this repo' with 0 tokens, outside the total (AC-16)", () => {
    setFiles([file("a.md", 10)]);
    setCtx({
      attached: [
        { path: "a.md", order: 0, tokens: 10, present: true },
        { path: "specs/gone.md", order: 1, tokens: 0, present: false },
      ],
      inherited: [],
    });
    renderTab();
    expect(screen.getByText("specs/gone.md")).toBeInTheDocument();
    expect(screen.getByText("not in this repo")).toBeInTheDocument();
    // The total and a.md's own row both read "≈ 10 tokens"; the missing row reads 0.
    expect(screen.getAllByText("≈ 10 tokens")).toHaveLength(2);
    expect(screen.getByText("≈ 0 tokens")).toBeInTheDocument();
  });

  it.each([
    ["map-reduce", true],
    ["auto", true],
    ["single-pass", false],
  ] as const)("per-file note for strategy %s -> %s (AC-17)", (strategy, shown) => {
    setFiles([file("a.md", 10)]);
    setCtx({ attached: [{ path: "a.md", order: 0, tokens: 10, present: true }], inherited: [] });
    renderTab({ ...AGENT, strategy });
    const note = screen.queryByText(/once per changed file/i);
    expect(!!note).toBe(shown);
  });

  it("toggling a doc saves the full ordered own paths", () => {
    setFiles([file("a.md", 10), file("b.md", 10), file("c.md", 10)]);
    setCtx({
      attached: [
        { path: "a.md", order: 0, tokens: 10, present: true },
        { path: "b.md", order: 1, tokens: 10, present: true },
      ],
      inherited: [],
    });
    renderTab();
    const row = screen.getByText("c.md").closest("div")!;
    fireEvent.click(within(row).getByRole("checkbox"));
    expect(h.setCtx).toHaveBeenCalledWith({ agentId: "ag1", paths: ["a.md", "b.md", "c.md"] });
  });

  it("filters rows by the search box", () => {
    setFiles(SEVEN);
    setCtx({ attached: [], inherited: [] });
    renderTab();
    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), { target: { value: "perf" } });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  it("asks for a repository when none is active (NC-11)", () => {
    h.repo = null;
    setFiles([]);
    setCtx({ attached: [], inherited: [] });
    renderTab();
    expect(screen.getByText("Select a repository")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("says the repo is not cloned and shows no list (NC-11)", () => {
    setFiles([], false);
    setCtx({ attached: [], inherited: [] });
    renderTab();
    expect(screen.getByText("This repository isn’t cloned yet")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
  it("AC-46: warns above the 8000-token budget, blocks nothing; 8000 is silent", () => {
    const WARNING = "Attached docs exceed the 8000-token budget.";
    const run = (inhTokens: number, withGone: boolean) => {
      cleanup();
      setFiles([file("own1.md", 5000), file("own2.md", 2000), file("inh.md", inhTokens)]);
      setCtx({
        attached: [
          { path: "own1.md", order: 0, tokens: 5000, present: true },
          { path: "own2.md", order: 1, tokens: 2000, present: true },
          ...(withGone ? [{ path: "gone.md", order: 2, tokens: 0, present: false }] : []),
        ],
        inherited: [{ path: "inh.md", skill_id: "s", skill_name: "rubric", tokens: inhTokens, present: true }],
      });
      renderTab();
    };
    for (const withGone of [false, true]) {
      run(1001, withGone);
      expect(screen.getByText(WARNING)).toBeInTheDocument();
      for (const own of ["own1.md", "own2.md"]) {
        expect(screen.getByRole("checkbox", { name: `Attach ${own}` })).not.toBeDisabled();
      }
      run(1000, withGone);
      expect(screen.queryByText(WARNING)).toBeNull();
    }
  });
});
