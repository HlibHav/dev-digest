"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { OnboardingTour } from "@devdigest/shared";
import { COPIED_RESET_MS } from "../../constants";
import { ageParts, formatCost } from "../../helpers";
import { s } from "./styles";

export function TourHeader({
  repoId,
  repoFullName,
  tour,
  generating,
  onRegenerate,
}: {
  repoId: string;
  repoFullName: string;
  tour: OnboardingTour;
  generating: boolean;
  onRegenerate: () => void;
}) {
  const t = useTranslations("onboarding");
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const share = () => {
    const url = `${window.location.origin}/repos/${repoId}/onboarding`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    });
  };

  const name = repoFullName.split("/").pop() ?? repoFullName;
  const { llm, index } = tour;
  const model = llm.model ? (llm.provider ? `${llm.provider}/${llm.model}` : llm.model) : null;
  const llmLine = [t("subline.calls", { count: llm.calls }), formatCost(llm.cost_usd), model]
    .filter((p): p is string => p != null)
    .join(" · ");

  const age = ageParts(tour.generated_at, new Date());
  const indexPart =
    index.status === "partial"
      ? t("subline.indexPartial", { indexed: index.files_indexed, total: index.files_total })
      : index.status === "full"
        ? t("subline.indexFull", { n: index.files_indexed })
        : null;
  const indexLine = [indexPart, t("subline.generated", { unit: age.unit, n: age.n })]
    .filter((p): p is string => p != null)
    .join(" · ");

  return (
    <header>
      <div style={s.row}>
        <h1 style={s.title}>
          {t("header.titlePrefix")} <span className="mono" style={s.name}>{name}</span>
        </h1>
        <div style={s.actions}>
          <Button icon="RefreshCw" disabled={generating} onClick={onRegenerate}>
            {t("regenerate")}
          </Button>
          <Button icon="Link" onClick={share}>
            {copied ? t("linkCopied") : t("shareLink")}
          </Button>
        </div>
      </div>
      <div style={s.subline}>
        <div>{llmLine}</div>
        <div>{indexLine}</div>
      </div>
    </header>
  );
}
