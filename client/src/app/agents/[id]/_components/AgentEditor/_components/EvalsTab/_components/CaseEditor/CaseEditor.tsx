/* CaseEditor — create or edit one eval case: name, diff, PR meta and the expected
   findings as JSON. Save is blocked until the JSON matches the expectation shape;
   an expectation no hunk can reach is warned about, not blocked. Credential-shaped
   strings are masked in the preview until revealed; the stored diff is never altered. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, Tabs, TextInput, Toggle } from "@devdigest/ui";
import type { EvalCaseView, EvalCaseWrite } from "@devdigest/shared";
import { DiffViewer } from "@/components/diff-viewer";
import { useCaseRun, useCreateEvalCase, useStartCaseRun, useUpdateEvalCase } from "@/lib/hooks/eval";
import { STATUS_COLOR } from "../../constants";
import { STATUS_KEY } from "./constants";
import { appendFindingSkeleton, diffToPrFiles, maskSecrets, unmatchableExpectations, validateExpectedOutput } from "../../helpers";
import { lastRunView } from "./helpers";
import { s } from "./styles";

type EditorTab = "diff" | "preview" | "meta";

export function CaseEditor({
  agentId,
  case: kase,
  onClose,
}: {
  agentId: string;
  case?: EvalCaseView;
  /** Receives the run still in progress (Run on save) so the caller can keep following it. */
  onClose: (pending?: { caseId: string; caseRunId: string }) => void;
}) {
  const t = useTranslations("eval");
  const [name, setName] = React.useState(kase?.name ?? "");
  const [diff, setDiff] = React.useState(kase?.input_diff ?? "");
  const [title, setTitle] = React.useState(kase?.input_meta.title ?? "");
  const [body, setBody] = React.useState(kase?.input_meta.body ?? "");
  const [expectedText, setExpectedText] = React.useState(JSON.stringify(kase?.expected_output ?? [], null, 2));
  const [runOnSave, setRunOnSave] = React.useState(false);
  const [tab, setTab] = React.useState<EditorTab>("diff");
  const [reveal, setReveal] = React.useState(false);
  const [savedId, setSavedId] = React.useState<string | null>(kase?.id ?? null);
  const [caseRunId, setCaseRunId] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const create = useCreateEvalCase(agentId);
  const update = useUpdateEvalCase(agentId);
  const startRun = useStartCaseRun();
  const run = useCaseRun(caseRunId, agentId);

  const runDone = run.data !== undefined && run.data.status !== "running";
  // Every close goes through here, so a run still going is handed to the caller.
  const closeWith = (caseId: string | null) =>
    onClose(caseRunId && caseId && !runDone ? { caseId, caseRunId } : undefined);
  const close = () => closeWith(savedId);

  const check = validateExpectedOutput(expectedText);
  const warnings = check.ok ? unmatchableExpectations(diff, check.value) : [];
  const { masked, found } = maskSecrets(diff);
  const files = diffToPrFiles(reveal ? diff : masked);
  const busy = create.isPending || update.isPending || startRun.isPending;
  const canSave = !busy && name.trim() !== "" && diff.trim() !== "" && check.ok;

  const save = async () => {
    if (!check.ok) return;
    const payload: EvalCaseWrite = {
      name: name.trim(),
      input_diff: diff,
      input_meta: { title, body },
      expected_output: check.value,
      notes: kase?.notes ?? null,
    };
    setSaveError(null);
    try {
      const saved = savedId ? await update.mutateAsync({ id: savedId, body: payload }) : await create.mutateAsync(payload);
      setSavedId(saved.id);
      if (!runOnSave) return closeWith(saved.id);
      const accepted = await startRun.mutateAsync(saved.id);
      setCaseRunId(accepted.case_run_id);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  };

  const lastView = lastRunView(run.data ?? null, caseRunId !== null, kase?.last_result ?? null);

  return (
    <Modal
      width={820}
      title={kase ? t("caseEditor.caseTitle", { name: kase.name }) : t("caseEditor.newCase")}
      onClose={close}
      footer={
        <div style={s.footer}>
          <span style={s.row}>
            <Toggle on={runOnSave} onChange={setRunOnSave} size={16} />
            <span>{t("caseEditor.runOnSave")}</span>
          </span>
          <span style={s.grow} />
          <Button kind="ghost" onClick={close}>
            {t("caseEditor.cancel")}
          </Button>
          <Button kind="primary" disabled={!canSave} loading={busy} onClick={save}>
            {t("caseEditor.save")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <label style={s.field}>
          {t("caseEditor.nameLabel")}
          <TextInput value={name} onChange={setName} placeholder={t("caseEditor.namePlaceholder")} />
        </label>
        {name.trim() === "" ? <span style={s.hint}>{t("caseEditor.nameRequired")}</span> : null}

        <Tabs
          pad="0"
          value={tab}
          onChange={(k) => setTab(k as EditorTab)}
          tabs={[
            { key: "diff", label: t("caseEditor.tabs.diff") },
            { key: "preview", label: t("caseEditor.preview") },
            { key: "meta", label: t("caseEditor.tabs.prMeta") },
          ]}
        />
        {tab === "diff" ? (
          <>
            <label style={s.field}>
              {t("caseEditor.tabs.diff")}
              <textarea
                className="mono"
                style={s.textarea}
                value={diff}
                placeholder={t("caseEditor.diffPlaceholder")}
                onChange={(e) => setDiff(e.target.value)}
              />
            </label>
            {diff.trim() === "" ? <span style={s.hint}>{t("caseEditor.diffRequired")}</span> : null}
          </>
        ) : null}
        {tab === "preview" ? (
          <>
            {found ? (
              <div style={s.row}>
                {reveal ? null : <span style={s.hint}>{t("evalsTab.masked")}</span>}
                <Button kind="ghost" size="sm" onClick={() => setReveal((r) => !r)}>
                  {reveal ? t("evalsTab.hide") : t("evalsTab.reveal")}
                </Button>
              </div>
            ) : null}
            <DiffViewer files={files} />
          </>
        ) : null}
        {tab === "meta" ? (
          <>
            <label style={s.field}>
              {t("caseEditor.titleLabel")}
              <TextInput value={title} onChange={setTitle} placeholder={t("caseEditor.titlePlaceholder")} />
            </label>
            <label style={s.field}>
              {t("caseEditor.bodyLabel")}
              <textarea
                style={s.textarea}
                value={body}
                placeholder={t("caseEditor.bodyPlaceholder")}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
          </>
        ) : null}

        <div style={s.field}>
          <span style={s.row}>
            <span style={s.grow}>{t("caseEditor.expectedOutput")}</span>
            <Button kind="ghost" size="sm" icon="Plus" onClick={() => setExpectedText(appendFindingSkeleton(expectedText))}>
              {t("caseEditor.findingSkeleton")}
            </Button>
          </span>
          <textarea
            className="mono"
            style={s.textarea}
            aria-label={t("caseEditor.expectedOutput")}
            value={expectedText}
            onChange={(e) => setExpectedText(e.target.value)}
            aria-invalid={!check.ok}
          />
        </div>
        {check.ok ? (
          <span style={s.ok}>{t("caseEditor.validJson")}</span>
        ) : (
          <span role="alert" style={s.error}>
            {check.error}
          </span>
        )}
        {check.ok && warnings.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {warnings.map((i) => (
              <li key={i} style={s.warn}>
                {check.value[i]!.file}:{check.value[i]!.start_line}-{check.value[i]!.end_line} · {t("caseEditor.neverMatched")}
              </li>
            ))}
          </ul>
        ) : null}

        {saveError ? (
          <span role="alert" style={s.error}>
            {saveError}
          </span>
        ) : null}
        {lastView ? (
          <div style={s.lastRun} role="status">
            <strong style={{ color: STATUS_COLOR[lastView.status] }}>{t(STATUS_KEY[lastView.status])}</strong>
            {lastView.summary ? (
              <span>
                {t("caseEditor.lastRunSummary", {
                  matched: lastView.summary.matched,
                  expected: lastView.summary.expected,
                  duration: lastView.summary.durationSec,
                  cost: lastView.summary.cost,
                })}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
