import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
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
  messages: Record<string, unknown> = { brief: briefMessages, prReview: prReviewMessages },
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

/** The nearest ancestor of the element holding `text` that also holds an svg and `label`. */
function riskRowOf(title: string, label: string): HTMLElement {
  let el: HTMLElement | null = screen.getByText(title);
  while (el && !(el.querySelector("svg") && el.textContent?.includes(label))) {
    el = el.parentElement;
  }
  if (!el) throw new Error(`no row with an icon and "${label}" around "${title}"`);
  return el;
}

function carriesColour(el: Element, colour: string): boolean {
  return (
    el.getAttribute("stroke") === colour ||
    el.getAttribute("color") === colour ||
    el.getAttribute("fill") === colour ||
    (el.getAttribute("style") ?? "").includes(colour)
  );
}

function activeName(): string {
  const el = document.activeElement as HTMLElement | null;
  return (el?.getAttribute("aria-label") ?? el?.textContent ?? "").trim();
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
});

describe("PrBriefCard without a brief (AC-36, AC-37)", () => {
  it("null brief → Generate button, no summary", async () => {
    storedBrief(null);
    renderCard();

    expect(await screen.findByRole("button", { name: "Generate brief" })).toBeEnabled();
    expect(screen.getByText("PR Brief")).toBeInTheDocument();
    expect(screen.queryByText("Risk areas")).not.toBeInTheDocument();
    expect(screen.queryByText("Review focus")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh brief" })).not.toBeInTheDocument();
    expect(postCount()).toBe(0);
  });
});

describe("PrBriefCard loading and generating (AC-38)", () => {
  it("pending query → skeleton, Generate and refresh buttons disabled", async () => {
    getMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderCard();

    await waitFor(() => expect(getMock).toHaveBeenCalledWith(BRIEF_PATH));

    expect(container.querySelector(".skeleton")).not.toBeNull();
    const buttons = screen.queryAllByRole("button", { name: /Generate brief|Refresh brief/ });
    expect(buttons.every((b) => b.hasAttribute("disabled"))).toBe(true);
    expect(screen.queryByText("Risk areas")).not.toBeInTheDocument();
  });

  it("pending mutation with no brief → skeleton, Generate disabled, a double click gives one POST", async () => {
    storedBrief(null);
    postMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderCard();

    const button = await screen.findByRole("button", { name: "Generate brief" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(container.querySelector(".skeleton")).not.toBeNull());
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeDisabled();
    expect(postCount()).toBe(1);
  });

  it("pending mutation with a shown brief → skeleton, refresh disabled, a double click gives one POST", async () => {
    storedBrief(makeBrief());
    postMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderCard();

    const refresh = await screen.findByRole("button", { name: "Refresh brief" });
    fireEvent.click(refresh);
    fireEvent.click(refresh);

    await waitFor(() => expect(container.querySelector(".skeleton")).not.toBeNull());
    expect(screen.getByRole("button", { name: "Refresh brief" })).toBeDisabled();
    expect(postCount()).toBe(1);
  });
});

describe("PrBriefCard generate (AC-39)", () => {
  it("Generate → one POST, summary, rows", async () => {
    storedBrief(null);
    postMock.mockResolvedValue({ brief: makeBrief() });
    renderCard();

    fireEvent.click(await screen.findByRole("button", { name: "Generate brief" }));

    expect(await screen.findByText("Adds a token-bucket limiter to the public API.")).toBeInTheDocument();
    expect(postCount()).toBe(1);
    expect(postMock.mock.calls[0][0]).toBe(BRIEF_PATH);
    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getByText("Review focus")).toBeInTheDocument();
    expect(screen.getByText("Rate limiter can be bypassed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /src\/a\.ts:12/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate brief" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh brief" })).toBeEnabled();
  });
});

describe("PrBriefCard risks (AC-40, AC-40a, AC-43, AC-54)", () => {
  it("risk shows title, path, severity icon and text", async () => {
    storedBrief(makeBrief({ risks: { risks: [RATELIMIT_RISK] }, review_focus: [] }));
    renderCard();

    expect(await screen.findByText("Rate limiter can be bypassed")).toBeInTheDocument();
    expect(screen.getByText("src/middleware/ratelimit.ts:12-18")).toBeInTheDocument();
    const row = riskRowOf("Rate limiter can be bypassed", "high");
    expect(within(row).getByText("high")).toBeInTheDocument();
    const icons = Array.from(row.querySelectorAll("svg"));
    const holders = icons.flatMap((svg) => {
      const chain: Element[] = [];
      for (let el: Element | null = svg; el && el !== row.parentElement; el = el.parentElement) chain.push(el);
      return chain;
    });
    expect(holders.some((el) => carriesColour(el, SEVERITY_COLOR.high))).toBe(true);
    expect(holders.some((el) => carriesColour(el, SEVERITY_COLOR.low))).toBe(false);
  });

  it("shows each line ref as path:start-end, path:start for a single line, and the path alone without one", async () => {
    storedBrief(makeBrief({ review_focus: [] }));
    renderCard();

    expect(await screen.findByText("src/middleware/ratelimit.ts:12-18")).toBeInTheDocument();
    expect(screen.getByText("package.json:34")).toBeInTheDocument();
    expect(screen.getByText("docs/README.md")).toBeInTheDocument();
  });

  it("shows the severity text of every risk", async () => {
    storedBrief(makeBrief({ review_focus: [] }));
    renderCard();

    await screen.findByText("Rate limiter can be bypassed");

    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("medium")).toBeInTheDocument();
    expect(screen.getByText("low")).toBeInTheDocument();
  });

  it("no risks → noRisks message", async () => {
    storedBrief(makeBrief({ risks: { risks: [] } }));
    renderCard();

    expect(await screen.findByText("No notable risks flagged.")).toBeInTheDocument();
    expect(screen.queryByText("Show explanation")).not.toBeInTheDocument();
  });

  it("does not show the noRisks message when there are risks", async () => {
    storedBrief(makeBrief());
    renderCard();

    await screen.findByText("Rate limiter can be bypassed");

    expect(screen.queryByText("No notable risks flagged.")).not.toBeInTheDocument();
  });

  it("expand shows the explanation", async () => {
    storedBrief(makeBrief({ risks: { risks: [RATELIMIT_RISK] }, review_focus: [] }));
    const { onOpenFile } = renderCard();

    await screen.findByText("Rate limiter can be bypassed");
    expect(screen.queryByText(RATELIMIT_RISK.explanation)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show explanation" }));

    expect(screen.getByText(RATELIMIT_RISK.explanation)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide explanation" })).toBeInTheDocument();
    expect(onOpenFile).not.toHaveBeenCalled();
  });
});

describe("PrBriefCard review focus (AC-41)", () => {
  it("focus rows in order, path:line — reason", async () => {
    storedBrief(makeBrief());
    renderCard();

    await screen.findByText("Review focus");
    const rows = screen.getAllByRole("button", { name: /^src\/[abc]\.ts:\d+/ });

    expect(rows.map((r) => r.getAttribute("aria-label") ?? r.textContent)).toEqual([
      expect.stringMatching(/^src\/a\.ts:12/),
      expect.stringMatching(/^src\/b\.ts:7/),
      expect.stringMatching(/^src\/c\.ts:3/),
    ]);
    expect(screen.getByText("The refill math changed.")).toBeInTheDocument();
    expect(screen.getByText("A new early return skips the audit log.")).toBeInTheDocument();
    expect(screen.getByText("The default limit is now read from env.")).toBeInTheDocument();
    expect(screen.getByText("Read these first")).toBeInTheDocument();
  });
});

describe("PrBriefCard notes, stale mark, cost (AC-42, AC-46, AC-50)", () => {
  it("missing line and shortened note name the inputs", async () => {
    storedBrief(
      makeBrief({
        missing_inputs: ["intent", "blast", "issue", "specs", "pr_description"],
        truncated_inputs: ["specs", "callers"],
      }),
    );
    renderCard();

    const missing = await screen.findByText(/Missing inputs:/);
    for (const name of ["intent", "blast radius", "linked issue", "attached specs", "PR description"]) {
      expect(missing).toHaveTextContent(name);
    }
    const truncated = screen.getByText(/Shortened to fit the budget:/);
    expect(truncated).toHaveTextContent("attached specs");
    expect(truncated).toHaveTextContent("blast callers");
  });

  it("shows neither note when nothing is missing or shortened", async () => {
    storedBrief(makeBrief());
    renderCard();

    await screen.findByText("Risk areas");

    expect(screen.queryByText(/Missing inputs:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Shortened to fit the budget:/)).not.toBeInTheDocument();
  });

  it("stale brief shows stale and abc1234", async () => {
    storedBrief(makeBrief({ stale: true, head_sha: "abc1234def5678" }));
    renderCard();

    expect(await screen.findByText("stale")).toBeInTheDocument();
    expect(screen.getByText(/generated for abc1234$/)).toBeInTheDocument();
  });

  it("a fresh brief shows no stale mark", async () => {
    storedBrief(makeBrief({ stale: false }));
    renderCard();

    await screen.findByText("Risk areas");

    expect(screen.queryByText("stale")).not.toBeInTheDocument();
    expect(screen.queryByText(/generated for/)).not.toBeInTheDocument();
  });

  it("$0.014 and counts; null → —", async () => {
    storedBrief(makeBrief({ cost_usd: 0.014, tokens_in: 812, tokens_out: 340 }));
    renderCard();

    expect(await screen.findByText(/Cost \$0\.014/)).toBeInTheDocument();
    expect(screen.getByText(/812 in · 340 out/)).toBeInTheDocument();
  });

  it("shows — for a missing cost and no dollar amount", async () => {
    storedBrief(makeBrief({ cost_usd: null, risks: { risks: [] }, review_focus: [] }));
    renderCard();

    await screen.findByText("No notable risks flagged.");

    expect(screen.getByText(/—/)).toBeInTheDocument();
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
    expect(screen.getByText(/812 in · 340 out/)).toBeInTheDocument();
  });
});

describe("PrBriefCard stored brief and refresh (AC-44, AC-45)", () => {
  it("stored brief shown, no POST", async () => {
    storedBrief(makeBrief());
    renderCard();

    expect(await screen.findByText("Adds a token-bucket limiter to the public API.")).toBeInTheDocument();

    expect(getMock).toHaveBeenCalledWith(BRIEF_PATH);
    expect(postMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Generate brief" })).not.toBeInTheDocument();
  });

  it("refresh → one POST, new summary", async () => {
    storedBrief(makeBrief());
    postMock.mockResolvedValue({
      brief: makeBrief({ summary: "A brand new summary.", risks: { risks: [] }, review_focus: [] }),
    });
    renderCard();

    fireEvent.click(await screen.findByRole("button", { name: "Refresh brief" }));

    expect(await screen.findByText("A brand new summary.")).toBeInTheDocument();
    expect(postCount()).toBe(1);
    expect(screen.queryByText("Adds a token-bucket limiter to the public API.")).not.toBeInTheDocument();
    expect(screen.queryByText("Rate limiter can be bypassed")).not.toBeInTheDocument();
  });
});

describe("PrBriefCard failure (AC-47)", () => {
  it("failure shows message and retry, keeps the old brief", async () => {
    storedBrief(makeBrief());
    postMock.mockRejectedValueOnce(new ApiError("provider exploded", 502, "external_service_error"));
    postMock.mockResolvedValueOnce({ brief: makeBrief({ summary: "Second try worked." }) });
    renderCard();

    fireEvent.click(await screen.findByRole("button", { name: "Refresh brief" }));

    expect(await screen.findByText(/Couldn't generate the brief: provider exploded/)).toBeInTheDocument();
    expect(screen.getByText("Adds a token-bucket limiter to the public API.")).toBeInTheDocument();
    expect(screen.getByText("Rate limiter can be bypassed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Second try worked.")).toBeInTheDocument();
    expect(postCount()).toBe(2);
    expect(screen.queryByText(/Couldn't generate the brief/)).not.toBeInTheDocument();
  });

  it("config_error → Settings hint", async () => {
    storedBrief(makeBrief());
    postMock.mockRejectedValue(new ApiError("OPENROUTER_API_KEY is not configured", 500, "config_error"));
    renderCard();

    fireEvent.click(await screen.findByRole("button", { name: "Refresh brief" }));

    expect(
      await screen.findByText(
        "No API key for the Risk Brief model. Choose a model with a key in Settings → Risk Brief.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't generate the brief/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByText("Adds a token-bucket limiter to the public API.")).toBeInTheDocument();
  });

  it("failure with no earlier brief shows the message and Retry in the block", async () => {
    storedBrief(null);
    postMock.mockRejectedValue(new ApiError("provider exploded", 502, "external_service_error"));
    renderCard();

    fireEvent.click(await screen.findByRole("button", { name: "Generate brief" }));

    expect(await screen.findByText(/Couldn't generate the brief: provider exploded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

function bracketed(node: unknown, path: string[] = []): unknown {
  if (typeof node === "string") return `[${path.join(".")}]`;
  return Object.fromEntries(
    Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, bracketed(v, [...path, k])]),
  );
}

function plainEnglish(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") {
    if (node.length >= 5 && !node.includes("{")) out.push(node);
    return out;
  }
  for (const v of Object.values(node as Record<string, unknown>)) plainEnglish(v, out);
  return out;
}

describe("PrBriefCard i18n (AC-48)", () => {
  it("bracketed-key bundle shows no hard-coded literal", async () => {
    const bundle = bracketed(briefMessages) as Record<string, unknown>;
    const literals = plainEnglish({
      card: briefMessages.card,
      sections: briefMessages.sections,
      focus: briefMessages.focus,
      risk: briefMessages.risk,
      noRisks: briefMessages.noRisks,
    });

    storedBrief(
      makeBrief({
        stale: true,
        missing_inputs: ["intent"],
        truncated_inputs: ["specs"],
        review_focus: [{ file: "src/ghost.ts", line: 9, reason: "A caller-only file." }, makeBrief().review_focus[0]],
      }),
    );
    renderCard({}, { brief: bundle, prReview: prReviewMessages });

    expect(await screen.findByText("[sections.risks]")).toBeInTheDocument();
    expect(screen.getByText("[sections.focus]")).toBeInTheDocument();
    expect(screen.getByText("[card.title]")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "[card.refresh]" })).toBeInTheDocument();
    expect(screen.getByText("[card.stale]")).toBeInTheDocument();
    expect(screen.getByText("[severity.high]")).toBeInTheDocument();
    expect(screen.getByText(/\[missing\.line\]/)).toBeInTheDocument();
    expect(screen.getByText(/\[truncated\.line\]/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /src\/ghost\.ts:9/ }));
    expect(await screen.findByText("[card.notInDiff]")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "[risk.expand]" })[0]);
    expect(screen.getByRole("button", { name: "[risk.collapse]" })).toBeInTheDocument();

    const html = document.body.innerHTML;
    for (const literal of literals) expect(html).not.toContain(literal);

    cleanup();
    storedBrief(makeBrief({ risks: { risks: [] } }));
    renderCard({}, { brief: bundle, prReview: prReviewMessages });
    expect(await screen.findByText("[noRisks]")).toBeInTheDocument();
    for (const literal of literals) expect(document.body.innerHTML).not.toContain(literal);

    cleanup();
    storedBrief(null);
    renderCard({}, { brief: bundle, prReview: prReviewMessages });
    expect(await screen.findByRole("button", { name: "[card.generate]" })).toBeInTheDocument();
    for (const literal of literals) expect(document.body.innerHTML).not.toContain(literal);
  });
});

describe("PrBriefCard keyboard (AC-49)", () => {
  it("tab order; first focus item has accessible name src/a.ts:12", async () => {
    storedBrief(makeBrief());
    const { onOpenFile } = renderCard();
    await screen.findByText("Review focus");

    expect(screen.getByRole("button", { name: /src\/a\.ts:12/ })).toBeInTheDocument();

    // Tab order without userEvent: the tabbable elements in DOM order, up to the first focus item.
    // Every button must be a native <button> and none may have tabindex -1.
    const tabbable = Array.from(
      document.body.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]"),
    ).filter((el) => !el.hasAttribute("disabled") && el.getAttribute("tabindex") !== "-1");
    const allButtons = screen.getAllByRole("button");
    expect(allButtons.every((el) => el.tagName === "BUTTON" && tabbable.includes(el))).toBe(true);
    const visited: string[] = [];
    for (const el of tabbable) {
      const name = el.getAttribute("aria-label") ?? el.textContent ?? "";
      visited.push(name);
      if (/src\/a\.ts:12/.test(name)) break;
    }
    firstFocus.focus();

    expect(visited.some((n) => /Refresh brief/.test(n))).toBe(true);
    expect(visited.some((n) => /Rate limiter can be bypassed/.test(n))).toBe(true);
    expect(visited.some((n) => /Show explanation/.test(n))).toBe(true);
    expect(activeName()).toMatch(/src\/a\.ts:12/);

    // A native button turns Enter and Space into a click; the click opens the file.
    expect(document.activeElement).toBe(firstFocus);
    fireEvent.click(firstFocus);

    expect(onOpenFile).toHaveBeenCalledWith({ file: "src/a.ts", line: 12 });
  });

  it("a risk is operable from the keyboard", async () => {
    storedBrief(makeBrief({ review_focus: [] }));
    const { onOpenFile } = renderCard();
    const title = await screen.findByRole("button", { name: /Rate limiter can be bypassed/ });
    expect(title.tagName).toBe("BUTTON");
    expect(title.getAttribute("tabindex")).not.toBe("-1");

    title.focus();
    expect(/Rate limiter can be bypassed/.test(activeName())).toBe(true);
    expect(activeName()).toMatch(/Rate limiter can be bypassed/);
    fireEvent.click(title);

    expect(onOpenFile).toHaveBeenCalledWith({ file: "src/middleware/ratelimit.ts", line: 12 });
  });
});

describe("PrBriefCard click-through (AC-51 card side, AC-52, AC-53)", () => {
  it("focus click on a PR file → onOpenFile({file, line}) and no message", async () => {
    storedBrief(makeBrief());
    const { onOpenFile } = renderCard();

    fireEvent.click(await screen.findByRole("button", { name: /src\/a\.ts:12/ }));

    expect(onOpenFile).toHaveBeenCalledTimes(1);
    expect(onOpenFile).toHaveBeenCalledWith({ file: "src/a.ts", line: 12 });
    expect(screen.queryByText("File not in this PR's diff")).not.toBeInTheDocument();
  });

  it("message shown, no navigation (focus item outside the diff)", async () => {
    storedBrief(
      makeBrief({ review_focus: [{ file: "src/ghost.ts", line: 9, reason: "A caller-only file." }] }),
    );
    const { onOpenFile } = renderCard();
    const item = await screen.findByRole("button", { name: /src\/ghost\.ts:9/ });
    expect(screen.queryByText("File not in this PR's diff")).not.toBeInTheDocument();

    fireEvent.click(item);

    expect(screen.getByText("File not in this PR's diff")).toBeInTheDocument();
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("message shown, no navigation (risk with no file in the diff)", async () => {
    const ghostRisk: Risk = {
      ...RATELIMIT_RISK,
      title: "Ghost-only risk",
      file_refs: ["src/ghost.ts", "src/phantom.ts"],
      line_refs: [{ file: "src/ghost.ts", start_line: 4, end_line: 5 }],
    };
    storedBrief(makeBrief({ risks: { risks: [ghostRisk] }, review_focus: [] }));
    const { onOpenFile } = renderCard();

    fireEvent.click(await screen.findByRole("button", { name: /Ghost-only risk/ }));

    expect(screen.getByText("File not in this PR's diff")).toBeInTheDocument();
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("risk click → onOpenFile(src/real.ts, 12) for the first in-diff file and its line ref start", async () => {
    const risk: Risk = {
      ...RATELIMIT_RISK,
      title: "Ghost then real",
      file_refs: ["src/ghost.ts", "src/real.ts"],
      line_refs: [{ file: "src/real.ts", start_line: 12, end_line: 18 }],
    };
    storedBrief(makeBrief({ risks: { risks: [risk] }, review_focus: [] }));
    const { onOpenFile } = renderCard();

    fireEvent.click(await screen.findByRole("button", { name: /Ghost then real/ }));

    expect(onOpenFile).toHaveBeenCalledTimes(1);
    expect(onOpenFile).toHaveBeenCalledWith({ file: "src/real.ts", line: 12 });
    expect(screen.queryByText("File not in this PR's diff")).not.toBeInTheDocument();
  });

  it("risk click without a line ref → onOpenFile(file, null)", async () => {
    storedBrief(makeBrief({ risks: { risks: [README_RISK] }, review_focus: [] }));
    const { onOpenFile } = renderCard();

    fireEvent.click(await screen.findByRole("button", { name: /Docs describe the old limit/ }));

    expect(onOpenFile).toHaveBeenCalledTimes(1);
    expect(onOpenFile).toHaveBeenCalledWith({ file: "docs/README.md", line: null });
  });
});

describe("PrBriefCard latest review (AC-55)", () => {
  const REVIEW = {
    verdict: "request_changes" as const,
    summary: "Hardcoded secret introduced.",
    score: 42,
    findingsCount: 3,
    blockers: 1,
    agentName: "Security Reviewer",
  };

  it("review present → banner then summary", async () => {
    storedBrief(makeBrief());
    renderCard({ latestReview: REVIEW });

    const summary = await screen.findByText("Adds a token-bucket limiter to the public API.");
    const verdict = screen.getByText("Request changes");

    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("PR SCORE")).toBeInTheDocument();
    expect(screen.getByText(/3 findings · 1 blockers/)).toBeInTheDocument();
    expect(verdict.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("no review → summary alone", async () => {
    storedBrief(makeBrief());
    renderCard({ latestReview: null });

    expect(await screen.findByText("Adds a token-bucket limiter to the public API.")).toBeInTheDocument();

    expect(screen.queryByText("Request changes")).not.toBeInTheDocument();
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
  });
});

describe("PrBriefCard model text is plain text", () => {
  it("renders markup in the summary, a title and a reason literally", async () => {
    const summary = "Use **bold** and <img src=x onerror=alert(1)> here.";
    const title = "<b>Injected</b> title";
    storedBrief(
      makeBrief({
        summary,
        risks: { risks: [{ ...RATELIMIT_RISK, title }] },
        review_focus: [{ file: "src/a.ts", line: 12, reason: "<script>alert(1)</script>" }],
      }),
    );
    const { container } = renderCard();

    expect(await screen.findByText(summary)).toBeInTheDocument();
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("strong")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });
});
