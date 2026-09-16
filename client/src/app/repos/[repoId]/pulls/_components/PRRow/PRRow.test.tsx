/**
 * PRRow — the COST cell shows the PR's summed run cost, and "—" for a
 * PR whose runs carry no cost data (never reviewed, or reviewed before cost
 * was persisted).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import prReview from "../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../messages/en/common.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/hooks", () => ({ usePrReviews: () => ({ data: undefined, isLoading: false, isError: false }) }));

import { PRRow } from "./PRRow";

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "sha",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: "2026-09-16T08:00:00.000Z",
    updated_at: "2026-09-16T09:00:00.000Z",
    score: 61,
    cost_usd: null,
    // one critical finding, so the FINDINGS cell renders icons rather than a second "—"
    latest_findings: { review_id: "rev-1", counts: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 } },
    ...o,
  };
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, common }}>
      <PRRow pr={p} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost cell", () => {
  it("shows the compact summed run cost of the PR", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows — when the PR has no cost data", () => {
    renderRow(pr({ score: 61, cost_usd: null }));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });
});

describe("PRRow — findings cell", () => {
  it("renders the latest review's findings between score and status", () => {
    renderRow(pr({}));
    expect(screen.getByRole("button", { name: "1 finding in the latest run" })).toBeInTheDocument();
    expect(screen.getByLabelText("1 critical")).toBeInTheDocument();
  });
});
