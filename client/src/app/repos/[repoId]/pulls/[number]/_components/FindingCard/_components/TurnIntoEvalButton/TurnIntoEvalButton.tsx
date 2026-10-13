/* TurnIntoEvalButton — turns a decided finding into a regression case on its agent.
   Undecided findings and reviews without an agent get a disabled button with a hint. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { useCreateCaseFromFinding } from "@/lib/hooks/eval";
import { notify } from "@/lib/toast";

type Outcome =
  | { kind: "created"; agentId: string; agentName: string; caseId: string }
  | { kind: "error"; message: string };

export function TurnIntoEvalButton({
  finding,
  agent,
}: {
  finding: FindingRecord;
  agent: { id: string | null; name: string | null };
}) {
  const t = useTranslations("eval.finding");
  const create = useCreateCaseFromFinding();
  const inFlight = React.useRef(false);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);

  const decided = !!finding.accepted_at || !!finding.dismissed_at;
  const hint = !agent.id ? t("hintNoAgent") : !decided ? t("hintUndecided") : null;

  const onClick = () => {
    if (inFlight.current || hint) return;
    inFlight.current = true;
    create.mutate(
      { findingId: finding.id },
      {
        onSuccess: (created) => {
          setOutcome({ kind: "created", agentId: created.agent.id, agentName: created.agent.name, caseId: created.case.id });
          notify.success(t("created", { agent: created.agent.name }));
        },
        onError: (err) => {
          setOutcome({ kind: "error", message: err.message });
          notify.error(err.message);
        },
        onSettled: () => {
          inFlight.current = false;
        },
      },
    );
  };

  return (
    <>
      <Button
        kind="secondary"
        size="sm"
        icon="FlaskConical"
        disabled={!!hint}
        loading={create.isPending}
        title={hint ?? undefined}
        onClick={onClick}
      >
        {t("turnInto")}
      </Button>
      {hint ? <span style={HINT}>{hint}</span> : null}
      {outcome?.kind === "created" ? (
        <span role="status" style={HINT}>
          {t("created", { agent: outcome.agentName })}{" "}
          <Link href={`/agents/${outcome.agentId}?tab=evals&case=${outcome.caseId}`}>{t("openCase")}</Link>
        </span>
      ) : null}
      {outcome?.kind === "error" ? (
        <span role="alert" style={{ ...HINT, color: "var(--crit)" }}>
          {outcome.message}
        </span>
      ) : null}
    </>
  );
}

const HINT: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", alignSelf: "center" };
