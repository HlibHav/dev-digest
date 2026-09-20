import React from "react";
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { VersionsTab } from "./VersionsTab";

const versions = [
  { skill_id: "sk1", version: 1, body: "# Rule\nold line", created_at: "2026-09-01T10:00:00Z" },
  { skill_id: "sk1", version: 2, body: "# Rule\nnew line", created_at: "2026-09-02T10:00:00Z" },
];

const getMock = vi.fn();
const mutateMock = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => getMock(),
  useUpdateSkill: () => ({ mutate: mutateMock, isPending: false }),
}));

const SKILL = { id: "sk1", name: "test-smells", version: 2, body: "# Rule\nnew line" } as Skill;

function renderTab() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <VersionsTab skill={SKILL} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getMock.mockReset();
  mutateMock.mockReset();
  getMock.mockReturnValue({ data: versions, isLoading: false, isError: false, refetch: vi.fn() });
});
afterEach(cleanup);

describe("VersionsTab", () => {
  it("lists every version, newest first, and marks the current one", () => {
    renderTab();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("offers Diff and Restore on past versions only", () => {
    renderTab();
    // One older version → exactly one of each.
    expect(screen.getAllByRole("button", { name: "Diff" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(1);
  });

  it("shows the diff against the current version when Diff is pressed", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Diff" }));
    expect(screen.getByText(/1 added, 1 removed/)).toBeInTheDocument();
    expect(screen.getByText(/- old line/)).toBeInTheDocument();
    expect(screen.getByText(/\+ new line/)).toBeInTheDocument();
  });

  it("asks before restoring, and does not write until confirmed", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(screen.getByText("Restore this version?")).toBeInTheDocument();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("restores the old body forward on confirm", async () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    // Scope to the dialog: the row's button carries the same label.
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    expect(mutateMock.mock.calls[0]![0]).toMatchObject({
      id: "sk1",
      patch: { body: "# Rule\nold line" },
    });
  });

  it("reports an empty history rather than an empty list", () => {
    getMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    renderTab();
    expect(screen.getByText("No versions recorded yet.")).toBeInTheDocument();
  });
});
