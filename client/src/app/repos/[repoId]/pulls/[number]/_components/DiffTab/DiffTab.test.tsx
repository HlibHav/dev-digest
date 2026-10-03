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

// AC-51 (Files changed half): a focus {file, line} opens the file's card even
// when its role group or the card itself starts collapsed, scrolls the line
// into view and marks it highlighted — in Smart and Original order.
describe("DiffTab — focus (file + line from the page address)", () => {
  // `docs` groups start collapsed, and a file with more than 200 changed lines
  // starts collapsed too: src/a.ts is behind BOTH collapses by default.
  const FOCUS_FILES: PrFile[] = [
    {
      path: "src/a.ts",
      additions: 250,
      deletions: 0,
      patch: "@@ -10,3 +10,4 @@\n keep10\n keep11\n+added12\n keep13",
    },
    { path: "src/other.ts", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n c\n+other-line" },
  ];
  const FOCUS_SMART_DIFF: SmartDiff = {
    groups: [
      { role: "core", files: [{ path: "src/other.ts", additions: 1, deletions: 0, finding_lines: [] }] },
      { role: "docs", files: [{ path: "src/a.ts", additions: 250, deletions: 0, finding_lines: [] }] },
    ],
    split_suggestion: { too_big: false, total_lines: 251, proposed_splits: [] },
  };

  type Focus = { file: string; line: number | null } | null | undefined;
  const tree = (focus: Focus) => (
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, shell: shellMessages }}>
      <DiffTab prId="pr1" filesCount={FOCUS_FILES.length} files={FOCUS_FILES} focus={focus} />
    </NextIntlClientProvider>
  );

  const scrollSpy = vi.fn();
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  const highlighted = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("[data-highlighted]")).filter(
      (el) => el.getAttribute("data-highlighted") !== "false",
    );

  beforeEach(() => {
    scrollSpy.mockReset();
    Element.prototype.scrollIntoView = scrollSpy;
    mockUseSmartDiff.mockReturnValue({ data: FOCUS_SMART_DIFF });
  });
  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it("Smart order: opens the collapsed docs group and the collapsed card, scrolls line 12 into view and highlights it", () => {
    const { container } = render(tree({ file: "src/a.ts", line: 12 }));

    // group and card are open: the file header and its diff lines are rendered
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(screen.getByText("added12")).toBeInTheDocument();

    const marked = highlighted(container);
    expect(marked).toHaveLength(1);
    expect(marked[0]!.textContent).toContain("added12");
    expect(marked[0]!.textContent).not.toContain("keep13");

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    const scrolled = scrollSpy.mock.contexts[0] as Element;
    expect(scrolled.textContent).toContain("added12");
    expect(scrolled.textContent).not.toContain("keep13");
  });

  it("Original order: opens the collapsed card, scrolls line 12 into view and highlights it", () => {
    // no smart-diff data yet -> the flat, ungrouped list (no role groups at all)
    mockUseSmartDiff.mockReturnValue({ data: undefined });
    const { container } = render(tree({ file: "src/a.ts", line: 12 }));

    expect(screen.queryByText("Docs")).not.toBeInTheDocument();
    expect(screen.getByText("added12")).toBeInTheDocument();

    const marked = highlighted(container);
    expect(marked).toHaveLength(1);
    expect(marked[0]!.textContent).toContain("added12");

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect((scrollSpy.mock.contexts[0] as Element).textContent).toContain("added12");
  });

  it("opens the card and highlights line 12 after switching to Original order with the focus set", () => {
    const { container } = render(tree({ file: "src/a.ts", line: 12 }));

    fireEvent.click(screen.getByText("Original order"));

    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    expect(screen.getByText("added12")).toBeInTheDocument();
    const marked = highlighted(container);
    expect(marked).toHaveLength(1);
    expect(marked[0]!.textContent).toContain("added12");
  });

  it("reopens a collapsed group and card when the focus changes after mount", () => {
    const { container, rerender } = render(tree(null));

    // no focus: docs group is collapsed, nothing highlighted, nothing scrolled
    expect(screen.queryByText("src/a.ts")).not.toBeInTheDocument();
    expect(highlighted(container)).toHaveLength(0);
    expect(scrollSpy).not.toHaveBeenCalled();

    rerender(tree({ file: "src/a.ts", line: 12 }));

    expect(screen.getByText("added12")).toBeInTheDocument();
    expect(highlighted(container)).toHaveLength(1);
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect((scrollSpy.mock.contexts[0] as Element).textContent).toContain("added12");
  });

  it("focus line null opens the card and does not scroll or highlight", () => {
    const { container } = render(tree({ file: "src/a.ts", line: null }));

    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(screen.getByText("added12")).toBeInTheDocument();
    expect(scrollSpy).not.toHaveBeenCalled();
    expect(highlighted(container)).toHaveLength(0);
  });

  it.each([
    ["a line that is not in the diff", 999],
    ["a NaN line", Number.NaN],
  ])("%s opens the card without scrolling or highlighting", (_label, line) => {
    const { container } = render(tree({ file: "src/a.ts", line }));

    expect(screen.getByText("added12")).toBeInTheDocument();
    expect(scrollSpy).not.toHaveBeenCalled();
    expect(highlighted(container)).toHaveLength(0);
  });

  it("an unknown file leaves the tab as it was: no scroll, no highlight, docs group still collapsed", () => {
    const { container } = render(tree({ file: "nope/missing.ts", line: 3 }));

    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getByText("src/other.ts")).toBeInTheDocument();
    expect(screen.queryByText("src/a.ts")).not.toBeInTheDocument();
    expect(scrollSpy).not.toHaveBeenCalled();
    expect(highlighted(container)).toHaveLength(0);
  });
});
