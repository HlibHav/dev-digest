import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ConfirmModal } from "./ConfirmModal";

afterEach(cleanup);

function renderModal(props: Partial<React.ComponentProps<typeof ConfirmModal>> = {}) {
  return render(
    <ConfirmModal
      title="Delete this skill?"
      body="It will stop reaching any prompt."
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

describe("ConfirmModal", () => {
  it("shows the question and both choices", () => {
    renderModal();
    expect(screen.getByText("Delete this skill?")).toBeInTheDocument();
    expect(screen.getByText("It will stop reaching any prompt.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("confirms only when the confirm button is pressed", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    renderModal({ onConfirm, onClose });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancels without confirming", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    renderModal({ onConfirm, onClose });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("locks both buttons while the action is in flight", () => {
    renderModal({ pending: true });
    expect((screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders a rich body, not just a string", () => {
    renderModal({ body: <span data-testid="rich">careful</span> });
    expect(screen.getByTestId("rich")).toBeInTheDocument();
  });
});
