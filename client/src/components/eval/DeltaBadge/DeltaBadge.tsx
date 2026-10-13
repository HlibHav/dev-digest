/* DeltaBadge — a metric delta shown with a sign, an arrow and colour (AC-50). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { DELTA_COLOR } from "../constants";
import { deltaView } from "../helpers";

const hidden: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

export function DeltaBadge({ delta, unit }: { delta: number | null; unit: "pts" | "usd" }) {
  const t = useTranslations("eval.metric");
  const { text, direction } = deltaView(delta, unit);
  // More cost is worse, so the colour flips for usd; the sign and arrow carry the meaning anyway.
  const good = unit === "pts" ? "up" : "down";
  const color =
    direction === "up" || direction === "down"
      ? direction === good
        ? DELTA_COLOR.good
        : DELTA_COLOR.bad
      : DELTA_COLOR.neutral;
  const Arrow = direction === "up" ? Icon.ArrowUp : direction === "down" ? Icon.ArrowDown : null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, color }}>
      {Arrow ? <Arrow size={12} aria-hidden="true" /> : null}
      <span>{text}</span>
      {direction === "up" || direction === "down" ? <span style={hidden}>{t(direction)}</span> : null}
    </span>
  );
}
