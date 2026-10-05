"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingItem } from "@devdigest/shared";
import { COPIED_RESET_MS } from "../../constants";
import { s } from "./styles";

export function CommandRows({ items }: { items: OnboardingItem[] }) {
  const t = useTranslations("onboarding");
  const [copiedIdx, setCopiedIdx] = React.useState<number | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = (command: string, i: number) => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopiedIdx(i);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiedIdx(null), COPIED_RESET_MS);
    });
  };

  const rows = items.filter((it) => it.command);
  if (rows.length === 0) return <div style={s.empty}>{t("noCommands")}</div>;

  return (
    <div style={s.list}>
      {rows.map((item, i) => {
        const command = item.command as string;
        return (
          <div key={`${command}-${i}`} style={s.row}>
            <span style={s.num}>{i + 1}</span>
            <div style={s.text}>
              <span className="mono" style={s.command}>{command}</span>
              {item.note && <span style={s.note}>{item.note}</span>}
            </div>
            <button
              type="button"
              aria-label={t("copyAria", { command })}
              style={s.copy}
              onClick={() => copy(command, i)}
            >
              {copiedIdx === i && <span>{t("copied")}</span>}
              <Icon.Copy size={14} aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
