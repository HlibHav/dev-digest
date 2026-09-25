import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/intent.json";
import { IntentCard } from "./IntentCard";

afterEach(cleanup);

const INTENT: PrIntentRecord = {
  pr_id: "pr-1",
  intent: "Adds a token-bucket limiter to the public API.",
  in_scope: ["rate limiting middleware"],
  out_of_scope: ["authentication changes"],
  change_type: "feature",
  confidence: "high",
  sources: [
    { kind: "title", ref: "title", used: true, note: null },
    { kind: "issue", ref: "#471", used: true, note: null },
    { kind: "commits", ref: "0 commit(s)", used: false, note: null },
  ],
  model: "openai/gpt-4.1-mini",
  head_sha: "abc1234",
  updated_at: "2026-09-25T00:00:00.000Z",
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ intent: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("IntentCard", () => {
  it("renders the intent summary, change type and confidence", () => {
    renderWithIntl(<IntentCard intent={INTENT} />);
    expect(screen.getByText(INTENT.intent)).toBeInTheDocument();
    expect(screen.getByText("Feature")).toBeInTheDocument();
    expect(screen.getByText("high confidence")).toBeInTheDocument();
  });

  it("renders in-scope and out-of-scope items", () => {
    renderWithIntl(<IntentCard intent={INTENT} />);
    expect(screen.getByText("rate limiting middleware")).toBeInTheDocument();
    expect(screen.getByText("authentication changes")).toBeInTheDocument();
    expect(screen.getByText("In scope")).toBeInTheDocument();
    expect(screen.getByText("Out of scope")).toBeInTheDocument();
  });

  it("renders used and missing sources", () => {
    renderWithIntl(<IntentCard intent={INTENT} />);
    expect(screen.getByText("#471")).toBeInTheDocument();
    // A missing source is rendered by kind, not ref.
    expect(screen.getByText("commits")).toBeInTheDocument();
  });

  it("shows the low-confidence hint only when confidence is low", () => {
    renderWithIntl(<IntentCard intent={{ ...INTENT, confidence: "low" }} />);
    expect(
      screen.getByText("Derived from indirect data (branch name, commits, changed paths) — no description or linked issue."),
    ).toBeInTheDocument();
  });

  it("does not show the low-confidence hint at high confidence", () => {
    renderWithIntl(<IntentCard intent={INTENT} />);
    expect(
      screen.queryByText("Derived from indirect data (branch name, commits, changed paths) — no description or linked issue."),
    ).not.toBeInTheDocument();
  });

  it("renders the empty state when intent is null", () => {
    renderWithIntl(<IntentCard intent={null} />);
    expect(
      screen.getByText("No intent derived yet — it's derived the next time a review runs."),
    ).toBeInTheDocument();
    expect(screen.queryByText(INTENT.intent)).not.toBeInTheDocument();
  });

  it("renders the empty state when intent is undefined (e.g. a 404)", () => {
    renderWithIntl(<IntentCard intent={undefined} />);
    expect(
      screen.getByText("No intent derived yet — it's derived the next time a review runs."),
    ).toBeInTheDocument();
  });

  it("renders nothing while loading, not the empty state", () => {
    const { container } = renderWithIntl(<IntentCard intent={undefined} isLoading />);
    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByText("No intent derived yet — it's derived the next time a review runs."),
    ).not.toBeInTheDocument();
  });

  it("renders source text as plain text, never as HTML", () => {
    const withHtmlish: PrIntentRecord = {
      ...INTENT,
      intent: "<img src=x onerror=alert(1)>Adds a limiter.",
    };
    renderWithIntl(<IntentCard intent={withHtmlish} />);
    // The literal markup shows up as visible text content, not a parsed <img>.
    expect(screen.getByText(withHtmlish.intent)).toBeInTheDocument();
    expect(document.querySelector("img")).not.toBeInTheDocument();
  });
});
