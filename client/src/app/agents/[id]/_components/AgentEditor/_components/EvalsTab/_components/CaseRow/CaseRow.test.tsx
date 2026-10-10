import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCaseView } from "@devdigest/shared";
import evalMessages from "../../../../../../../../../../messages/en/eval.json";
import { CaseRow } from "./CaseRow";

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
  const qc = new QueryClient();
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
});
