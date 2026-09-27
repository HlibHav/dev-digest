/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { FindingRecord, PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { filesWithFindings, partitionFindings, type DiffFindingApi } from "../findings";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Findings matched to a given parsed line (RIGHT side only — findings key
 *  on the new line number). */
function findingsForLine(ln: Line, matched: Map<string, FindingRecord[]>): FindingRecord[] {
  if (matched.size === 0 || ln.newNo == null) return [];
  return matched.get(`RIGHT:${ln.newNo}`) ?? [];
}

export function FileCard({
  file,
  commenting,
  findings,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
}) {
  const t = useTranslations("shell");
  const tf = useTranslations("prReview");
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  // Same split for findings: matched to a rendered line, or "unanchored"
  // (the finding's start_line isn't in this patch) — shown in a trailing
  // block rather than dropped.
  const fileFindings = findings?.findings;
  const { matched: matchedFindings, unanchored: unanchoredFindings } = React.useMemo(() => {
    if (!fileFindings) return { matched: new Map<string, FindingRecord[]>(), unanchored: [] };
    const forFile = fileFindings.filter((f) => f.file === file.path);
    const renderedKeys = new Set<string>();
    for (const ln of lines) if (ln.newNo != null) renderedKeys.add(`RIGHT:${ln.newNo}`);
    return partitionFindings(forFile, renderedKeys);
  }, [fileFindings, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;
  const hasFindings = findings ? filesWithFindings([file.path], findings.findings) > 0 : false;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        {hasFindings && (
          <span
            title={tf("smartDiff.fileHasFindings")}
            style={{ width: 6, height: 6, borderRadius: 99, background: "var(--crit)", flexShrink: 0 }}
          />
        )}
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                findings={findingsForLine(ln, matchedFindings)}
                findingApi={findings}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {findings && findings.showFindings && unanchoredFindings.length > 0 && (
            <div style={s.fileBody}>
              <div style={{ padding: "6px 14px", fontSize: 11.5, color: "var(--text-muted)" }}>
                {tf("smartDiff.unanchoredHeading")}
              </div>
              {unanchoredFindings.map((f) => (
                <div key={f.id} style={{ padding: "0 14px 10px" }}>
                  {findings.renderFinding(f)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
