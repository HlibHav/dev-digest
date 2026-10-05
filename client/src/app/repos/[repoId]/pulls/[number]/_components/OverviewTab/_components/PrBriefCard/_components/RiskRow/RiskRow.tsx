"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { SEVERITY_COLOR } from "../../constants";
import { formatLineRef } from "../../helpers";
import { s } from "../../styles";

interface RiskRowProps {
  risk: Risk;
  /** True after a click found none of the risk's files in the PR's diff. */
  notInDiff: boolean;
  onOpen: () => void;
}

/** One risk: severity icon and text, the title (opens the file), the files with their line refs,
    and a toggle for the explanation. All model text is rendered as plain text. */
export function RiskRow({ risk, notInDiff, onOpen }: RiskRowProps) {
  const t = useTranslations("brief");
  const [expanded, setExpanded] = useState(false);

  return (
    <li style={s.row}>
      <div style={s.rowHead}>
        <Icon.AlertTriangle size={14} color={SEVERITY_COLOR[risk.severity]} />
        <span style={s.severity}>{t(`severity.${risk.severity}`)}</span>
        <button type="button" style={s.rowButton} onClick={onOpen}>
          {risk.title}
        </button>
        {risk.file_refs.map((file) => (
          <span key={file} style={s.path}>
            {formatLineRef(file, risk.line_refs)}
          </span>
        ))}
        <button type="button" style={s.toggle} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? t("risk.collapse") : t("risk.expand")}
        </button>
      </div>
      {expanded && <p style={s.explanation}>{risk.explanation}</p>}
      {notInDiff && <span style={s.notInDiff}>{t("card.notInDiff")}</span>}
    </li>
  );
}
