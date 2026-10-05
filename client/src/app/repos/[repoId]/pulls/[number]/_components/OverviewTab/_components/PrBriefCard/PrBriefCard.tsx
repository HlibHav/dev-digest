"use client";

import React, { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, SectionLabel, Skeleton } from "@devdigest/ui";
import type { Verdict } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { usePrBrief, useGenerateBrief, type BriefGate } from "@/lib/hooks";
import { VerdictBanner } from "../../../VerdictBanner";
import { RiskRow } from "./_components/RiskRow";
import { FocusRow } from "./_components/FocusRow";
import { formatCost, resolveFocusTarget, resolveRiskTarget, shortSha, type OpenTarget } from "./helpers";
import { s } from "./styles";

interface PrBriefCardProps {
  prId: string | null | undefined;
  gate: BriefGate;
  /** Paths of the files in the PR's diff; a click on anything else shows `card.notInDiff`. */
  prPaths: ReadonlySet<string>;
  latestReview: {
    verdict: Verdict;
    summary: string | null;
    score: number | null;
    findingsCount: number;
    blockers: number;
    agentName: string | null;
  } | null;
  onOpenFile: (target: OpenTarget) => void;
}

/**
 * "PR Brief" block: the stored (or freshly generated) summary, risk areas and review focus.
 * Server state lives in the query and the mutation; local state is only which clicked rows
 * found their file outside the diff. Everything the model wrote is plain text.
 */
export function PrBriefCard({ prId, gate, prPaths, latestReview, onOpenFile }: PrBriefCardProps) {
  const t = useTranslations("brief");
  const query = usePrBrief(prId, gate);
  const generate = useGenerateBrief(prId);
  // The "not in diff" marks belong to one brief: they are stamped with its `generated_at`
  // and ignored once a refreshed or regenerated brief carries another one.
  const [missedState, setMissedState] = useState<{ stamp: string | null; keys: ReadonlySet<string> }>({
    stamp: null,
    keys: new Set(),
  });

  const brief = query.data;
  const stamp = brief?.generated_at ?? null;
  const missed: ReadonlySet<string> = missedState.stamp === stamp ? missedState.keys : new Set();
  const busy = query.isPending || generate.isPending;

  // react-query publishes `isPending` on a timer, so two clicks in one tick would both see it false.
  const inFlight = useRef(false);
  const run = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    generate.mutate(undefined, {
      onSettled: () => {
        inFlight.current = false;
      },
    });
  };

  const open = (key: string, target: OpenTarget | null) => {
    const base = missedState.stamp === stamp ? missedState.keys : new Set<string>();
    const keys = new Set(base);
    if (target) keys.delete(key);
    else keys.add(key);
    setMissedState({ stamp, keys });
    if (target) onOpenFile(target);
  };

  const refresh = brief ? (
    <Button kind="ghost" size="sm" icon="RefreshCw" disabled={busy} onClick={run}>
      {t("card.refresh")}
    </Button>
  ) : undefined;

  // A failed read has no brief to show, so it gets the same message and a way to generate.
  const failure = generate.error ?? query.error;
  const failureText = failure
    ? failure instanceof ApiError && failure.code === "config_error"
      ? t("errors.config")
      : t("errors.generic", { message: failure.message })
    : null;

  return (
    <section>
      <SectionLabel icon="Sparkles" right={refresh}>
        {t("card.title")}
      </SectionLabel>
      <div style={s.card}>
        {failureText && (
          <div style={s.error} role="alert">
            <span>{failureText}</span>
            <Button kind="ghost" size="sm" disabled={generate.isPending} onClick={run}>
              {t("card.retry")}
            </Button>
          </div>
        )}

        {query.isSuccess && !brief && (
          <div>
            <Button kind="primary" size="sm" icon="Sparkles" disabled={busy} onClick={run}>
              {t("card.generate")}
            </Button>
          </div>
        )}

        {busy ? (
          <div style={s.skeletons} aria-label={t("card.loading")} aria-busy="true">
            <Skeleton height={14} />
            <Skeleton height={14} width="80%" />
            <Skeleton height={14} width="60%" />
          </div>
        ) : (
          brief && (
            <>
              {latestReview && <VerdictBanner {...latestReview} />}
              <p style={s.summary}>{brief.summary}</p>

              {brief.stale && (
                <div style={s.metaRow}>
                  <span style={s.staleBadge}>{t("card.stale")}</span>
                  <span>{t("card.staleFor", { sha: shortSha(brief.head_sha) })}</span>
                </div>
              )}
              {brief.missing_inputs.length > 0 && (
                <span style={s.note}>
                  {t("missing.line", { inputs: brief.missing_inputs.map((i) => t(`inputs.${i}`)).join(", ") })}
                </span>
              )}
              {brief.truncated_inputs.length > 0 && (
                <span style={s.note}>
                  {t("truncated.line", {
                    inputs: brief.truncated_inputs.map((i) => t(`inputs.${i}`)).join(", "),
                  })}
                </span>
              )}

              <div>
                <div style={s.subhead}>{t("sections.risks")}</div>
                {brief.risks.risks.length === 0 ? (
                  <span style={s.note}>{t("noRisks")}</span>
                ) : (
                  <ul style={s.list}>
                    {brief.risks.risks.map((risk, i) => (
                      <RiskRow
                        key={i}
                        risk={risk}
                        notInDiff={missed.has(`risk:${i}`)}
                        onOpen={() => open(`risk:${i}`, resolveRiskTarget(risk, prPaths))}
                      />
                    ))}
                  </ul>
                )}
              </div>

              {brief.review_focus.length > 0 && (
                <div>
                  <div style={s.subhead}>{t("sections.focus")}</div>
                  <div style={s.hint}>{t("focus.hint")}</div>
                  <ul style={s.list}>
                    {brief.review_focus.map((item, i) => (
                      <FocusRow
                        key={i}
                        item={item}
                        notInDiff={missed.has(`focus:${i}`)}
                        onOpen={() => open(`focus:${i}`, resolveFocusTarget(item, prPaths))}
                      />
                    ))}
                  </ul>
                </div>
              )}

              <div style={s.footer}>
                <span>{t("card.cost", { cost: formatCost(brief.cost_usd) ?? t("card.costNone") })}</span>
                <span>{t("card.tokens", { tokensIn: brief.tokens_in, tokensOut: brief.tokens_out })}</span>
                <span>{brief.model}</span>
              </div>
            </>
          )
        )}
      </div>
    </section>
  );
}
