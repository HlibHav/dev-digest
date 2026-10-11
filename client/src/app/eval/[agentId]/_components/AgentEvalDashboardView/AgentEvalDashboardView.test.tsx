import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalAgentDashboard, EvalSuiteRunDetail, EvalSuiteRunSummary } from "@devdigest/shared";
import messages from "../../../../../../messages/en/eval.json";

const { dashMock, suiteRunMock, startMutate, replaceMock } = vi.hoisted(() => ({
  dashMock: vi.fn(),
  suiteRunMock: vi.fn(),
  startMutate: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock, push: vi.fn() }) }));
vi.mock("@/lib/hooks/eval", () => ({
  useAgentEvalDashboard: dashMock,
  // the hook returns the un-spread query beside the failure flags; the mock returns the query
  useSuiteRun: (id: string | null) => {
    const run = suiteRunMock(id);
    return { query: run, gone: false, stalled: run.stalled === true };
  },
  useStartSuiteRun: () => ({ mutate: startMutate, isPending: false }),
  useEvalCompare: () => ({ data: undefined, isPending: true, error: null }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({
    data: [
      { id: "a1", name: "Security" },
      { id: "a2", name: "Style" },
    ],
  }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, crumb }: { children: React.ReactNode; crumb?: { label: string }[] }) => (
    <div>
      <nav aria-label="crumb">{crumb?.map((c) => c.label).join(" > ")}</nav>
      {children}
    </div>
  ),
}));
vi.mock("@/components/eval/TrendChart", () => ({ TrendChart: () => <div>trend</div> }));

import { AgentEvalDashboardView } from "./AgentEvalDashboardView";

afterEach(cleanup);
beforeEach(() => {
  dashMock.mockReset();
  suiteRunMock.mockReset();
  startMutate.mockReset();
  replaceMock.mockReset();
  suiteRunMock.mockReturnValue({ data: undefined });
});

function run(n: number, over: Partial<EvalSuiteRunSummary> = {}): EvalSuiteRunSummary {
  return {
    id: `s${n}`,
    agent_id: "a1",
    run_number: n,
    agent_version: 2,
    status: "done",
    error: null,
    started_at: "2026-10-09T10:00:00.000Z",
    finished_at: null,
    cases_total: 3,
    cases_done: 3,
    cases_passed: 2,
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

function dash(over: Partial<EvalAgentDashboard> = {}): EvalAgentDashboard {
  return {
    agent: { id: "a1", name: "Security", model: "gpt-4.1" },
    cases_total: 3,
    latest: run(2, { recall: 0.9 }),
    previous: run(1, { recall: 0.8 }),
    deltas: { recall: 0.1, precision: -0.05, citation_accuracy: null, cost_usd: 0 },
    trend: [],
    history: [run(2), run(1)],
    alert: null,
    ...over,
  };
}

function view(agentId = "a1") {
  return (
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <AgentEvalDashboardView agentId={agentId} />
    </NextIntlClientProvider>
  );
}

describe("AgentEvalDashboardView", () => {
  it("stat cards show latest value and DeltaBadge vs previous", () => {
    dashMock.mockReturnValue({ data: dash(), isLoading: false, isError: false });
    render(view());
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("+10 pts")).toBeInTheDocument();
    expect(screen.getByText("−5 pts")).toBeInTheDocument();
    expect(screen.getByLabelText("crumb")).toHaveTextContent("Skills Lab > Eval Dashboard > Security");
  });

  it("AC-29 Running k/N then metrics", () => {
    dashMock.mockReturnValue({ data: dash(), isLoading: false, isError: false });
    startMutate.mockImplementation((_id: string, opts: { onSuccess: (r: { suite_run_id: string }) => void }) =>
      opts.onSuccess({ suite_run_id: "s3" }),
    );
    suiteRunMock.mockImplementation((id: string | null) =>
      id === "s3"
        ? { data: { id: "s3", agent_id: "a1", status: "running", cases_done: 1, cases_total: 3 } as EvalSuiteRunDetail }
        : { data: undefined },
    );
    const { rerender } = render(view());
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    expect(screen.getByText("Running 1/3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run eval" })).toBeDisabled();

    suiteRunMock.mockImplementation(() => ({
      data: { id: "s3", agent_id: "a1", status: "done", cases_done: 3, cases_total: 3 } as EvalSuiteRunDetail,
    }));
    dashMock.mockReturnValue({ data: dash({ latest: run(3, { recall: 0.95 }) }), isLoading: false, isError: false });
    rerender(view());
    expect(screen.queryByText(/Running/)).not.toBeInTheDocument();
    expect(screen.getByText("95%")).toBeInTheDocument();
  });

  it("CR-1 a dashboard whose history[0] is running shows Running k/N and a disabled Run eval", () => {
    const live = run(3, { status: "running", cases_done: 1, cases_total: 3, recall: null });
    dashMock.mockReturnValue({ data: dash({ history: [live, run(2), run(1)] }), isLoading: false, isError: false });
    render(view());
    expect(screen.getByRole("status")).toHaveTextContent("Running 1/3");
    expect(screen.getByRole("button", { name: "Run eval" })).toBeDisabled();
    expect(suiteRunMock).toHaveBeenCalledWith("s3");
  });

  it("CR-11 a resumed suite stays tracked after history stops listing it as running", () => {
    const live = run(3, { status: "running", cases_done: 1, cases_total: 3, recall: null });
    suiteRunMock.mockImplementation((id: string | null) =>
      id === "s3"
        ? { data: { id: "s3", agent_id: "a1", status: "running", cases_done: 2, cases_total: 3 } as EvalSuiteRunDetail }
        : { data: undefined },
    );
    dashMock.mockReturnValue({ data: dash({ history: [live, run(2)] }), isLoading: false, isError: false });
    const { rerender } = render(view());
    expect(screen.getByRole("status")).toHaveTextContent("Running 2/3");
    dashMock.mockReturnValue({ data: dash({ history: [run(3), run(2)] }), isLoading: false, isError: false });
    rerender(view());
    expect(suiteRunMock).toHaveBeenLastCalledWith("s3");
    expect(screen.getByRole("status")).toHaveTextContent("Running 2/3");
    expect(screen.getByRole("button", { name: "Run eval" })).toBeDisabled();
  });

  it("CR-13 a newer running suite wins over a finished run started here", () => {
    dashMock.mockReturnValue({ data: dash(), isLoading: false, isError: false });
    startMutate.mockImplementation((_id: string, opts: { onSuccess: (r: { suite_run_id: string }) => void }) =>
      opts.onSuccess({ suite_run_id: "s3" }),
    );
    suiteRunMock.mockImplementation((id: string | null) => {
      if (id === "s3") return { data: { id: "s3", agent_id: "a1", status: "done", cases_done: 3, cases_total: 3 } as EvalSuiteRunDetail };
      if (id === "s4") return { data: { id: "s4", agent_id: "a1", status: "running", cases_done: 2, cases_total: 5 } as EvalSuiteRunDetail };
      return { data: undefined };
    });
    const { rerender } = render(view());
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    const newer = run(4, { status: "running", cases_done: 2, cases_total: 5, recall: null });
    dashMock.mockReturnValue({ data: dash({ history: [newer, run(3), run(2)] }), isLoading: false, isError: false });
    rerender(view());
    expect(screen.getByRole("status")).toHaveTextContent("Running 2/5");
    expect(screen.getByRole("button", { name: "Run eval" })).toBeDisabled();
  });

  it("CR-19 Run eval stays disabled between start success and the first suite fetch", () => {
    dashMock.mockReturnValue({ data: dash(), isLoading: false, isError: false });
    startMutate.mockImplementation((_id: string, opts: { onSuccess: (r: { suite_run_id: string }) => void }) =>
      opts.onSuccess({ suite_run_id: "s3" }),
    );
    render(view());
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    expect(screen.getByRole("button", { name: "Run eval" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Running 0/3");
  });

  it("CR-21/CR-32 a started suite whose polls stalled stops showing Running, shows the error and Run eval is usable", () => {
    dashMock.mockReturnValue({ data: dash(), isLoading: false, isError: false });
    startMutate.mockImplementation((_id: string, opts: { onSuccess: (r: { suite_run_id: string }) => void }) =>
      opts.onSuccess({ suite_run_id: "s3" }),
    );
    suiteRunMock.mockReturnValue({ data: undefined, isError: true, stalled: true, error: new Error("bad gateway") });
    render(view());
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("bad gateway");
    expect(screen.getByRole("button", { name: "Run eval" })).toBeEnabled();
  });

  it("CR-24 a stale history row for the suite that just finished does not bring Running back", () => {
    dashMock.mockReturnValue({ data: dash(), isLoading: false, isError: false });
    startMutate.mockImplementation((_id: string, opts: { onSuccess: (r: { suite_run_id: string }) => void }) =>
      opts.onSuccess({ suite_run_id: "s3" }),
    );
    suiteRunMock.mockImplementation((id: string | null) =>
      id === "s3"
        ? { data: { id: "s3", agent_id: "a1", status: "done", cases_done: 3, cases_total: 3 } as EvalSuiteRunDetail }
        : { data: undefined },
    );
    const { rerender } = render(view());
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    dashMock.mockReturnValue({
      data: dash({ history: [run(3, { status: "running", cases_done: 3, recall: null }), run(2)] }),
      isLoading: false,
      isError: false,
    });
    rerender(view());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("CR-25 switching agents while mounted does not show the other agent's running suite", () => {
    dashMock.mockReturnValue({ data: dash(), isLoading: false, isError: false });
    startMutate.mockImplementation((_id: string, opts: { onSuccess: (r: { suite_run_id: string }) => void }) =>
      opts.onSuccess({ suite_run_id: "s3" }),
    );
    suiteRunMock.mockImplementation((id: string | null) =>
      id === "s3"
        ? { data: { id: "s3", agent_id: "a1", status: "running", cases_done: 1, cases_total: 3 } as EvalSuiteRunDetail }
        : { data: undefined },
    );
    const { rerender } = render(view("a1"));
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    expect(screen.getByRole("status")).toHaveTextContent("Running 1/3");
    dashMock.mockReturnValue({
      data: dash({ agent: { id: "a2", name: "Style", model: "m" } }),
      isLoading: false,
      isError: false,
    });
    rerender(view("a2"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run eval" })).toBeEnabled();
  });

  it("the switcher calls router.replace('/eval/<other>') and cards change", () => {
    dashMock.mockImplementation((id: string) =>
      id === "a2"
        ? { data: dash({ agent: { id: "a2", name: "Style", model: "m" }, latest: run(5, { recall: 0.4 }) }), isLoading: false }
        : { data: dash(), isLoading: false },
    );
    const { rerender } = render(view("a1"));
    fireEvent.change(screen.getByLabelText("Switch agent"), { target: { value: "a2" } });
    expect(replaceMock).toHaveBeenCalledWith("/eval/a2");
    rerender(view("a2"));
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.queryByText("90%")).not.toBeInTheDocument();
  });

  it("Run eval starts a suite", () => {
    dashMock.mockReturnValue({ data: dash(), isLoading: false, isError: false });
    render(view());
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    expect(startMutate).toHaveBeenCalledWith("a1", expect.anything());
  });
});
