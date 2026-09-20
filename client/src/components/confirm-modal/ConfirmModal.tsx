/* ConfirmModal — a deliberate yes/no before something irreversible.

   Promoted to src/components on its second route (rule 2): skills and agents
   both delete from a card, and both used to call `window.confirm`, which is
   unstyled, unthemed and untestable. */
"use client";

import React from "react";
import { Button, Modal } from "@devdigest/ui";
import { s } from "./styles";

export function ConfirmModal({
  title,
  body,
  confirmLabel,
  cancelLabel,
  pending,
  danger = true,
  onConfirm,
  onClose,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  /** Styles the confirm button as destructive. Default true — that is why it exists. */
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      width={440}
      title={title}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" size="sm" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            kind={danger ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
            disabled={pending}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div style={s.body}>{body}</div>
    </Modal>
  );
}
