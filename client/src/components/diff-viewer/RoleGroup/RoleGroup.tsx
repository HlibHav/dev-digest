/* RoleGroup — one Smart Diff group (core/tests/wiring/docs/boilerplate):
   a sticky header (colour square, label, hint, files-with-findings dot,
   file count) and, when open, a FileCard per file. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile, SmartDiffRole } from "@/lib/types";
import { ROLE_COLOR_VAR, COLLAPSED_BY_DEFAULT } from "../constants";
import { type DiffCommentApi } from "../comments";
import { type DiffFindingApi } from "../findings";
import { FileCard } from "../FileCard";
import { chevronFor } from "../styles";

export function RoleGroup({
  role,
  label,
  hint,
  files,
  findingsCount,
  findings,
  commenting,
}: {
  role: SmartDiffRole;
  label: string;
  hint: string;
  files: PrFile[];
  /** Files-with-findings in this group (pre-computed by DiffViewer). */
  findingsCount: number;
  findings?: DiffFindingApi;
  commenting?: DiffCommentApi;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(!COLLAPSED_BY_DEFAULT.has(role));

  return (
    <div style={s.group}>
      <div onClick={() => setOpen((o) => !o)} style={s.header}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span style={{ ...s.swatch, background: ROLE_COLOR_VAR[role] }} />
        <span style={s.label}>{label}</span>
        <span style={s.hint}>{hint}</span>
        {findingsCount > 0 && (
          <span style={s.findingsCount}>
            <span style={{ ...s.dot, background: "var(--crit)" }} />
            {findingsCount}
          </span>
        )}
        <span style={s.fileCount}>{t("smartDiff.filesCount", { count: files.length })}</span>
      </div>
      {open && (
        <div style={s.body}>
          {files.map((file) => (
            <FileCard key={file.path} file={file} commenting={commenting} findings={findings} />
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  group: { display: "flex", flexDirection: "column", gap: 8 } as React.CSSProperties,
  header: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 4px",
    cursor: "pointer",
    background: "var(--bg-primary)",
  } as React.CSSProperties,
  swatch: { width: 8, height: 8, borderRadius: 2, flexShrink: 0 } as React.CSSProperties,
  label: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } as React.CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } as React.CSSProperties,
  findingsCount: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--crit)",
  } as React.CSSProperties,
  dot: { width: 6, height: 6, borderRadius: 99 } as React.CSSProperties,
  fileCount: { fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" } as React.CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 10 } as React.CSSProperties,
};
