"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, SectionLabel } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { CONFIDENCE_STYLE } from "./constants";
import { usedSources, missingSources } from "./helpers";
import { s } from "./styles";

interface IntentCardProps {
  intent: PrIntentRecord | null | undefined;
  isLoading?: boolean;
  /** The PR's current head; when it differs from `intent.head_sha` the card says so. */
  currentHeadSha?: string | null;
  /** Re-derive now (POST /pulls/:id/intent). No button when absent. */
  onRederive?: () => void;
  rederiving?: boolean;
}

/**
 * "Stated intent" card — the PR author's claim, derived by a cheap model
 * before review. Never shown as a verdict: it's context for scope only (see
 * `reviewer-core`'s `INTENT_RULES`). Derived on the next review, or on demand through the
 * Derive / Re-derive button (`POST /pulls/:id/intent`).
 */
export function IntentCard({ intent, isLoading, currentHeadSha, onRederive, rederiving }: IntentCardProps) {
  const t = useTranslations("intent");
  const rederiveButton = onRederive ? (
    <Button kind="ghost" size="sm" icon="RefreshCw" loading={rederiving} onClick={onRederive}>
      {rederiving ? t("rederiving") : intent ? t("rederive") : t("derive")}
    </Button>
  ) : undefined;

  if (isLoading) return null;
  if (!intent) {
    return (
      <section>
        <SectionLabel icon="Target" right={rederiveButton}>
          {t("title")}
        </SectionLabel>
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
  const stale = !!currentHeadSha && !!intent.head_sha && intent.head_sha !== currentHeadSha;

  return (
    <section>
      <SectionLabel icon="Target" right={rederiveButton}>
        {t("title")}
      </SectionLabel>
      <div style={s.card}>
        <div style={s.headerRow}>
          {intent.change_type && <Badge>{t(`changeType.${intent.change_type}`)}</Badge>}
          <Badge color={confidenceStyle.color} bg={confidenceStyle.bg}>
            {t(confidenceStyle.labelKey)}
          </Badge>
        </div>

        <p style={s.summary}>{intent.intent}</p>

        {confidence === "low" && <span style={s.hint}>{t("lowHint")}</span>}

        {stale && (
          <span style={s.hint}>{t("stale", { sha: (intent.head_sha ?? "").slice(0, 7) })}</span>
        )}

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
