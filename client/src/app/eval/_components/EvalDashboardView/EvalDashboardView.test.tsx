import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type {
  EvalRecentRun,
  EvalRunAllResult,
  EvalSuiteRunSummary,
  EvalWorkspaceAgentRow,
  EvalWorkspaceDashboard,
} from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";

const { dashboardMock, runAllMutate, runAllState } = vi.hoisted(() => ({
  dashboardMock: vi.fn(),
  runAllMutate: vi.fn(),
  runAllState: { data: undefined as EvalRunAllResult | undefined, isPending: false },
}));

vi.mock("@/lib/hooks/eval", () => ({
  useEvalWorkspaceDashboard: dashboardMock,
  useRunAllAgents: () => ({ mutate: runAllMutate, ...runAllState }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, crumb }: { children: React.ReactNode; crumb?: { label: string }[] }) => (
    <div>
      <nav aria-label="crumb">{crumb?.map((c) => c.label).join(" > ")}</nav>
      {children}
    </div>
  ),
}));

import { EvalDashboardView } from "./EvalDashboardView";

afterEach(cleanup);
beforeEach(() => {
  dashboardMock.mockReset();
  runAllMutate.mockReset();
  runAllState.data = undefined;
});

function run(n: number, over: Partial<EvalSuiteRunSummary> = {}): EvalSuiteRunSummary {
  return {
    id: `s${n}`,
    agent_id: "a1",
    run_number: n,
    agent_version: 2,
    status: "done",
    error: null,
    started_at: `2026-10-0${n}T10:00:00.000Z`,
    finished_at: null,
    cases_total: 4,
    cases_done: 4,
    cases_passed: 3,
    cases_errored: 0,
    recall: 0.8,
    precision: 0.5,
    citation_accuracy: 1,
    cost_usd: 0.03,
    cost_partial: false,
    duration_ms: null,
    scored_cases: [],
    ...over,
  };
}

function agent(id: string, name: string, over: Partial<EvalWorkspaceAgentRow> = {}): EvalWorkspaceAgentRow {
  return { agent_id: id, name, model: "gpt-4.1", cases_total: 4, latest: run(1), recall_trend: [0.5, null, 0.8], ...over };
}

function renderView(data: EvalWorkspaceDashboard) {
  dashboardMock.mockReturnValue({ data, isLoading: false, isError: false, refetch: vi.fn() });
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalDashboardView />
    </NextIntlClientProvider>,
  );
}

describe("EvalDashboardView", () => {
  it("AC-53 empty response → empty state pointing to findings and the Evals tab", () => {
    renderView({ agents: [], recent_runs: [] });
    expect(screen.getByText("No eval cases yet")).toBeInTheDocument();
    expect(screen.getByText(/Turn an accepted or dismissed finding into an eval case/)).toBeInTheDocument();
    expect(screen.getByText(/Evals tab/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("AC-54 agent with cases and latest null → 'never run' and —", () => {
    renderView({ agents: [agent("a1", "Security", { latest: null, recall_trend: [] })], recent_runs: [] });
    const row = screen.getByRole("link", { name: /Security/ });
    expect(within(row).getByText("never run")).toBeInTheDocument();
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(row).toHaveAttribute("href", "/eval/a1");
  });

  it("two agents with latest values and Sparkline; recent runs newest first", () => {
    const recent: EvalRecentRun[] = [
      { ...run(1), agent_name: "Security" },
      { ...run(3, { agent_id: "a2" }), agent_name: "Style" },
      { ...run(2), agent_name: "Security" },
    ];
    renderView({
      agents: [agent("a1", "Security"), agent("a2", "Style", { latest: run(3, { recall: 0.25 }) })],
      recent_runs: recent,
    });
    const security = screen.getByRole("link", { name: /Security/ });
    expect(within(security).getByText("80%")).toBeInTheDocument();
    expect(security.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("link", { name: /Style/ })).toHaveTextContent("25%");

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual([
      "Style run #3 · agent v2",
      "Security run #2 · agent v2",
      "Security run #1 · agent v2",
    ]);
  });

  it("Run all agents shows started/skipped with reasons", () => {
    runAllState.data = {
      started: [{ agent_id: "a1", suite_run_id: "x" }],
      skipped: [{ agent_id: "a2", reason: "no cases" }],
    };
    renderView({ agents: [agent("a1", "Security"), agent("a2", "Style")], recent_runs: [] });
    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    expect(runAllMutate).toHaveBeenCalled();
    expect(screen.getByText("1 started · 1 skipped")).toBeInTheDocument();
    expect(screen.getByText(/Style: no cases/)).toBeInTheDocument();
  });
});
