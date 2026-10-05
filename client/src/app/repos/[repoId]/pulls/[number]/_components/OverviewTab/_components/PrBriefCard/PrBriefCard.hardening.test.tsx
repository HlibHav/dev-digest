import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { PrBriefResult, Risk } from "@devdigest/shared/contracts/brief";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../../../messages/en/prReview.json";

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
import { PrBriefCard } from "./PrBriefCard";
import { SEVERITY_COLOR } from "./constants";

afterEach(cleanup);
beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
});

const PR_ID = "pr-1";
const BRIEF_PATH = `/pulls/${PR_ID}/brief`;

const RATELIMIT_RISK: Risk = {
  kind: "security",
  title: "Rate limiter can be bypassed",
  explanation: "The bucket key ignores the forwarded address, so one client can spread requests.",
  severity: "high",
  file_refs: ["src/middleware/ratelimit.ts"],
  line_refs: [{ file: "src/middleware/ratelimit.ts", start_line: 12, end_line: 18 }],
};
const PACKAGE_RISK: Risk = {
  kind: "dependency",
  title: "New dependency without a lockfile bump",
  explanation: "package.json changed but the lockfile did not.",
  severity: "low",
  file_refs: ["package.json"],
  line_refs: [{ file: "package.json", start_line: 34, end_line: 34 }],
};
const README_RISK: Risk = {
  kind: "docs",
  title: "Docs describe the old limit",
  explanation: "The README still says 100 requests per minute.",
  severity: "medium",
  file_refs: ["docs/README.md"],
};

function makeBrief(overrides: Partial<PrBriefResult> = {}): PrBriefResult {
  return {
    summary: "Adds a token-bucket limiter to the public API.",
    intent: null,
    blast: null,
    risks: { risks: [RATELIMIT_RISK, PACKAGE_RISK, README_RISK] },
    review_focus: [
      { file: "src/a.ts", line: 12, reason: "The refill math changed." },
      { file: "src/b.ts", line: 7, reason: "A new early return skips the audit log." },
      { file: "src/c.ts", line: 3, reason: "The default limit is now read from env." },
    ],
    history: null,
    head_sha: "abc1234def5678",
    generated_at: "2026-10-03T10:00:00.000Z",
    model: "openrouter/openai/gpt-4.1-mini",
    tokens_in: 812,
    tokens_out: 340,
    cost_usd: 0.014,
    missing_inputs: [],
    truncated_inputs: [],
    stale: false,
    ...overrides,
  };
}

const ALL_PATHS: ReadonlySet<string> = new Set([
  "src/a.ts",
  "src/b.ts",
  "src/c.ts",
  "src/real.ts",
  "src/middleware/ratelimit.ts",
  "package.json",
  "docs/README.md",
]);

type CardProps = React.ComponentProps<typeof PrBriefCard>;

function renderCard(
  props: Partial<CardProps> = {},
  messages: AbstractIntlMessages = { brief: briefMessages, prReview: prReviewMessages },
) {
  const onOpenFile = vi.fn();
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider
        locale="en"
        timeZone="UTC"
        messages={messages}
        onError={(e) => {
          throw e;
        }}
      >
        <PrBriefCard
          prId={PR_ID}
          gate={{ settled: true, refreshedAt: 1 }}
          prPaths={ALL_PATHS}
          latestReview={null}
          onOpenFile={onOpenFile}
          {...props}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { ...view, onOpenFile };
}

function storedBrief(brief: PrBriefResult | null) {
  getMock.mockImplementation(async (path: string) => {
    if (path === BRIEF_PATH) return { brief };
    throw new Error(`unexpected GET ${path}`);
  });
}

function postCount(): number {
  return postMock.mock.calls.filter(([path]) => path === BRIEF_PATH).length;
}

describe("PrBriefCard hardening", () => {
  it("a failed read shows the message and a button that triggers one POST", async () => {
    getMock.mockRejectedValue(new ApiError("boom", 500, "internal_error"));
    postMock.mockResolvedValue({ brief: makeBrief() });
    renderCard();

    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(postCount()).toBe(1));
    expect(await screen.findByText("Adds a token-bucket limiter to the public API.")).toBeTruthy();
  });

  it("clears the not-in-diff mark when a regenerated brief arrives", async () => {
    storedBrief(makeBrief({ review_focus: [{ file: "src/gone.ts", line: 1, reason: "Old focus." }] }));
    postMock.mockResolvedValue({
      brief: makeBrief({
        generated_at: "2026-10-03T11:00:00.000Z",
        review_focus: [{ file: "src/gone2.ts", line: 2, reason: "New focus." }],
      }),
    });
    renderCard({ prPaths: new Set(["src/other.ts"]) });

    fireEvent.click(await screen.findByRole("button", { name: /src\/gone\.ts:1/ }));
    expect(screen.getByText("File not in this PR's diff")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Refresh brief" }));
    await screen.findByText("New focus.");
    expect(screen.queryByText("File not in this PR's diff")).toBeNull();
  });
});
