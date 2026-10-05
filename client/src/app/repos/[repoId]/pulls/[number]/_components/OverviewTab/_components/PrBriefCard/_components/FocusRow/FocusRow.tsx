"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ReviewFocusItem } from "@devdigest/shared";
import { s } from "../../styles";

interface FocusRowProps {
  item: ReviewFocusItem;
  /** True after a click found the file outside the PR's diff. */
  notInDiff: boolean;
  onOpen: () => void;
}

/** One review-focus item: a button named `file:line`, with the reason as separate text. */
export function FocusRow({ item, notInDiff, onOpen }: FocusRowProps) {
  const t = useTranslations("brief");
  return (
    <li style={s.row}>
      <button type="button" style={s.focusButton} onClick={onOpen}>
        <span style={s.path}>{`${item.file}:${item.line}`}</span>
        <span>{item.reason}</span>
      </button>
      {notInDiff && <span style={s.notInDiff}>{t("card.notInDiff")}</span>}
    </li>
  );
}
