import type { ComponentProps } from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import intentMessages from "../../../../../../../../messages/en/intent.json";
import blastMessages from "../../../../../../../../messages/en/blast.json";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      get: getMock,
      post: postMock,
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

import { ApiError } from "@/lib/api";
import { OverviewTab } from "./OverviewTab";

afterEach(cleanup);

const PR_ID = "pr-1";
const REPO_ID = "repo-1";
const REPO_FULL_NAME = "acme/repo";
const HEAD_SHA = "head7777777";

const BLAST = {
  changed_symbols: [{ name: "foo", file: "a.ts", kind: "function" }],
  downstream: [
    {
      symbol: "foo",
      callers: [{ name: "foo", file: "b.ts", line: 10 }],
      endpoints_affected: ["GET /x"],
      crons_affected: [],
    },
  ],
  summary: "1 changed symbol(s) · 1 caller(s) · 1 endpoint(s) · 0 cron/job(s)",
};

const DEGRADED_BLAST = { ...BLAST, degraded: true, reason: "no_data" };

const FILES: PrFile[] = [
  { path: "src/a.ts", additions: 4, deletions: 0, patch: "@@ -10,3 +10,4 @@\n c\n c\n+x\n c" },
  { path: "src/b.ts", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n c\n+y" },
];

const SETTLED = { status: "success" as const, updatedAt: 1000 };

const BRIEF = {
  summary: "Adds a rate limiter to the API gateway.",
  intent: null,
  blast: null,
  risks: {
    risks: [
      {
        kind: "correctness",
        title: "Limiter keyed on IP only",
        explanation: "Clients behind one NAT share a single bucket.",
        severity: "high",
        file_refs: ["src/b.ts"],
        line_refs: [{ file: "src/b.ts", start_line: 5, end_line: 9 }],
      },
    ],
  },
  review_focus: [{ file: "src/a.ts", line: 12, reason: "Window reset logic" }],
  history: null,
  head_sha: HEAD_SHA,
  generated_at: "2026-10-03T10:00:00.000Z",
  model: "openrouter/openai/gpt-4.1-mini",
  tokens_in: 1200,
  tokens_out: 300,
  cost_usd: 0.014,
  missing_inputs: [],
  truncated_inputs: [],
  stale: false,
};

const LATEST_REVIEW = {
  verdict: "request_changes" as const,
  summary: "Latest review summary",
  score: 61,
  findingsCount: 3,
  blockers: 1,
  agentName: "Sec agent",
};

const BRIEF_PATH = `/pulls/${PR_ID}/brief`;

const briefGets = () => getMock.mock.calls.filter(([p]) => p === BRIEF_PATH).length;

interface Routes {
  indexState?: { lastIndexedSha: string; status: string };
  blast?: unknown;
  /** What GET /pulls/:id/brief answers: `{ brief }`. Defaults to no stored brief. */
  brief?: unknown;
}

function configureGet({ indexState, blast, brief }: Routes) {
  getMock.mockImplementation(async (path: string) => {
    if (path === `/pulls/${PR_ID}/intent`) {
      throw new ApiError("not found", 404, "not_found");
    }
    if (path === BRIEF_PATH) {
      return { brief: brief ?? null };
    }
    if (path === `/pulls/${PR_ID}/blast`) {
      return blast ?? BLAST;
    }
    if (path === `/repos/${REPO_ID}/index-state`) {
      return (
        indexState ?? {
          status: "full",
          filesIndexed: 1,
          filesSkipped: 0,
          lastIndexedSha: "deadbeef",
          updatedAt: "2026-09-28T00:00:00.000Z",
        }
      );
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

type OverviewProps = ComponentProps<typeof OverviewTab>;

function renderOverview(overrides: Partial<OverviewProps> = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onOpenFile = vi.fn();
  const tree = (extra: Partial<OverviewProps>) => (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider
        locale="en"
        timeZone="UTC"
        messages={{
          intent: intentMessages,
          blast: blastMessages,
          brief: briefMessages,
          prReview: prReviewMessages,
        }}
        onError={(e) => {
          throw e;
        }}
      >
        <OverviewTab
          prId={PR_ID}
          prBody={null}
          headSha={HEAD_SHA}
          repoId={REPO_ID}
          repoFullName={REPO_FULL_NAME}
          detail={SETTLED}
          files={FILES}
          latestReview={null}
          onOpenFile={onOpenFile}
          {...overrides}
          {...extra}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const view = render(tree({}));
  return { ...view, onOpenFile, rerenderWith: (extra: Partial<OverviewProps>) => view.rerender(tree(extra)) };
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
});

describe("OverviewTab — blast radius block", () => {
  it("renders the Blast radius block from GET /pulls/:id/blast", async () => {
    configureGet({});
    renderOverview();

    expect(await screen.findByText("Blast radius")).toBeInTheDocument();
    expect(await screen.findByText("b.ts:10")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith(`/pulls/${PR_ID}/blast`);
  });
});

describe("OverviewTab — link sha", () => {
  it("link sha comes from GET /repos/:id/index-state, falls back to head_sha", async () => {
    // lastIndexedSha === '' for a repo with no index yet — falls back to head_sha.
    configureGet({ indexState: { status: "failed", lastIndexedSha: "" } });
    renderOverview();

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith(`/repos/${REPO_ID}/index-state`);
    });

    await waitFor(() => {
      const link = screen.getByRole("link", { name: "b.ts:10" });
      expect(link).toHaveAttribute(
        "href",
        `https://github.com/${REPO_FULL_NAME}/blob/${HEAD_SHA}/b.ts#L10`,
      );
    });
  });
});

describe("OverviewTab — resync", () => {
  it("Resync posts to /repos/:id/resync", async () => {
    configureGet({ blast: DEGRADED_BLAST });
    postMock.mockImplementation(async (path: string) => {
      if (path === `/repos/${REPO_ID}/resync`) return { status: "queued" };
      throw new Error(`unexpected POST ${path}`);
    });
    renderOverview();

    const button = await screen.findByRole("button", { name: "Resync index" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(`/repos/${REPO_ID}/resync`);
    });
    expect(
      await screen.findByText("Resync queued. Reload in a minute to see the new map."),
    ).toBeInTheDocument();
  });
});

describe("OverviewTab — PR Brief block", () => {
  // AC-36
  it("PR Brief block precedes the Intent and Blast cards in DOM order", async () => {
    configureGet({});
    renderOverview();

    const brief = await screen.findByText("PR Brief");
    const intent = await screen.findByText("Stated intent");
    const blast = await screen.findByText("Blast radius");

    expect(brief.compareDocumentPosition(intent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(brief.compareDocumentPosition(blast) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // AC-39
  it("after Generate, summary, rows and both cards are present", async () => {
    configureGet({});
    postMock.mockImplementation(async (path: string) => {
      if (path === BRIEF_PATH) return { brief: BRIEF };
      throw new Error(`unexpected POST ${path}`);
    });
    renderOverview();

    fireEvent.click(await screen.findByRole("button", { name: "Generate brief" }));

    expect(await screen.findByText("Adds a rate limiter to the API gateway.")).toBeInTheDocument();
    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getByText(/Limiter keyed on IP only/)).toBeInTheDocument();
    expect(screen.getByText("Review focus")).toBeInTheDocument();
    expect(screen.getByText(/Window reset logic/)).toBeInTheDocument();
    // The Intent and Blast radius cards stay rendered beside the brief.
    expect(screen.getByText("Stated intent")).toBeInTheDocument();
    expect(await screen.findByText("Blast radius")).toBeInTheDocument();
    // Exactly one generation request.
    expect(postMock.mock.calls.map(([p]) => p)).toEqual([BRIEF_PATH]);
  });

  // AC-51 wiring: files -> prPaths, onOpenFile passed through
  it("clicking a review-focus item calls onOpenFile with the file and line", async () => {
    configureGet({ brief: BRIEF });
    const { onOpenFile } = renderOverview();

    fireEvent.click(await screen.findByRole("button", { name: /src\/a\.ts:12/ }));

    expect(onOpenFile).toHaveBeenCalledTimes(1);
    expect(onOpenFile).toHaveBeenCalledWith({ file: "src/a.ts", line: 12 });
  });

  it("a focus item whose file is not among the files prop stays on Overview", async () => {
    configureGet({ brief: BRIEF });
    const { onOpenFile } = renderOverview({ files: [FILES[1]!] });

    fireEvent.click(await screen.findByRole("button", { name: /src\/a\.ts:12/ }));

    expect(await screen.findByText("File not in this PR's diff")).toBeInTheDocument();
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  // AC-55 wiring
  it("shows the latest review's verdict banner above the brief summary", async () => {
    configureGet({ brief: BRIEF });
    renderOverview({ latestReview: LATEST_REVIEW });

    const verdict = await screen.findByText("Request changes");
    const summary = await screen.findByText("Adds a rate limiter to the API gateway.");
    expect(screen.getByText("Latest review summary")).toBeInTheDocument();
    expect(screen.getByText("3 findings · 1 blockers")).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
    expect(verdict.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the summary alone when there is no latest review", async () => {
    configureGet({ brief: BRIEF });
    renderOverview({ latestReview: null });

    expect(await screen.findByText("Adds a rate limiter to the API gateway.")).toBeInTheDocument();
    expect(screen.queryByText("Request changes")).not.toBeInTheDocument();
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
  });
});

describe("OverviewTab — brief read gate (AC-46a)", () => {
  it("does not read the brief while the PR detail is pending, and reads it once it settles", async () => {
    configureGet({});
    const { rerenderWith } = renderOverview({ detail: { status: "pending", updatedAt: 0 } });

    // Wait for sibling cards to finish loading so a premature brief read would have happened.
    await screen.findByText("b.ts:10");
    expect(briefGets()).toBe(0);

    rerenderWith({ detail: { status: "success", updatedAt: 1000 } });
    await waitFor(() => expect(briefGets()).toBe(1));
  });

  it("re-reads the brief when the PR detail is refreshed again", async () => {
    configureGet({});
    const { rerenderWith } = renderOverview({ detail: { status: "success", updatedAt: 1000 } });
    await waitFor(() => expect(briefGets()).toBe(1));

    rerenderWith({ detail: { status: "success", updatedAt: 2000 } });
    await waitFor(() => expect(briefGets()).toBe(2));
  });

  it("still reads the brief once when the detail request errored", async () => {
    configureGet({});
    renderOverview({ detail: { status: "error", updatedAt: 500 } });

    await waitFor(() => expect(briefGets()).toBe(1));
  });
});
