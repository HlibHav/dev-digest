import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalSuiteRunSummary } from "@devdigest/shared";
import messages from "../../../../messages/en/eval.json";
import { RunHistoryTable } from "./RunHistoryTable";

afterEach(cleanup);

function makeRun(over: Partial<EvalSuiteRunSummary>): EvalSuiteRunSummary {
  return {
    id: "r1",
    agent_id: "a1",
    run_number: 1,
    agent_version: 1,
    status: "done",
    error: null,
    started_at: "2026-10-09T10:00:00.000Z",
    finished_at: "2026-10-09T10:01:00.000Z",
    cases_total: 5,
    cases_done: 5,
    cases_passed: 4,
    cases_errored: 0,
    recall: 0.8,
    precision: 0.75,
    citation_accuracy: 1,
    cost_usd: 0.03,
    cost_partial: false,
    duration_ms: 60000,
    scored_cases: [],
    ...over,
  };
}

const renderTable = (runs: EvalSuiteRunSummary[], onCompare = vi.fn()) => {
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <RunHistoryTable runs={runs} onCompare={onCompare} />
    </NextIntlClientProvider>,
  );
  return onCompare;
};

describe("RunHistoryTable", () => {
  it("AC-23 null precision renders —", () => {
    renderTable([makeRun({ precision: null, citation_accuracy: 0.9 })]);
    const row = screen.getByRole("row", { name: /run #1/ });
    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(within(row).queryByText("0%")).not.toBeInTheDocument();
    expect(within(row).queryByText("100%")).not.toBeInTheDocument();
  });

  it("rows newest first show label, status, passed/executed, errored count only when > 0, cost", () => {
    renderTable([
      makeRun({ id: "r1", run_number: 1 }),
      makeRun({ id: "r2", run_number: 2, agent_version: 2, status: "partial", cases_done: 5, cases_passed: 3, cases_errored: 1, cost_usd: 0.05, cost_partial: true }),
    ]);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("run #2 · agent v2");
    expect(rows[1]).toHaveTextContent("run #1 · agent v1");
    expect(rows[0]).toHaveTextContent("partial");
    expect(rows[0]).toHaveTextContent("3/4");
    expect(rows[0]).toHaveTextContent("1 errored");
    expect(rows[0]).toHaveTextContent("$0.05+");
    expect(rows[1]).toHaveTextContent("4/5");
    expect(rows[1]).not.toHaveTextContent("errored");
    expect(rows[1]).toHaveTextContent("$0.03");
  });

  it("checkbox accessible name is the run label; Compare disabled unless compareEnabled", () => {
    const onCompare = renderTable([
      makeRun({ id: "r1", run_number: 1 }),
      makeRun({ id: "r2", run_number: 2, agent_version: 2 }),
      makeRun({ id: "r3", run_number: 3, agent_version: 2, status: "failed" }),
    ]);
    const compare = screen.getByRole("button", { name: "Compare" });
    expect(compare).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /run #1 · agent v1/ }));
    expect(compare).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /run #2 · agent v2/ }));
    expect(compare).toBeEnabled();
    fireEvent.click(compare);
    expect(onCompare).toHaveBeenCalledWith("r1", "r2");
    fireEvent.click(screen.getByRole("checkbox", { name: /run #3 · agent v2/ }));
    expect(compare).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /run #3 · agent v2/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /run #2 · agent v2/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /run #3 · agent v2/ }));
    expect(compare).toBeDisabled(); // a failed run is selected
  });

  it("a running row shows Running k/N", () => {
    renderTable([makeRun({ status: "running", cases_done: 2, cases_total: 5, recall: null, precision: null, citation_accuracy: null, cost_usd: null })]);
    expect(screen.getByText("Running 2/5")).toBeInTheDocument();
  });
});
