/* FindingsPanel — hide-low-confidence + j/k navigation + FindingCard list,
   wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, Chip, SEV } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { KEY_TO_ACTION, SEVERITY_FILTERS } from "./constants";
import { countsBySeverity, visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [severity, setSeverity] = React.useState<Severity | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);

  // Counts come from the unfiltered-by-severity list so every pill stays clickable.
  const base = React.useMemo(() => visibleFindings(findings, hideLow), [findings, hideLow]);
  const counts = React.useMemo(() => countsBySeverity(base), [base]);
  // Only severities the run actually has get a pill; a filter whose pill is gone no longer applies.
  const present = SEVERITY_FILTERS.filter((sev) => counts[sev] > 0);
  const activeSeverity = severity && counts[severity] > 0 ? severity : null;
  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, activeSeverity),
    [findings, hideLow, activeSeverity],
  );

  // A second click on the active pill resets the filter.
  const toggleSeverity = (sev: Severity) => {
    setSeverity((cur) => (cur === sev ? null : sev));
    setFocusIdx(0);
  };

  // Hiding low confidence can empty the selected severity; drop that filter instead of
  // letting it silently return when the toggle is switched back off.
  const changeHideLow = (next: boolean) => {
    setHideLow(next);
    if (severity && countsBySeverity(visibleFindings(findings, next))[severity] === 0) setSeverity(null);
    setFocusIdx(0);
  };

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      <div style={s.toolbar}>
        {present.map((sev, i) => (
          <React.Fragment key={sev}>
            {i > 0 && <span style={s.severitySep}>·</span>}
            <Chip
              active={activeSeverity === sev}
              icon={SEV[sev].icon}
              color={SEV[sev].c}
              onClick={() => toggleSeverity(sev)}
            >
              {t(`panel.severityCount.${sev}`, { count: counts[sev] })}
            </Chip>
          </React.Fragment>
        ))}
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={changeHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
