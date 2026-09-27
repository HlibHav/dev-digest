import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, SmartDiff } from "@/lib/types";
import messages from "../../../../../../../../messages/en/prReview.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";

const mockUsePrComments = vi.fn();
const mockUseCreatePrComment = vi.fn();
const mockUsePrReviews = vi.fn();
const mockUsePrActiveRuns = vi.fn();
const mockUseSmartDiff = vi.fn();
const mockUseFindingAction = vi.fn();
const mockInvalidateQueries = vi.fn();

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  usePrComments: () => mockUsePrComments(),
  useCreatePrComment: () => mockUseCreatePrComment(),
  usePrReviews: () => mockUsePrReviews(),
  usePrActiveRuns: () => mockUsePrActiveRuns(),
  useSmartDiff: () => mockUseSmartDiff(),
  useFindingAction: () => mockUseFindingAction(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

import { DiffTab } from "./DiffTab";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, shell: shellMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

// Three files: one per role we exercise (core / tests / boilerplate).
const FILES: PrFile[] = [
  { path: "server/src/x.ts", additions: 2, deletions: 0, patch: "@@ -0,0 +1,2 @@\n+a\n+b" },
  {
    path: "server/test/x.test.ts",
    additions: 3,
    deletions: 0,
    patch: "@@ -0,0 +1,3 @@\n+import foo\n+test()\n+expect(foo).toBe(1)",
  },
  {
    path: "pnpm-lock.yaml",
    additions: 1,
    deletions: 0,
    patch: "@@ -1,1 +1,2 @@\n existing\n+lockfile-entry",
  },
];

const SMART_DIFF: SmartDiff = {
  groups: [
    { role: "core", files: [{ path: "server/src/x.ts", additions: 2, deletions: 0, finding_lines: [] }] },
    {
      role: "tests",
      files: [{ path: "server/test/x.test.ts", additions: 3, deletions: 0, finding_lines: [] }],
    },
    {
      role: "boilerplate",
      files: [{ path: "pnpm-lock.yaml", additions: 1, deletions: 0, finding_lines: [] }],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 6, proposed_splits: [] },
};

function renderDiffTab(prId = "pr1") {
  return renderWithIntl(<DiffTab prId={prId} filesCount={FILES.length} files={FILES} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePrComments.mockReturnValue({ data: [] });
  mockUseCreatePrComment.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  mockUsePrReviews.mockReturnValue({ data: [] });
  mockUsePrActiveRuns.mockReturnValue({ data: [] });
  mockUseSmartDiff.mockReturnValue({ data: SMART_DIFF });
  mockUseFindingAction.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

describe("DiffTab — smart order (default)", () => {
  it("renders the role groups in server order with their hints, files inside, and the lock file under boilerplate", () => {
    const { container } = renderDiffTab();

    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getByText("Business logic")).toBeInTheDocument();
    expect(screen.getByText("Tests")).toBeInTheDocument();
    expect(screen.getByText("Test coverage")).toBeInTheDocument();
    expect(screen.getByText("Boilerplate")).toBeInTheDocument();
    expect(screen.getByText("Generated & lockfiles")).toBeInTheDocument();

    // groups render in the order the smart-diff response gave them
    const text = container.textContent ?? "";
    expect(text.indexOf("Core")).toBeLessThan(text.indexOf("Tests"));
    expect(text.indexOf("Tests")).toBeLessThan(text.indexOf("Boilerplate"));

    // core and tests start open (only docs/boilerplate collapse by default)
    expect(screen.getByText("server/src/x.ts")).toBeInTheDocument();
    expect(screen.getByText("server/test/x.test.ts")).toBeInTheDocument();

    // boilerplate starts collapsed — its file isn't rendered until expanded,
    // which also proves the lock file lives under THIS group, not the others
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Boilerplate"));
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
  });
});

describe("DiffTab — order toggle", () => {
  it("switches to the flat original-order list on click, and back to grouped smart order", () => {
    renderDiffTab();
    expect(screen.getByText("Core")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Original order"));

    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    expect(screen.queryByText("Tests")).not.toBeInTheDocument();
    expect(screen.queryByText("Boilerplate")).not.toBeInTheDocument();

    // flat list renders every file directly, in the `files` prop order
    expect(screen.getByText("server/src/x.ts")).toBeInTheDocument();
    expect(screen.getByText("server/test/x.test.ts")).toBeInTheDocument();
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Smart order"));

    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getByText("Tests")).toBeInTheDocument();
    expect(screen.getByText("Boilerplate")).toBeInTheDocument();
  });
});

describe("DiffTab — smart-diff loading", () => {
  it("falls back to the flat list while the smart-diff query has no data yet", () => {
    mockUseSmartDiff.mockReturnValue({ data: undefined });
    renderDiffTab();

    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    expect(screen.queryByText("Tests")).not.toBeInTheDocument();
    expect(screen.queryByText("Boilerplate")).not.toBeInTheDocument();

    expect(screen.getByText("server/src/x.ts")).toBeInTheDocument();
    expect(screen.getByText("server/test/x.test.ts")).toBeInTheDocument();
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
  });
});

describe("DiffTab — active-run driven reviews invalidation", () => {
  it("invalidates reviews when active runs go from non-empty to empty", () => {
    mockUsePrActiveRuns.mockReturnValue({
      data: [{ run_id: "r1", agent_id: null, agent_name: null, ran_at: null }],
    });
    const { rerender } = renderDiffTab();

    expect(mockInvalidateQueries).not.toHaveBeenCalled();

    mockUsePrActiveRuns.mockReturnValue({ data: [] });
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages, shell: shellMessages }}>
        <DiffTab prId="pr1" filesCount={FILES.length} files={FILES} />
      </NextIntlClientProvider>,
    );

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["reviews", "pr1"] });
  });

  it("does not invalidate reviews on the initial render with an empty active-runs list", () => {
    mockUsePrActiveRuns.mockReturnValue({ data: [] });
    renderDiffTab();

    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });
});
