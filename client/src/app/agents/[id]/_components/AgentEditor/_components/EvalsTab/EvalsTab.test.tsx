import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, EvalCaseView, EvalSuiteRunSummary } from "@devdigest/shared";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import shell from "../../../../../../../../messages/en/shell.json";
import prReview from "../../../../../../../../messages/en/prReview.json";

const h = vi.hoisted(() => ({ caseParam: null as string | null }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(h.caseParam ? `tab=evals&case=${h.caseParam}` : "tab=evals"),
}));

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: { ...actual.api, get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
  };
});

import { ApiError } from "@/lib/api";
import { EvalsTab } from "./EvalsTab";

const AGENT = { id: "a1", name: "Security Reviewer" } as Agent;

function run(over: Partial<EvalSuiteRunSummary>): EvalSuiteRunSummary {
  return {
    id: "s1",
    agent_id: "a1",
    run_number: 1,
    agent_version: 1,
    status: "done",
    error: null,
    started_at: "2026-10-09T10:00:00.000Z",
    finished_at: "2026-10-09T10:01:00.000Z",
    cases_total: 3,
    cases_done: 3,
    cases_passed: 3,
    cases_errored: 0,
    recall: 0.82,
    precision: 0.91,
    citation_accuracy: 0.95,
    cost_usd: 0.03,
    cost_partial: false,
    duration_ms: 1000,
    scored_cases: [],
    ...over,
  };
}

function kase(id: string, name: string, last: EvalCaseView["last_result"]): EvalCaseView {
  return {
    id,
    owner_kind: "agent",
    owner_id: "a1",
    name,
    input_diff: "--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n+a",
    input_files: null,
    input_meta: { title: "", body: "" },
    expected_output: [{ type: "must_find", file: "x.ts", start_line: 1, end_line: 1 }],
    notes: null,
    agent_id: "a1",
    source_finding_id: null,
    source: null,
    last_result: last,
  } as EvalCaseView;
}
const result = (status: "passed" | "failed" | "errored") => ({
  status,
  matched: status === "passed" ? 1 : 0,
  expected: 1,
  duration_ms: 1000,
  cost_usd: 0.01,
  ran_at: "2026-10-09T10:00:00Z",
});

function dashboard(latest: EvalSuiteRunSummary | null, casesTotal: number) {
  return {
    agent: { id: "a1", name: "Security Reviewer", model: "gpt-4.1" },
    cases_total: casesTotal,
    latest,
    previous: null,
    deltas: { recall: 0.04, precision: -0.02, citation_accuracy: 0.01, cost_usd: 0 },
    trend: [],
    history: [],
    alert: null,
  };
}

function mockApi(opts: { cases: EvalCaseView[]; dash: () => unknown; suite?: () => unknown }) {
  get.mockImplementation(async (path: string) => {
    if (path === "/agents/a1/eval-cases") return opts.cases;
    if (path === "/agents/a1/eval-dashboard") return opts.dash();
    if (path === "/eval-suite-runs/s1" && opts.suite) return opts.suite();
    throw new Error(`unexpected GET ${path}`);
  });
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, shell, prReview }}>
        <EvalsTab agent={AGENT} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  h.caseParam = null;
});
afterEach(cleanup);

describe("EvalsTab", () => {
  it("AC-29 shows Running k/N then final metrics without reload", async () => {
    let finished = false;
    let polls = 0;
    mockApi({
      cases: [kase("c1", "one", result("passed"))],
      dash: () =>
        finished
          ? dashboard(run({}), 3)
          : (() => {
              const live = run({ status: "running", cases_done: 0, recall: null, precision: null, citation_accuracy: null });
              return { ...dashboard(null, 3), history: [live] };
            })(),
      suite: () => {
        polls++;
        if (polls === 1) return { ...run({ status: "running", cases_done: 1 }), snapshot: {}, case_results: [] };
        finished = true;
        return { ...run({}), snapshot: {}, case_results: [] };
      },
    });
    renderTab();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Running 1/3"));
    expect(await screen.findByText("82%", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("3/3")).toBeInTheDocument();
  });

  it("CR-1 resumes a suite that is running after a reload from the history, with Run all disabled", async () => {
    const running = run({ id: "s1", status: "running", cases_done: 1 });
    mockApi({
      cases: [kase("c1", "one", result("passed"))],
      dash: () => ({ ...dashboard(run({ id: "s0" }), 3), history: [running, run({ id: "s0" })] }),
      suite: () => ({ ...running, snapshot: {}, case_results: [] }),
    });
    renderTab();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Running 1/3"));
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeDisabled();
    expect(get).toHaveBeenCalledWith("/eval-suite-runs/s1");
  });

  it("counts passing cases across passed, failed, errored and never-run rows", async () => {
    mockApi({
      cases: [
        kase("c1", "ok-case", result("passed")),
        kase("c2", "bad-case", result("failed")),
        kase("c3", "err-case", result("errored")),
        kase("c4", "new-case", null),
      ],
      dash: () => dashboard(run({}), 4),
    });
    renderTab();
    expect(await screen.findByText("passing 1 / 4")).toBeInTheDocument();
    expect(screen.getByText("matched 1 of 1 expected")).toBeInTheDocument();
    expect(screen.getByText("matched 0 of 1 expected")).toBeInTheDocument();
    expect(screen.getAllByText("never run").length).toBeGreaterThan(0);
    expect(screen.getByText("errored")).toBeInTheDocument();
  });

  it("with no cases shows the empty text and disables Run all evals", async () => {
    mockApi({ cases: [], dash: () => dashboard(null, 0) });
    renderTab();
    expect(await screen.findByText(/No eval cases yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New eval case" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeDisabled();
  });

  it("shows the server's reason when Run all evals is refused", async () => {
    mockApi({ cases: [kase("c1", "one", null)], dash: () => dashboard(null, 1) });
    post.mockRejectedValueOnce(new ApiError("This agent has no enabled cases", 422));
    renderTab();
    const btn = await screen.findByRole("button", { name: "Run all evals" });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    expect(await screen.findByRole("alert")).toHaveTextContent("This agent has no enabled cases");
    expect(post).toHaveBeenCalledWith("/agents/a1/eval-runs");
  });

  it("links to the full dashboard", async () => {
    mockApi({ cases: [], dash: () => dashboard(null, 0) });
    renderTab();
    expect(await screen.findByRole("link", { name: /View full dashboard/ })).toHaveAttribute("href", "/eval/a1");
  });

  it("?case=<id> opens that case in the editor", async () => {
    h.caseParam = "c2";
    mockApi({
      cases: [kase("c1", "one", null), kase("c2", "two", null)],
      dash: () => dashboard(null, 2),
    });
    renderTab();
    expect(await screen.findByRole("dialog")).toHaveTextContent("Eval case · two");
  });
});
