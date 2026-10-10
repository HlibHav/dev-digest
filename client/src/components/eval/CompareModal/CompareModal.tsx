/* CompareModal — two suite runs side by side: metric deltas, the system prompt diff,
   configuration changes and any change to the case set. All text renders as text. */
"use client";

import React, { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { EvalCompare, EvalPromptDiffLine } from "@devdigest/shared";
import { useEvalCompare } from "@/lib/hooks/eval";
import { DeltaBadge } from "../DeltaBadge";
import { formatCost, formatPct, runLabel } from "../helpers";
import { s } from "./styles";

const MARKER: Record<EvalPromptDiffLine["op"], string> = { equal: " ", add: "+", remove: "−" };

export function CompareModal({
  baseId,
  headId,
  onClose,
}: {
  baseId: string;
  headId: string;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const { data, error, isPending } = useEvalCompare(baseId, headId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const baseLabel = data ? runLabel(data.base.run_number, data.base.agent_version) : "";
  const headLabel = data ? runLabel(data.head.run_number, data.head.agent_version) : "";

  return (
    <Modal
      width={760}
      title={data ? t("compare.title", { base: baseLabel, head: headLabel }) : t("history.compare")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" size="sm" onClick={onClose}>
            {t("compare.close")}
          </Button>
        </div>
      }
    >
      {isPending ? <div style={s.note}>{t("dashboard.loading")}</div> : null}
      {error ? <div role="alert">{error.message}</div> : null}
      {data ? <CompareBody data={data} baseLabel={baseLabel} headLabel={headLabel} /> : null}
    </Modal>
  );
}

function CompareBody({ data, baseLabel, headLabel }: { data: EvalCompare; baseLabel: string; headLabel: string }) {
  const t = useTranslations("eval");
  const { base, head, deltas } = data;
  const rows = [
    { key: "recall", label: t("metric.recall"), from: formatPct(base.recall), to: formatPct(head.recall), delta: deltas.recall, unit: "pts" },
    { key: "precision", label: t("metric.precision"), from: formatPct(base.precision), to: formatPct(head.precision), delta: deltas.precision, unit: "pts" },
    { key: "citation", label: t("metric.citation"), from: formatPct(base.citation_accuracy), to: formatPct(head.citation_accuracy), delta: deltas.citation_accuracy, unit: "pts" },
    { key: "cost", label: t("metric.cost"), from: formatCost(base.cost_usd, base.cost_partial), to: formatCost(head.cost_usd, head.cost_partial), delta: deltas.cost_usd, unit: "usd" },
  ] as const;
  const caseSetChanged = data.case_set.added > 0 || data.case_set.removed > 0;

  return (
    <div style={s.body}>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th} />
            <th style={s.th}>{t("compare.old", { label: baseLabel })}</th>
            <th style={s.th}>{t("compare.new", { label: headLabel })}</th>
            <th style={s.th} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td style={s.td}>{r.label}</td>
              <td style={s.td}>{r.from}</td>
              <td style={s.td}>{r.to}</td>
              <td style={s.td}>
                <DeltaBadge delta={r.delta} unit={r.unit} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {caseSetChanged ? (
        <div style={s.note}>{t("compare.caseSetChanged", { added: data.case_set.added, removed: data.case_set.removed })}</div>
      ) : null}

      <section>
        <div style={s.heading}>{t("compare.configChanges")}</div>
        {data.config_changes.length === 0 ? (
          <div style={s.note}>{t("compare.noConfigChanges")}</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {data.config_changes.map((c, i) => (
              <li key={`${c.kind}-${c.name ?? ""}-${i}`}>
                {t(`compare.kind.${c.kind}`)}
                {c.name ? ` ${c.name}` : ""}: {c.from ?? "—"}
                <span style={s.arrow}>→</span>
                {c.to ?? "—"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div style={s.heading}>{t("compare.promptDiff")}</div>
        <div style={s.diff} tabIndex={0}>
          {data.prompt_diff.map((l, i) => (
            <div key={i} data-op={l.op} style={{ ...s.line, ...(l.op === "add" ? s.add : l.op === "remove" ? s.remove : null) }}>
              <span style={s.marker} aria-hidden="true">
                {MARKER[l.op]}
              </span>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
