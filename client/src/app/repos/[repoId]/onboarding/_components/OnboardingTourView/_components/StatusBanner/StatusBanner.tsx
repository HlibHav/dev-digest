"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { OnboardingTour } from "@devdigest/shared";
import { s } from "./styles";

const STATUS_KEY = {
  llm_failed: "status.llmFailed",
  timed_out: "status.timedOut",
  index_unavailable: "status.indexUnavailable",
  error: "status.error",
} as const;

export function StatusBanner({
  tour,
  stale,
  generating,
  onRegenerate,
}: {
  tour: OnboardingTour;
  stale: boolean;
  generating: boolean;
  onRegenerate: () => void;
}) {
  const t = useTranslations("onboarding");
  const reason = tour.source === "skeleton" ? tour.skeleton_reason : null;
  const failure = tour.last_failure;
  return (
    <>
      {reason && <div style={s.banner}>{t(STATUS_KEY[reason])}</div>}
      {failure && (
        <div style={s.banner}>
          {t("banner.lastFailure", {
            reason: failure.reason,
            time: new Date(failure.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          })}
        </div>
      )}
      {stale && (
        <div style={s.banner}>
          <span>{t("banner.stale")}</span>
          <Button size="sm" disabled={generating} onClick={onRegenerate}>
            {t("regenerate")}
          </Button>
        </div>
      )}
    </>
  );
}
