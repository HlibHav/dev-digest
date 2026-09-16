/**
 * FindingsCell — the PR list FINDINGS column. The cell shows an icon + count per
 * severity of the latest review; hovering it opens a read-only popover
 * "N FINDINGS IN THIS RUN" whose previews load from GET /pulls/:id/reviews.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrMeta, ReviewRecord } from "@devdigest/shared";
import prReview from "../../../../../../../messages/en/prReview.json";

const usePrReviews = vi.fn();
vi.mock("@/lib/hooks", () => ({ usePrReviews: (id: string | null) => usePrReviews(id) }));

import { FindingsCell } from "./FindingsCell";

function finding(id: string, o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id,
    severity: "CRITICAL",
    category: "security",
    title: `Finding ${id}`,
    file: "src/config.ts",
    start_line: 11,
    end_line: 15,
    rationale: "A **live** secret is committed to the repo and ships in every build.",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rev-latest",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function review(id: string, findings: FindingRecord[]): ReviewRecord {
  return {
    id,
    pr_id: "pr-1",
    agent_id: "agent-1",
    run_id: `run-${id}`,
    kind: "review",
    verdict: "request_changes",
    summary: "s",
    score: 50,
    model: "m",
    created_at: "2026-09-16T10:00:00.000Z",
    findings,
  } as ReviewRecord;
}

type Latest = PrMeta["latest_findings"];
const LATEST: Latest = { review_id: "rev-latest", counts: { CRITICAL: 1, WARNING: 0, SUGGESTION: 2 } };

function renderCell(latest: Latest) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview }}>
      <FindingsCell prId="pr-1" latest={latest} />
    </NextIntlClientProvider>,
  );
}

const trigger = () => screen.getByRole("button", { name: /findings in the latest run/i });

beforeEach(() => {
  usePrReviews.mockReset();
  usePrReviews.mockReturnValue({ data: undefined, isLoading: false, isError: false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FindingsCell — counts", () => {
  it("shows — for a PR without a review", () => {
    renderCell(null);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows — when the latest review has no findings", () => {
    renderCell({ review_id: "r", counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } });
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows an icon and count only for severities present, critical first", () => {
    renderCell(LATEST);
    expect(screen.getByLabelText("1 critical")).toHaveTextContent("1");
    expect(screen.getByLabelText("2 suggestion")).toHaveTextContent("2");
    expect(screen.queryByLabelText(/warning/i)).not.toBeInTheDocument();
  });
});

describe("FindingsCell — popover", () => {
  it("loads nothing until hovered, then opens N FINDINGS IN THIS RUN", () => {
    renderCell(LATEST);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(usePrReviews).not.toHaveBeenCalledWith("pr-1");

    fireEvent.mouseEnter(trigger());
    expect(usePrReviews).toHaveBeenLastCalledWith("pr-1");
    expect(screen.getByRole("dialog", { name: "3 FINDINGS IN THIS RUN" })).toBeInTheDocument();
  });

  it("previews the findings of the counted review, read-only", () => {
    usePrReviews.mockReturnValue({
      data: [
        review("rev-newer", [finding("other")]),
        review("rev-latest", [
          finding("s1", { severity: "SUGGESTION", category: "perf", confidence: 0.7 }),
          finding("c1"),
        ]),
      ],
      isLoading: false,
      isError: false,
    });
    renderCell(LATEST);
    fireEvent.mouseEnter(trigger());
    const dialog = screen.getByRole("dialog");

    // the review the counts came from, not simply the newest one; critical first
    expect(within(dialog).queryByText("Finding other")).not.toBeInTheDocument();
    const titles = within(dialog).getAllByText(/^Finding /).map((el) => el.textContent);
    expect(titles).toEqual(["Finding c1", "Finding s1"]);

    expect(within(dialog).getAllByText("security")).toHaveLength(1);
    expect(within(dialog).getByText("perf")).toBeInTheDocument();
    expect(within(dialog).getAllByText("src/config.ts:11-15")).toHaveLength(2);
    expect(within(dialog).getByText("90% conf")).toBeInTheDocument();
    expect(within(dialog).getByText("70% conf")).toBeInTheDocument();
    expect(within(dialog).getAllByText("A live secret is committed to the repo and ships in every build.")).toHaveLength(2);
    expect(within(dialog).queryAllByRole("button")).toHaveLength(0);
  });

  it("shows a loading line while the findings are fetched", () => {
    usePrReviews.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderCell(LATEST);
    fireEvent.mouseEnter(trigger());
    expect(within(screen.getByRole("dialog")).getByText("Loading findings…")).toBeInTheDocument();
  });

  it("opens on keyboard focus and closes shortly after the pointer leaves", () => {
    vi.useFakeTimers();
    renderCell(LATEST);
    fireEvent.focus(trigger());
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.mouseLeave(trigger());
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
