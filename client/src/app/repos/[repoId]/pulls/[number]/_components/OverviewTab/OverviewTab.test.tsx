import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import intentMessages from "../../../../../../../../messages/en/intent.json";
import blastMessages from "../../../../../../../../messages/en/blast.json";

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

interface Routes {
  indexState?: { lastIndexedSha: string; status: string };
  blast?: unknown;
}

function configureGet({ indexState, blast }: Routes) {
  getMock.mockImplementation(async (path: string) => {
    if (path === `/pulls/${PR_ID}/intent`) {
      throw new ApiError("not found", 404, "not_found");
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

function renderOverview() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider
        locale="en"
        timeZone="UTC"
        messages={{ intent: intentMessages, blast: blastMessages }}
        onError={(e) => {
          throw e;
        }}
      >
        {/* repoId/repoFullName are part of the plan's OverviewTabProps (step 6);
            passed here ahead of that change landing. */}
        <OverviewTab
          prId={PR_ID}
          prBody={null}
          headSha={HEAD_SHA}
          repoId={REPO_ID}
          repoFullName={REPO_FULL_NAME}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
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
