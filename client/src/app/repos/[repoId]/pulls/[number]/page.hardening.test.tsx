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
vi.mock("./_components/PrDetailHeader", () => ({
  PrDetailHeader: (props: Record<string, any>) => (
    <button type="button" onClick={() => props.onSetTab("diff")}>
      tab bar diff
    </button>
  ),
}));
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

beforeEach(() => {
  h.search = "";
  h.replace.mockReset();
  h.overviewProps = null;
  h.diffProps = null;
  h.detail = detailQuery();
  h.reviews = [];
});
afterEach(cleanup);

describe("PR detail page — tab bar clears the click-through address", () => {
  it("switching tabs drops file and line", () => {
    h.search = "tab=diff&file=src%2Fa.ts&line=12";
    render(<PRDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: "tab bar diff" }));

    expect(h.replace).toHaveBeenCalledWith("/repos/repo-1/pulls/7?tab=diff");
  });
});
