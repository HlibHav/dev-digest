/* VersionsTab — every body edit snapshots the previous text, so a past review
   can be read against the exact skill it ran with.

   Restore writes the old body FORWARD as a new version rather than rewinding:
   the history stays append-only, and what actually happened stays legible. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillVersions, useUpdateSkill } from "@/lib/hooks/skills";
import { ConfirmModal } from "@/components/confirm-modal";
import { countChanges, diffLines } from "../../helpers";
import { s } from "../../styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const update = useUpdateSkill();
  const [openDiff, setOpenDiff] = React.useState<number | null>(null);
  const [restoring, setRestoring] = React.useState<number | null>(null);

  if (isError) return <ErrorState body={t("versions.loadError")} onRetry={() => void refetch()} />;
  if (isLoading || !versions) return <Skeleton height={200} />;
  if (versions.length === 0) return <p style={s.empty}>{t("versions.none")}</p>;

  const sorted = [...versions].sort((a, b) => b.version - a.version);
  const current = sorted.find((v) => v.version === skill.version) ?? sorted[0]!;
  const target = restoring == null ? null : sorted.find((v) => v.version === restoring) ?? null;

  return (
    <div>
      {target && (
        <ConfirmModal
          title={t("versions.restoreTitle")}
          body={t("versions.restoreConfirm", { version: target.version })}
          confirmLabel={t("versions.restoreAction")}
          cancelLabel={t("versions.restoreCancel")}
          pending={update.isPending}
          danger={false}
          onConfirm={() =>
            update.mutate(
              { id: skill.id, patch: { body: target.body } },
              { onSettled: () => setRestoring(null) },
            )
          }
          onClose={() => setRestoring(null)}
        />
      )}

      <p style={s.description}>{t("versions.subtitle", { count: versions.length })}</p>

      {sorted.map((v) => {
        const isCurrent = v.version === skill.version;
        const lines = isCurrent ? [] : diffLines(v.body, current.body);
        const { added, removed } = countChanges(lines);
        return (
          <div key={v.version}>
            <div style={s.versionRow(isCurrent)}>
              <span className="mono" style={s.versionBadge}>
                v{v.version}
              </span>
              <span style={s.versionDate}>{new Date(v.created_at).toLocaleString()}</span>
              <span style={s.spacer} />
              {isCurrent ? (
                <Badge color="var(--accent)">{t("versions.current")}</Badge>
              ) : (
                <>
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={() => setOpenDiff(openDiff === v.version ? null : v.version)}
                  >
                    {t("versions.diff")}
                  </Button>
                  <Button kind="secondary" size="sm" onClick={() => setRestoring(v.version)}>
                    {t("versions.restore")}
                  </Button>
                </>
              )}
            </div>

            {openDiff === v.version && (
              <>
                <div style={s.diffStat}>
                  {t("versions.diffStat", { version: v.version, current: skill.version, added, removed })}
                </div>
                <div className="mono" style={s.diffBox}>
                  {lines.map((line, i) => (
                    <div key={i} style={s.diffLine(line.kind)}>
                      {line.kind === "added" ? "+ " : line.kind === "removed" ? "- " : "  "}
                      {line.text}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
