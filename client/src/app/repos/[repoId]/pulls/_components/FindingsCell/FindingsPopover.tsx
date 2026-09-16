/* FindingsPopover — read-only previews of one review's findings for the PR list.
   Loads GET /pulls/:id/reviews only while open; no action buttons by design. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge, CategoryTag, ConfidenceNum } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { usePrReviews } from "@/lib/hooks";
import { lineLabel } from "../../[number]/_components/FindingCard/helpers";
import { shortDescription, sortBySeverity } from "./helpers";
import { s } from "./styles";

export function FindingsPopover({
  prId,
  reviewId,
  total,
  position,
}: {
  prId: string;
  reviewId: string;
  total: number;
  position: { top?: number; bottom?: number; left: number };
}) {
  const t = useTranslations("prReview.list.findingsPopover");
  const title = t("title", { count: total });
  const reviews = usePrReviews(prId);
  const findings = reviews.data?.find((r) => r.id === reviewId)?.findings;

  return (
    <div
      role="dialog"
      aria-label={title}
      style={s.popover(position)}
      // Reading the popover must not open the PR (the row navigates on click).
      onClick={(e) => e.stopPropagation()}
    >
      <div style={s.title}>{title}</div>
      {reviews.isLoading ? (
        <div style={s.note}>{t("loading")}</div>
      ) : reviews.isError ? (
        <div style={s.note}>{t("error")}</div>
      ) : !findings ? (
        <div style={s.note}>{t("missing")}</div>
      ) : (
        sortBySeverity(findings).map((f) => <Preview key={f.id} f={f} />)
      )}
    </div>
  );
}

function Preview({ f }: { f: FindingRecord }) {
  return (
    <div style={s.item}>
      <div style={s.itemHead}>
        <SeverityBadge severity={f.severity} compact />
        <span style={s.itemTitle}>{f.title}</span>
      </div>
      <div style={s.itemMeta}>
        <CategoryTag category={f.category} />
        <span className="mono" style={s.itemFile}>
          {f.file}:{lineLabel(f)}
        </span>
        <ConfidenceNum value={f.confidence} />
      </div>
      <div style={s.itemDesc}>{shortDescription(f.rationale)}</div>
    </div>
  );
}
