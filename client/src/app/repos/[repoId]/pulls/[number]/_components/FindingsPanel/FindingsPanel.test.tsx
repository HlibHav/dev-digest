import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

function finding(id: string, severity: FindingRecord["severity"], confidence = 0.9): FindingRecord {
  return { ...FINDINGS[0]!, id, severity, title: `Finding ${id}`, confidence };
}

const MIXED: FindingRecord[] = [
  finding("c1", "CRITICAL"),
  finding("c2", "CRITICAL", 0.3),
  finding("w1", "WARNING"),
  finding("s1", "SUGGESTION", 0.3),
];

const pill = (name: RegExp) => screen.getByRole("button", { name });
const cardTitles = () => screen.queryAllByText(/^Finding /).map((el) => el.textContent);

describe("FindingsPanel — severity counters", () => {
  it("shows a count per severity that matches the rendered cards", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(pill(/2 critical/i)).toBeInTheDocument();
    expect(pill(/1 warning/i)).toBeInTheDocument();
    expect(pill(/1 suggestion/i)).toBeInTheDocument();
    expect(cardTitles()).toHaveLength(4);
  });

  it("recounts when low-confidence findings are hidden", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(within(screen.getByText("Hide low confidence")).getByRole("switch"));
    expect(pill(/1 critical/i)).toBeInTheDocument();
    expect(pill(/1 warning/i)).toBeInTheDocument();
    // the only suggestion is low-confidence, so its pill disappears instead of reading 0
    expect(screen.queryByRole("button", { name: /suggestion/i })).not.toBeInTheDocument();
    expect(cardTitles()).toHaveLength(2);
  });

  it("renders pills only for severities the run actually has", () => {
    renderWithIntl(<FindingsPanel findings={[finding("w1", "WARNING")]} prId="pr1" />);
    expect(pill(/1 warning/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /critical/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /suggestion/i })).not.toBeInTheDocument();
  });

  it("renders no pills for a run without findings", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("button", { name: /critical|warning|suggestion/i })).not.toBeInTheDocument();
  });

  it("drops the severity filter when hiding low confidence removes its last finding", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(pill(/1 suggestion/i));
    expect(cardTitles()).toEqual(["Finding s1"]);
    fireEvent.click(within(screen.getByText("Hide low confidence")).getByRole("switch"));
    // no SUGGESTION pill is left to reset the filter, so the panel falls back to all visible findings
    expect(cardTitles()).toEqual(["Finding c1", "Finding w1"]);
    // switching the toggle back off must not resurrect the old SUGGESTION filter
    fireEvent.click(within(screen.getByText("Hide low confidence")).getByRole("switch"));
    expect(cardTitles()).toHaveLength(4);
  });

  it("filters by severity on click and resets on a second click", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(pill(/2 critical/i));
    expect(cardTitles()).toEqual(["Finding c1", "Finding c2"]);
    expect(pill(/1 warning/i)).toBeInTheDocument();

    fireEvent.click(pill(/2 critical/i));
    expect(cardTitles()).toHaveLength(4);
  });
});
