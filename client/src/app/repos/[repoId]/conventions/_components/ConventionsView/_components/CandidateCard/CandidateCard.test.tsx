import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/conventions.json";
import { CandidateCard } from "./CandidateCard";

afterEach(cleanup);

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  category: "architecture",
  rule: "A service takes the ports it calls, not the container.",
  evidence_path: "server/src/modules/skills/service.ts",
  evidence_line: 4,
  evidence_snippet: "constructor(private repo: SkillsRepository) {}",
  confidence: 0.82,
  status: "pending",
};

function renderCard(props: Partial<React.ComponentProps<typeof CandidateCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <CandidateCard
        candidate={CANDIDATE}
        repoFullName="acme/payments-api"
        defaultBranch="main"
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("CandidateCard", () => {
  it("shows the rule, the source file and the confidence percentage", () => {
    renderCard();
    expect(screen.getByText(/takes the ports it calls/)).toBeTruthy();
    expect(screen.getByText(/service\.ts:4/)).toBeTruthy();
    expect(screen.getByText(/82%/)).toBeTruthy();
  });

  it("links the evidence to the real line on GitHub", () => {
    renderCard();
    const link = screen.getByRole("link") as HTMLAnchorElement;
    expect(link.href).toBe(
      "https://github.com/acme/payments-api/blob/main/server/src/modules/skills/service.ts#L4",
    );
  });

  it("offers accept, reject and edit", () => {
    renderCard();
    expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  });

  it("reports accept and reject through their callbacks", () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    renderCard({ onAccept, onReject });
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onAccept).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onReject).toHaveBeenCalled();
  });

  it("edits in place — the rule becomes a field on the same card", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    // Still the same card: the evidence link never went away.
    expect(screen.getByRole("link")).toBeTruthy();
    expect(screen.getByLabelText("Rule")).toBeTruthy();
    expect(screen.getByLabelText("Category")).toBeTruthy();
  });

  it("saves the edited rule", () => {
    const onEdit = vi.fn();
    renderCard({ onEdit });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "Edited rule." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onEdit).toHaveBeenCalledWith({ rule: "Edited rule.", category: "architecture" });
  });

  it("will not save an empty rule", () => {
    const onEdit = vi.fn();
    renderCard({ onEdit });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "   " } });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("marks an accepted candidate and stops offering Accept again", () => {
    renderCard({ candidate: { ...CANDIDATE, status: "accepted" } });
    expect(screen.getByText("Accepted")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Accept" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
