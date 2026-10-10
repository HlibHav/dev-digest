/* MaskedText — text with credential-shaped strings hidden behind an explicit Reveal. The value is rendered as text only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { maskSecrets } from "../../helpers";

export function MaskedText({ text }: { text: string }) {
  const t = useTranslations("eval.evalsTab");
  const [revealed, setRevealed] = React.useState(false);
  const { masked, found } = maskSecrets(text);
  if (!found) return <span>{text}</span>;
  return (
    <span>
      <span>{revealed ? text : masked}</span>{" "}
      {revealed ? null : <span style={HINT}>{t("masked")}</span>}{" "}
      <button type="button" style={LINK} onClick={() => setRevealed((r) => !r)}>
        {revealed ? t("hide") : t("reveal")}
      </button>
    </span>
  );
}

const HINT: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)" };
const LINK: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--accent)",
  cursor: "pointer",
  fontSize: 12,
};
