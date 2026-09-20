import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/conventions.json";
import { CreateSkillModal } from "./CreateSkillModal";

const previewMock = vi.fn();
const createMock = vi.fn();

vi.mock("@/lib/hooks/conventions", () => ({
  useConventionSkillPreview: () => previewMock(),
  useCreateConventionSkill: () => ({ mutate: createMock, isPending: false, isError: false, error: null }),
}));

const AGENTS = [{ id: "ag1", name: "API Contract Reviewer" }] as Agent[];

/** The body editor: the only <textarea> in the modal. FormField renders a
    plain label with no htmlFor, so it cannot be queried by label text. */
function bodyField(): HTMLTextAreaElement {
  return document.querySelector("textarea") as HTMLTextAreaElement;
}

function renderModal(onClose = vi.fn()) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <CreateSkillModal repoId="r1" acceptedCount={2} agents={AGENTS} onClose={onClose} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  previewMock.mockReset();
  createMock.mockReset();
  previewMock.mockReturnValue({ data: { body: "# Generated\n- rule one" }, isLoading: false });
});
afterEach(cleanup);

describe("CreateSkillModal", () => {
  it("says what it builds and from how many accepted conventions", () => {
    renderModal();
    expect(screen.getByText(/builds one skill from the 2 conventions you accepted/i)).toBeInTheDocument();
  });

  it("defaults the name to repo-conventions", () => {
    renderModal();
    expect(screen.getByDisplayValue("repo-conventions")).toBeInTheDocument();
  });

  it("opens on the generated body, editable", () => {
    renderModal();
    expect(bodyField().value).toBe("# Generated\n- rule one");
    expect(bodyField().readOnly).toBe(false);
  });

  it("keeps the user's edit when the generated body arrives late", async () => {
    // First render: preview still loading, so nothing has filled the field.
    previewMock.mockReturnValue({ data: undefined, isLoading: true });
    const { rerender } = renderModal();
    const qc = new QueryClient();

    fireEvent.change(bodyField(), { target: { value: "# Mine" } });

    // Now the generated body resolves — it must NOT overwrite the edit.
    previewMock.mockReturnValue({ data: { body: "# Generated" }, isLoading: false });
    rerender(
      <QueryClientProvider client={qc}>
        <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
          <CreateSkillModal repoId="r1" acceptedCount={2} agents={AGENTS} onClose={vi.fn()} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(bodyField().value).toBe("# Mine"));
  });

  it("creates with the chosen agent so the link is part of the flow", async () => {
    renderModal();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ag1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0]![0]).toMatchObject({ repoId: "r1", agent_id: "ag1" });
  });

  it("cancels without creating", () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});
