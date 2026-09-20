"use client";

import { useTranslations } from "next-intl";
import { COLUMN_HINT_KEYS, COLUMN_KEYS } from "../../constants";
import { s } from "../../styles";

/** Header row of the PR list; columns with a hint get a native `title` tooltip. */
export function PRListHeader() {
  const t = useTranslations("prReview");
  return (
    <div style={s.headRow}>
      {COLUMN_KEYS.map((key, i) => (
        <div
          key={key}
          style={s.headCell(i === COLUMN_KEYS.length - 1)}
          title={COLUMN_HINT_KEYS.has(key) ? t(`list.columnHints.${key}`) : undefined}
        >
          {t(`list.columns.${key}`)}
        </div>
      ))}
    </div>
  );
}
