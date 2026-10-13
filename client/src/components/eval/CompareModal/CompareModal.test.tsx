import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCompare, EvalSuiteRunSummary } from "@devdigest/shared";
import messages from "../../../../messages/en/eval.json";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: getMock, post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() } };
});

import { CompareModal } from "./CompareModal";

afterEach(cleanup);
beforeEach(() => getMock.mockReset());

function run(n: number, over: Partial<EvalSuiteRunSummary>): EvalSuiteRunSummary {
  return {
    id: `s${n}`,
    agent_id: "a1",
    run_number: n,
    agent_version: n,
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
    citation_accuracy: null,
    cost_usd: 0.03,
    cost_partial: false,
    duration_ms: null,
    scored_cases: [],
    ...over,
  };
}

function compare(over: Partial<EvalCompare> = {}): EvalCompare {
  return {
    base: run(1, {}),
    head: run(2, { recall: 0.9, precision: 0.48, cost_usd: 0.05 }),
    deltas: { recall: 0.1, precision: -0.02, citation_accuracy: null, cost_usd: 0.02 },
    prompt_diff: [
      { op: "equal", text: "You review code." },
      { op: "remove", text: "Be terse." },
      { op: "add", text: "Be thorough <b>bold</b>." },
    ],
    config_changes: [{ kind: "model", name: null, from: "gpt-4.1-mini", to: "gpt-4.1" }],
    case_set: { added: 2, removed: 1 },
    ...over,
  };
}

function renderModal(onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <CompareModal baseId="s1" headId="s2" onClose={onClose} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onClose;
}

describe("CompareModal", () => {
  it("old → new values with DeltaBadge, prompt diff lines marked add/remove, config changes, 'case set changed: +2 / −1' when non-zero", async () => {
    getMock.mockResolvedValue(compare());
    const onClose = renderModal();
    expect(await screen.findByText("Compare runs · run #1 · agent v1 → run #2 · agent v2")).toBeInTheDocument();
    expect(screen.getByText("+10 pts")).toBeInTheDocument();
    expect(screen.getByText("−2 pts")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0); // null citation, never 0%
    expect(screen.getByText("Be terse.").closest("[data-op]")).toHaveAttribute("data-op", "remove");
    const added = screen.getByText("Be thorough <b>bold</b>.");
    expect(added.closest("[data-op]")).toHaveAttribute("data-op", "add"); // rendered as text, not HTML
    expect(screen.getByText(/gpt-4\.1-mini/)).toBeInTheDocument();
    expect(screen.getByText("case set changed: +2 / −1")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!); // footer button; the header X is the other one
    expect(onClose).toHaveBeenCalled();
  });

  it("hides the case-set note when nothing changed and says so when no config changed", async () => {
    getMock.mockResolvedValue(compare({ case_set: { added: 0, removed: 0 }, config_changes: [] }));
    renderModal();
    expect(await screen.findByText("No model, provider or skill changes")).toBeInTheDocument();
    expect(screen.queryByText(/case set changed/)).not.toBeInTheDocument();
  });
});
