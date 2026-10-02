/* SpecsReadRow — the Configuration "Specs read" value: one chip per attached
   doc with a text status mark. Injected and modified docs open a panel with
   the text, token count, copy and expand. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { RunTrace } from "@devdigest/shared";
import { s } from "../../styles";
import { isOpenable, specRows, STATUS_COLOR, STATUS_KEY, type SpecRow } from "./helpers";

export function SpecsReadRow({ trace }: { trace: RunTrace }) {
  const t = useTranslations("runs");
  const rows = specRows(trace);
  const [openPath, setOpenPath] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (rows.length === 0) return <span style={s.specsNone}>{t("trace.config.none")}</span>;

  const active: SpecRow | undefined = rows.find((r) => r.path === openPath && isOpenable(r));
  const copy = () => {
    const write = navigator.clipboard?.writeText(active?.text ?? "");
    if (!write) return;
    write.then(
      () => {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1200);
      },
      () => {},
    );
  };

  return (
    <div style={s.specsCol}>
      <div style={s.specsWrap}>
        {rows.map((r) => {
          const mark = (
            <>
              <span className="mono">{r.path}</span>
              <span style={{ ...s.specStatus, color: r.status ? STATUS_COLOR[r.status] : "var(--text-muted)" }}>
                {r.status ? t(`trace.specStatus.${STATUS_KEY[r.status]}`) : "—"}
              </span>
            </>
          );
          return isOpenable(r) ? (
            <button
              key={r.path}
              type="button"
              aria-expanded={openPath === r.path}
              onClick={() => {
                setOpenPath((p) => (p === r.path ? null : r.path));
                setExpanded(false);
              }}
              style={s.specChipBtn}
            >
              {mark}
            </button>
          ) : (
            <span key={r.path} style={s.specChip}>
              {mark}
            </span>
          );
        })}
      </div>
      {active && (
        <div style={s.specPanel}>
          <div style={s.specPanelHead}>
            {active.tokens != null && (
              <span className="tnum" style={s.promptTokens}>
                {t("trace.prompt.tokens", { count: active.tokens })}
              </span>
            )}
            <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              <button type="button" title={t("trace.prompt.copy")} aria-label={t("trace.prompt.copy")} onClick={copy} style={s.specMiniBtn}>
                {copied ? <Icon.Check size={12} /> : <Icon.Copy size={12} />}
              </button>
              <button type="button" onClick={() => setExpanded((e) => !e)} style={s.specMiniBtn}>
                {expanded ? t("trace.collapse") : t("trace.expand")}
              </button>
            </span>
          </div>
          <pre className="mono" style={expanded ? s.specPre : { ...s.specPre, maxHeight: 160 }}>
            {active.text}
          </pre>
        </div>
      )}
    </div>
  );
}
