/* FindingsCell — the PR list FINDINGS column: an icon + count per severity of
   the latest review, and on hover or focus a read-only popover of its findings. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { PrMeta } from "@devdigest/shared";
import { FindingsPopover } from "./FindingsPopover";
import { CELL_SEVERITIES } from "./helpers";
import { POPOVER_WIDTH, s } from "./styles";

const CLOSE_DELAY_MS = 150;
const POPOVER_MAX_HEIGHT = 340;

type Position = { top?: number; bottom?: number; left: number };

export function FindingsCell({ prId, latest }: { prId: string; latest: PrMeta["latest_findings"] }) {
  const t = useTranslations("prReview.list");
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = React.useState<Position | null>(null);

  const present = latest ? CELL_SEVERITIES.filter((sev) => latest.counts[sev] > 0) : [];
  const total = present.reduce((n, sev) => n + latest!.counts[sev], 0);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const open = () => {
    cancelClose();
    if (position) return;
    // Fixed positioning escapes the table card's overflow: hidden.
    const rect = wrapRef.current?.getBoundingClientRect();
    const left = Math.max(16, Math.min((rect?.left ?? 0) - 8, window.innerWidth - POPOVER_WIDTH - 16));
    const below = (rect?.bottom ?? 0) + 6;
    setPosition(
      below + POPOVER_MAX_HEIGHT > window.innerHeight && rect
        ? { bottom: window.innerHeight - rect.top + 6, left }
        : { top: below, left },
    );
  };
  const close = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPosition(null), CLOSE_DELAY_MS);
  };

  // A fixed popover would drift away from its row on scroll, so close it instead.
  React.useEffect(() => {
    if (!position) return;
    const onScroll = () => setPosition(null);
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [position]);
  React.useEffect(() => cancelClose, []);

  if (!latest || total === 0) return <span style={{ color: "var(--text-muted)" }}>—</span>;

  return (
    <div ref={wrapRef} style={s.wrap} onMouseEnter={open} onMouseLeave={close}>
      <span
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={position != null}
        aria-label={t("findingsCell.label", { count: total })}
        style={s.trigger}
        onFocus={open}
        onBlur={close}
      >
        {present.map((sev) => {
          const I = Icon[SEV[sev].icon];
          return (
            <span key={sev} aria-label={t(`findingsCell.${sev}`, { count: latest.counts[sev] })} style={s.count(SEV[sev].c)}>
              <I size={12} />
              <span className="tnum">{latest.counts[sev]}</span>
            </span>
          );
        })}
      </span>
      {position && <FindingsPopover prId={prId} reviewId={latest.review_id} total={total} position={position} />}
    </div>
  );
}
