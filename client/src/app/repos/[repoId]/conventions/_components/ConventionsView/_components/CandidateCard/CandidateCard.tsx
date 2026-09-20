/* CandidateCard — one extracted convention awaiting a decision.

   Accept / Reject / Edit all act on the same row. Edit swaps the rule text for
   an input IN PLACE: triage is a fast pass over many cards, and navigating away
   to fix a word would break it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { confidencePercent, githubBlobUrl } from "../../helpers";
import { s } from "./styles";

export function CandidateCard({
  candidate,
  repoFullName,
  defaultBranch,
  pending,
  onAccept,
  onReject,
  onEdit,
}: {
  candidate: ConventionCandidate;
  repoFullName: string;
  defaultBranch: string;
  pending?: boolean;
  onAccept: () => void;
  onReject: () => void;
  onEdit: (patch: { rule: string; category: string }) => void;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(candidate.rule);
  const [category, setCategory] = React.useState(candidate.category);

  // A re-scan or another edit can change the row underneath us; when it does,
  // the form should show the new truth rather than a stale draft.
  React.useEffect(() => {
    if (!editing) {
      setRule(candidate.rule);
      setCategory(candidate.category);
    }
  }, [candidate.rule, candidate.category, editing]);

  const save = () => {
    const next = rule.trim();
    if (next.length === 0) return;
    onEdit({ rule: next, category: category.trim() || candidate.category });
    setEditing(false);
  };

  const href = githubBlobUrl(
    repoFullName,
    defaultBranch,
    candidate.evidence_path,
    candidate.evidence_line,
  );

  return (
    <div style={s.card(candidate.status)}>
      <div style={s.headerRow}>
        <span style={s.category}>{category}</span>
        <span style={s.spacer} />
        {candidate.status === "accepted" && (
          <span style={s.acceptedTag}>{t("card.accepted")}</span>
        )}
        <span style={s.confidence(candidate.confidence)}>
          {t("card.confidence")} {confidencePercent(candidate.confidence)}%
        </span>
      </div>

      {editing ? (
        <div style={s.editRow}>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label={t("card.categoryLabel")}
            style={s.input}
          />
          <textarea
            value={rule}
            onChange={(e) => setRule(e.target.value)}
            aria-label={t("card.ruleLabel")}
            rows={3}
            style={s.input}
          />
        </div>
      ) : (
        <div style={s.rule}>{candidate.rule}</div>
      )}

      {/* The evidence is the point: one click lands on the real line on GitHub. */}
      <a href={href} target="_blank" rel="noreferrer noopener" style={s.evidence}>
        <Icon.FileText size={12} />
        {candidate.evidence_path}
        {candidate.evidence_line ? `:${candidate.evidence_line}` : ""}
      </a>
      {candidate.evidence_snippet && <div style={s.snippet}>{candidate.evidence_snippet}</div>}

      <div style={s.actions}>
        {editing ? (
          <>
            <Button kind="primary" size="sm" onClick={save} disabled={rule.trim().length === 0}>
              {t("card.save")}
            </Button>
            <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
              {t("card.cancel")}
            </Button>
          </>
        ) : (
          <>
            <Button
              kind="primary"
              size="sm"
              icon="Check"
              onClick={onAccept}
              disabled={pending || candidate.status === "accepted"}
            >
              {t("card.accept")}
            </Button>
            <Button kind="ghost" size="sm" icon="X" onClick={onReject} disabled={pending}>
              {t("card.reject")}
            </Button>
            <Button kind="ghost" size="sm" icon="Edit" onClick={() => setEditing(true)}>
              {t("card.edit")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
