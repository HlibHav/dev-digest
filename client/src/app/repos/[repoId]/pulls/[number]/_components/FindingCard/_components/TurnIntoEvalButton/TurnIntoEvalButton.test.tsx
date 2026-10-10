import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord } from "@devdigest/shared";
import evalMessages from "../../../../../../../../../../messages/en/eval.json";

const post = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { ...actual.api, post: (...a: unknown[]) => post(...a) } };
});

import { ApiError } from "@/lib/api";
import { TurnIntoEvalButton } from "./TurnIntoEvalButton";

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "r",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: "2026-10-09T10:00:00.000Z",
  dismissed_at: null,
};

function renderButton(finding: FindingRecord, agent: { id: string | null; name: string | null }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
        <TurnIntoEvalButton finding={finding} agent={agent} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => post.mockReset());
afterEach(cleanup);

describe("TurnIntoEvalButton", () => {
  it("AC-12 confirmation names the agent and links to its Evals tab; a 422 shows the reason", async () => {
    post.mockResolvedValueOnce({ case: { id: "c9" }, agent: { id: "a1", name: "Security Reviewer" } });
    renderButton(FINDING, { id: "a1", name: "Security Reviewer" });

    fireEvent.click(screen.getByRole("button", { name: /turn into eval case/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/findings/f1/eval-case"));
    expect(await screen.findByText(/Eval case added to Security Reviewer/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Evals" })).toHaveAttribute(
      "href",
      "/agents/a1?tab=evals&case=c9",
    );
    cleanup();

    post.mockRejectedValueOnce(new ApiError("Finding has no stored diff", 422));
    renderButton(FINDING, { id: "a1", name: "Security Reviewer" });
    fireEvent.click(screen.getByRole("button", { name: /turn into eval case/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Finding has no stored diff");
  });

  it("an undecided finding is disabled with the hint", () => {
    renderButton({ ...FINDING, accepted_at: null }, { id: "a1", name: "A" });
    expect(screen.getByRole("button", { name: /turn into eval case/i })).toBeDisabled();
    expect(screen.getByText("Accept or dismiss first")).toBeInTheDocument();
  });

  it("a null agent is disabled", () => {
    renderButton(FINDING, { id: null, name: null });
    expect(screen.getByRole("button", { name: /turn into eval case/i })).toBeDisabled();
    expect(screen.getByText("This finding's review has no agent")).toBeInTheDocument();
  });

  it("a double click sends one request", async () => {
    let resolve!: (v: unknown) => void;
    post.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    renderButton(FINDING, { id: "a1", name: "A" });
    const btn = screen.getByRole("button", { name: /turn into eval case/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    resolve({ case: { id: "c1" }, agent: { id: "a1", name: "A" } });
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
  });
});
