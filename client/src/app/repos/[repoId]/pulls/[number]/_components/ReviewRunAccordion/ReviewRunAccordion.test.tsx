/**
 * ReviewRunAccordion — the header shows the run's compact cost between the
 * score and the date, and "—" when the run has no cost data.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord } from "@devdigest/shared";
import common from "../../../../../../../../messages/en/common.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(cleanup);

const REVIEW: ReviewRecord = {
  id: "rev-1",
  pr_id: "pr-1",
  agent_id: "a1",
  run_id: "run-1",
  agent_name: "Security Reviewer",
  kind: "review",
  verdict: "request_changes",
  summary: "Two critical exposures.",
  score: 38,
  model: "deepseek/deepseek-v4-flash",
  grounding: "3/3 passed",
  created_at: "2026-06-13T20:52:51.000Z",
  findings: [],
};

function renderAccordion(costUsd: number | null | undefined) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <ReviewRunAccordion review={REVIEW} prId="pr-1" costUsd={costUsd} />
    </NextIntlClientProvider>,
  );
}

describe("ReviewRunAccordion — cost in the header", () => {
  it("shows the compact run cost next to the score", () => {
    renderAccordion(0.0013);
    expect(screen.getByText("38")).toBeInTheDocument();
    expect(screen.getByText("$0.001")).toBeInTheDocument();
  });

  it("shows — when the run has no cost data", () => {
    renderAccordion(undefined);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
