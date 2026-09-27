import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile } from "@/lib/types";
import messages from "../../../../messages/en/prReview.json";
import shellMessages from "../../../../messages/en/shell.json";
import type { DiffFindingApi } from "../findings";
import { FileCard } from "./FileCard";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, shell: shellMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const PATCH = ["@@ -1,2 +1,3 @@", " line1", "+line2", " line3"].join("\n");

const FILE: PrFile = { path: "a.ts", additions: 1, deletions: 0, patch: PATCH };

function finding(id: string, startLine: number): FindingRecord {
  return {
    id,
    severity: "CRITICAL",
    category: "bug",
    title: `Title ${id}`,
    file: "a.ts",
    start_line: startLine,
    end_line: startLine,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

describe("FileCard", () => {
  it("shows no dot when there are no findings", () => {
    renderWithIntl(<FileCard file={FILE} />);
    expect(screen.queryByTitle("This file has findings")).not.toBeInTheDocument();
  });

  it("shows a dot when the file has a finding", () => {
    const api: DiffFindingApi = {
      findings: [finding("f1", 2)],
      showFindings: true,
      renderFinding: (f) => <div>{`Finding:${f.id}`}</div>,
    };
    renderWithIntl(<FileCard file={FILE} findings={api} />);
    expect(screen.getByTitle("This file has findings")).toBeInTheDocument();
  });

  it("renders a matched finding inline under its line, and an unanchored one in the trailing block", () => {
    const matched = finding("matched", 2); // "+line2" lands on newNo=2
    const orphan = finding("orphan", 999); // not in this patch
    const api: DiffFindingApi = {
      findings: [matched, orphan],
      showFindings: true,
      renderFinding: (f) => <div>{`Finding:${f.id}`}</div>,
    };
    renderWithIntl(<FileCard file={FILE} findings={api} />);

    expect(screen.getByText("Finding:matched")).toBeInTheDocument();
    expect(screen.getByText("Finding:orphan")).toBeInTheDocument();
    expect(screen.getByText("Not shown inline (line not in this diff)")).toBeInTheDocument();
  });

  it("renders nothing extra when showFindings is false", () => {
    const api: DiffFindingApi = {
      findings: [finding("matched", 2), finding("orphan", 999)],
      showFindings: false,
      renderFinding: (f) => <div>{`Finding:${f.id}`}</div>,
    };
    renderWithIntl(<FileCard file={FILE} findings={api} />);
    expect(screen.queryByText("Finding:matched")).not.toBeInTheDocument();
    expect(screen.queryByText("Finding:orphan")).not.toBeInTheDocument();
  });
});
