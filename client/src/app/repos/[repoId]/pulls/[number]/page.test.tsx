import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// The page's job: turn a focus click into a ?tab=diff&file=&line= address, turn
// that address back into DiffTab's `focus`, and hand OverviewTab the PR detail
// gate, the files and the latest review. The tabs themselves are tested on
// their own, so they are replaced by probes that capture their props.
const h = vi.hoisted(() => ({
  search: "",
  replace: vi.fn(),
  overviewProps: null as Record<string, any> | null,
  diffProps: null as Record<string, any> | null,
  detail: {} as Record<string, any>,
  reviews: undefined as unknown[] | undefined,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo-1", number: "7" }),
  useSearchParams: () => new URLSearchParams(h.search),
  useRouter: () => ({ push: vi.fn(), replace: h.replace }),
}));
vi.mock("../../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/repo" } }),
  useRepoNotFound: () => false,
}));
vi.mock("../../../../../lib/hooks", () => ({
  usePulls: () => ({ data: [{ id: "pr-1", number: 7 }], isLoading: false }),
  usePullDetail: () => h.detail,
}));
vi.mock("../../../../../lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: h.reviews, refetch: vi.fn() }),
  useCancelRun: () => ({}),
  usePrActiveRuns: () => ({ data: [] }),
  usePrRuns: () => ({ data: [] }),
  useDeleteRun: () => ({ mutate: vi.fn() }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("./_components/PrDetailHeader", () => ({ PrDetailHeader: () => null }));
vi.mock("./_components/FindingsTab", () => ({ FindingsTab: () => null }));
vi.mock("./_components/RunTraceDrawer", () => ({ default: () => null }));
vi.mock("./_components/OverviewTab", () => ({
  OverviewTab: (props: Record<string, any>) => {
    h.overviewProps = props;
    return (
      <button type="button" onClick={() => props.onOpenFile({ file: "src/a.ts", line: 12 })}>
        open focus item
      </button>
    );
  },
}));
vi.mock("./_components/DiffTab", () => ({
  DiffTab: (props: Record<string, any>) => {
    h.diffProps = props;
    return <div>diff tab</div>;
  },
}));

import PRDetailPage from "./page";

const FILES = [
  { path: "src/a.ts", additions: 4, deletions: 0, patch: "@@ -10,3 +10,4 @@\n c\n c\n+x\n c" },
  { path: "src/b.ts", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n c\n+y" },
];

function detailQuery(overrides: Record<string, any> = {}) {
  return {
    data: {
      id: "pr-1",
      number: 7,
      body: "pr body",
      head_sha: "head7777777",
      status: "open",
      files: FILES,
      files_count: FILES.length,
      commits: [],
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    dataUpdatedAt: 1234,
    errorUpdatedAt: 0,
    ...overrides,
  };
}

const finding = (severity: string, dismissed_at: string | null = null) => ({
  id: `f-${Math.random()}`,
  kind: "bug",
  severity,
  dismissed_at,
});

beforeEach(() => {
  h.search = "";
  h.replace.mockReset();
  h.overviewProps = null;
  h.diffProps = null;
  h.detail = detailQuery();
  h.reviews = [];
});
afterEach(cleanup);

describe("PR detail page — click-through address (AC-51)", () => {
  it("clicking a focus item calls router.replace with ?tab=diff&file=src%2Fa.ts&line=12", () => {
    render(<PRDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "open focus item" }));

    expect(h.replace).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledWith("/repos/repo-1/pulls/7?tab=diff&file=src%2Fa.ts&line=12");
  });

  it("drops a previous line param when the opened target has no line", () => {
    h.search = "tab=overview&file=old.ts&line=5";
    render(<PRDetailPage />);
    expect(h.overviewProps).not.toBeNull();

    h.overviewProps!.onOpenFile({ file: "src/b.ts", line: null });

    expect(h.replace).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledWith("/repos/repo-1/pulls/7?tab=diff&file=src%2Fb.ts");
  });

  it("keeps unrelated params such as trace when it opens a file", () => {
    h.search = "trace=run-9";
    render(<PRDetailPage />);

    h.overviewProps!.onOpenFile({ file: "src/a.ts", line: 12 });

    expect(h.replace).toHaveBeenCalledWith(
      "/repos/repo-1/pulls/7?trace=run-9&tab=diff&file=src%2Fa.ts&line=12",
    );
  });

  it("the address ?tab=diff&file=src%2Fa.ts&line=12 renders DiffTab with focus {file, line: 12}", () => {
    h.search = "tab=diff&file=src%2Fa.ts&line=12";
    render(<PRDetailPage />);

    expect(screen.getByText("diff tab")).toBeInTheDocument();
    expect(h.diffProps!.focus).toEqual({ file: "src/a.ts", line: 12 });
  });

  it.each([["abc"], ["1.5"]])("a non-integer line %j gives focus.line null", (line) => {
    h.search = `tab=diff&file=src%2Fa.ts&line=${line}`;
    render(<PRDetailPage />);

    expect(h.diffProps!.focus).toEqual({ file: "src/a.ts", line: null });
  });

  it("an address with a file and no line gives focus.line null", () => {
    h.search = "tab=diff&file=src%2Fa.ts";
    render(<PRDetailPage />);

    expect(h.diffProps!.focus).toEqual({ file: "src/a.ts", line: null });
  });

  it("an address with no file gives DiffTab no focus", () => {
    h.search = "tab=diff";
    render(<PRDetailPage />);

    expect(screen.getByText("diff tab")).toBeInTheDocument();
    expect(h.diffProps!.focus ?? null).toBeNull();
  });
});

describe("PR detail page — what OverviewTab receives", () => {
  it("passes the PR detail gate (AC-46a): status success and the detail's updatedAt", () => {
    render(<PRDetailPage />);

    expect(h.overviewProps!.detail).toEqual({ status: "success", updatedAt: 1234 });
  });

  it("passes the files of the PR", () => {
    render(<PRDetailPage />);

    expect(h.overviewProps!.files).toEqual(FILES);
  });

  it("passes the latest review (the first one) as latestReview (AC-55)", () => {
    h.reviews = [
      {
        id: "rev-new",
        verdict: "request_changes",
        summary: "newest summary",
        score: 42,
        agent_name: "Sec agent",
        findings: [finding("CRITICAL"), finding("CRITICAL", "2026-10-03T00:00:00Z"), finding("WARNING")],
      },
      {
        id: "rev-old",
        verdict: "approve",
        summary: "older summary",
        score: 99,
        agent_name: "Old agent",
        findings: [],
      },
    ];
    render(<PRDetailPage />);

    expect(h.overviewProps!.latestReview).toEqual({
      verdict: "request_changes",
      summary: "newest summary",
      score: 42,
      findingsCount: 3,
      blockers: 1,
      agentName: "Sec agent",
    });
  });

  it("passes latestReview null when the PR has no reviews", () => {
    h.reviews = [];
    render(<PRDetailPage />);

    expect(h.overviewProps!.latestReview).toBeNull();
  });

  it("passes latestReview null while reviews have not loaded", () => {
    h.reviews = undefined;
    render(<PRDetailPage />);

    expect(h.overviewProps!.latestReview).toBeNull();
  });
});

describe("PR detail page — failed detail", () => {
  it("keeps the error state and never mounts the Overview", () => {
    h.detail = detailQuery({ data: undefined, isError: true, error: new Error("boom"), dataUpdatedAt: 0, errorUpdatedAt: 99 });
    render(<PRDetailPage />);

    expect(screen.getByText("Couldn't load this pull request")).toBeInTheDocument();
    expect(h.overviewProps).toBeNull();
  });
});
