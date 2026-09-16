/* RunCostBadge — what an agent run cost, as plain muted mono text (no chip).
   compact: "$0.014" (PR list COST column, review runs header).
   detailed: "9,119 tok · $0.0013" (PR detail timeline, under the run time). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatCost } from "./format";

export function RunCostBadge({
  costUsd,
  variant,
  tokensIn,
  tokensOut,
}: {
  costUsd: number | null | undefined;
  variant: "compact" | "detailed";
  tokensIn?: number | null;
  tokensOut?: number | null;
}) {
  const t = useTranslations("common");
  if (variant === "compact") {
    return (
      <span className="mono" style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
        {formatCost(costUsd, 3)}
      </span>
    );
  }
  const hasTokens = tokensIn != null || tokensOut != null;
  const tokens = hasTokens ? t("runCost.tokens", { count: (tokensIn ?? 0) + (tokensOut ?? 0) }) : null;
  const cost = formatCost(costUsd, 4);
  return (
    <span className="mono" style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
      {tokens ? `${tokens} · ${cost}` : cost}
    </span>
  );
}
