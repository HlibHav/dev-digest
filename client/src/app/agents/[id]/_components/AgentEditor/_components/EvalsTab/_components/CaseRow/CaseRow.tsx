/* CaseRow — one eval case in the Evals tab: name, expectation chip, last result, run/edit/delete. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { IconBtn } from "@devdigest/ui";
import type { EvalCaseView } from "@devdigest/shared";
import { useCaseRun, useStartCaseRun } from "@/lib/hooks/eval";
import { STATUS_COLOR } from "../../constants";
import { expectationChipKey } from "../../helpers";
import { MaskedText } from "../MaskedText";
import { s } from "./styles";

export function CaseRow({
  kase,
  pendingRunId,
  onEdit,
  onDelete,
}: {
  kase: EvalCaseView;
  /** A case run started in the editor and still going when it closed; this row keeps polling it. */
  pendingRunId?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("eval");
  const start = useStartCaseRun();
  // The run to follow is the most recent one: started here, or handed up by the editor.
  const [runId, setRunId] = React.useState<string | null>(pendingRunId ?? null);
  const [seenPending, setSeenPending] = React.useState(pendingRunId);
  if (pendingRunId !== seenPending) {
    setSeenPending(pendingRunId);
    if (pendingRunId) setRunId(pendingRunId);
  }
  const { query: run, gone, stalled } = useCaseRun(runId, kase.agent_id);

  const polledStatus = run.data?.status;
  // Running until a terminal status, a 404 or repeated poll failures; a transient error keeps polling.
  const polling = runId !== null && !gone && !stalled && (polledStatus === undefined || polledStatus === "running");
  const running = start.isPending || polling;
  const error = start.error ?? (gone || stalled ? run.error : null);
  const last = kase.last_result;
  const status = running ? "running" : (last?.status ?? "neverRun");

  const chip = expectationChipKey(kase.expected_output);
  const mustFind = kase.expected_output.filter((e) => e.type === "must_find").length;

  return (
    <div style={s.row}>
      <span style={{ color: STATUS_COLOR[status], fontSize: 12, minWidth: 64 }}>
        {status === "running" ? t("evalsTab.running") : t(`status.${status}`)}
      </span>
      <div style={s.main}>
        <span className="mono" style={s.name}>
          <MaskedText text={kase.name} />
        </span>
        <span style={s.sub}>
          {kase.input_meta.title ? <MaskedText text={kase.input_meta.title} /> : null}
          {last && last.status !== "errored" ? (
            <span>{t("evalsTab.matched", { matched: last.matched, expected: Math.max(last.expected, mustFind) })}</span>
          ) : null}
          {kase.source ? (
            <Link href={`/repos/${kase.source.repo_id}/pulls/${kase.source.pr_number}`}>
              {t("evalsTab.createdFrom", { number: kase.source.pr_number })}
            </Link>
          ) : null}
        </span>
        {error ? (
          <span role="alert" style={s.error}>
            {error.message}
          </span>
        ) : null}
      </div>
      <span style={s.chip}>
        {chip === "mixed" ? t("evalsTab.chip.mixed", { count: kase.expected_output.length }) : t(`evalsTab.chip.${chip}`)}
      </span>
      <div style={s.actions}>
        <IconBtn
          icon="Play"
          label={t("evalsTab.runCase")}
          onClick={() => {
            if (running) return;
            setRunId(null);
            start.mutate(kase.id, { onSuccess: (a) => setRunId(a.case_run_id) });
          }}
        />
        <IconBtn icon="Edit" label={t("evalsTab.edit")} onClick={onEdit} />
        <IconBtn icon="Trash" label={t("evalsTab.delete")} onClick={onDelete} />
      </div>
    </div>
  );
}
