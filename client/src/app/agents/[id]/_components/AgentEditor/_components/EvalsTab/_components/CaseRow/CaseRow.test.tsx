import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCaseView } from "@devdigest/shared";
import evalMessages from "../../../../../../../../../../messages/en/eval.json";
const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { ...actual.api, get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } };
});

import { ApiError } from "@/lib/api";
import { CaseRow } from "./CaseRow";

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

afterEach(cleanup);

const KASE: EvalCaseView = {
  id: "c1",
  owner_kind: "agent",
  owner_id: "a1",
  name: "stripe-key-leak",
  input_diff: "",
  input_files: null,
  input_meta: { title: 'Adds key "sk_live_51H8xq2Ka"', body: "" },
  expected_output: [{ type: "must_find", file: "src/config.ts", start_line: 11, end_line: 11 }],
  notes: null,
  agent_id: "a1",
  source_finding_id: "f1",
  source: { repo_id: "r1", pr_id: "p1", pr_number: 7 },
  last_result: { status: "passed", matched: 1, expected: 1, duration_ms: 1000, cost_usd: 0.01, ran_at: "2026-10-09T10:00:00Z" },
} as EvalCaseView;

function renderRow(kase: EvalCaseView) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
        <CaseRow kase={kase} onEdit={() => {}} onDelete={() => {}} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("CaseRow", () => {
  it("AC-43 Created from PR #N links to the PR page", () => {
    renderRow(KASE);
    expect(screen.getByRole("link", { name: "Created from PR #7" })).toHaveAttribute("href", "/repos/r1/pulls/7");
    expect(screen.getByText("must find")).toBeInTheDocument();
    expect(screen.getByText("matched 1 of 1 expected")).toBeInTheDocument();
  });

  it("AC-44 sk_live_ masked until Reveal", () => {
    renderRow(KASE);
    expect(screen.queryByText(/sk_live_51H8xq2Ka/)).not.toBeInTheDocument();
    expect(screen.getByText("•••• credential hidden")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByText(/sk_live_51H8xq2Ka/)).toBeInTheDocument();
  });

  it("shows never run without a last result", () => {
    renderRow({ ...KASE, source: null, last_result: null, input_meta: { title: "", body: "" } });
    expect(screen.getByText("never run")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("CR-7 shows the reason when starting a run is refused and lets the user retry", async () => {
    post.mockRejectedValue(new ApiError("Too many requests", 429));
    renderRow(KASE);
    fireEvent.click(screen.getByRole("button", { name: "Run case" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests");
    fireEvent.click(screen.getByRole("button", { name: "Run case" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  });

  it("CR-7 recovers when polling the case run fails: reason shown, Play usable again", async () => {
    post.mockResolvedValue({ case_run_id: "cr1", status: "running" });
    get.mockRejectedValue(new ApiError("Case run not found", 404));
    renderRow(KASE);
    fireEvent.click(screen.getByRole("button", { name: "Run case" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Case run not found");
    expect(screen.queryByText("Running…")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run case" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  });

  it("CR-37 a case run whose polls fail five times in a row stays running with a notice, then finishes after recovery", async () => {
    vi.useFakeTimers();
    try {
      post.mockResolvedValue({ case_run_id: "cr1", status: "running" });
      let n = 0;
      get.mockImplementation(async () => {
        n += 1;
        if (n === 1) return { id: "cr1", status: "running" };
        if (n <= 6) throw new ApiError("Bad gateway", 502);
        return { id: "cr1", status: "passed" };
      });
      renderRow(KASE);
      fireEvent.click(screen.getByRole("button", { name: "Run case" }));
      const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
      await tick(100);
      expect(screen.queryByText("Connection problem, retrying…")).not.toBeInTheDocument();
      await tick(1600);
      expect(screen.getByText("Connection problem, retrying…")).toBeInTheDocument();
      for (let i = 0; i < 40 && n < 6; i++) {
        await tick(1000);
        expect(screen.getByText("Running…")).toBeInTheDocument();
        expect(screen.getByText("Connection problem, retrying…")).toBeInTheDocument();
        expect(screen.queryByText("Bad gateway")).not.toBeInTheDocument();
      }
      expect(n).toBe(6);
      fireEvent.click(screen.getByRole("button", { name: "Run case" })); // still running: ignored
      expect(post).toHaveBeenCalledTimes(1);
      await tick(11000);
      expect(screen.queryByText("Connection problem, retrying…")).not.toBeInTheDocument();
      expect(screen.queryByText("Running…")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("CR-8 a newer run handed up by the editor is followed even after an older own run finished", async () => {
    post.mockResolvedValue({ case_run_id: "cr1", status: "running" });
    get.mockImplementation(async (path: string) =>
      path === "/eval-case-runs/cr1" ? { id: "cr1", status: "passed" } : { id: "cr2", status: "running" },
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const tree = (pending?: string) => (
      <QueryClientProvider client={qc}>
        <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
          <CaseRow kase={KASE} pendingRunId={pending} onEdit={() => {}} onDelete={() => {}} />
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
    const { rerender } = render(tree());
    fireEvent.click(screen.getByRole("button", { name: "Run case" }));
    await waitFor(() => expect(get).toHaveBeenCalledWith("/eval-case-runs/cr1"));
    await waitFor(() => expect(screen.queryByText("Running…")).not.toBeInTheDocument());
    rerender(tree("cr2"));
    expect(await screen.findByText("Running…")).toBeInTheDocument();
  });
});
