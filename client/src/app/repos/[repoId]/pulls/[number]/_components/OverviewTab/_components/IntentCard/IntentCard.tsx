"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, SectionLabel } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { CONFIDENCE_STYLE } from "./constants";
import { usedSources, missingSources } from "./helpers";
import { s } from "./styles";

interface IntentCardProps {
  intent: PrIntentRecord | null | undefined;
  isLoading?: boolean;
}

/**
 * "Stated intent" card — the PR author's claim, derived by a cheap model
 * before review. Never shown as a verdict: it's context for scope only (see
 * `reviewer-core`'s `INTENT_RULES`). Empty until a review has run once.
 */
export function IntentCard({ intent, isLoading }: IntentCardProps) {
  const t = useTranslations("intent");

  if (isLoading) return null;
  if (!intent) {
    return (
      <section>
        <SectionLabel icon="Target">{t("title")}</SectionLabel>
        <div style={s.card}>
          <span style={s.hint}>{t("empty")}</span>
        </div>
      </section>
    );
  }

  const confidence = intent.confidence ?? "low";
  const confidenceStyle = CONFIDENCE_STYLE[confidence];
  const used = usedSources(intent.sources);
  const missing = missingSources(intent.sources);

  return (
    <section>
      <SectionLabel icon="Target">{t("title")}</SectionLabel>
      <div style={s.card}>
        <div style={s.headerRow}>
          {intent.change_type && <Badge>{t(`changeType.${intent.change_type}`)}</Badge>}
          <Badge color={confidenceStyle.color} bg={confidenceStyle.bg}>
            {t(confidenceStyle.labelKey)}
          </Badge>
        </div>

        <p style={s.summary}>{intent.intent}</p>

        {confidence === "low" && <span style={s.hint}>{t("lowHint")}</span>}

        {(intent.in_scope.length > 0 || intent.out_of_scope.length > 0) && (
          <div style={s.scopeCols}>
            {intent.in_scope.length > 0 && (
              <div>
                <div style={s.scopeLabel}>{t("inScope")}</div>
                <ul style={s.scopeList}>
                  {intent.in_scope.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {intent.out_of_scope.length > 0 && (
              <div>
                <div style={s.scopeLabel}>{t("outOfScope")}</div>
                <ul style={s.scopeList}>
                  {intent.out_of_scope.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {(used.length > 0 || missing.length > 0) && (
          <div style={s.sourcesRow}>
            <span style={s.sourcesLabel}>{t("sources.title")}</span>
            {used.map((src, i) => (
              <span key={`used-${i}`} style={s.sourceChip} title={t("sources.used")}>
                {src.ref}
              </span>
            ))}
            {missing.map((src, i) => (
              <span key={`missing-${i}`} style={s.sourceChipMissing} title={t("sources.missing")}>
                {src.kind}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
