/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile, SmartDiffRole } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import { filesWithFindings, type DiffFindingApi } from "../findings";
import { s } from "../styles";
import { FileCard } from "../FileCard";
import { RoleGroup } from "../RoleGroup";

export interface DiffViewerGroup {
  role: SmartDiffRole;
  label: string;
  hint: string;
  files: PrFile[];
}

export function DiffViewer({
  files,
  commenting,
  groups,
  findings,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  /** Smart Diff groups, already in server display order — DiffViewer never
   *  re-sorts. Omit to render the flat, ungrouped ("Original order") list. */
  groups?: DiffViewerGroup[];
  findings?: DiffFindingApi;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }

  if (groups) {
    return (
      <div style={s.list}>
        {groups.map((g) => (
          <RoleGroup
            key={g.role}
            role={g.role}
            label={g.label}
            hint={g.hint}
            files={g.files}
            findingsCount={filesWithFindings(g.files.map((f) => f.path), findings?.findings ?? [])}
            findings={findings}
            commenting={commenting}
          />
        ))}
      </div>
    );
  }

  return (
    <div style={s.list}>
      {files.map((f, i) => (
        <FileCard key={i} file={f} commenting={commenting} findings={findings} />
      ))}
    </div>
  );
}
