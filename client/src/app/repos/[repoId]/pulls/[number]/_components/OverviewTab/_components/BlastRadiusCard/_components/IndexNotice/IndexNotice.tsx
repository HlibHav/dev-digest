"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { BlastDegradedReason } from "@devdigest/shared";
import { REASON_LABEL_KEY } from "../../constants";
import { s } from "../../styles";

interface IndexNoticeResync {
  onResync: () => void;
  pending: boolean;
  queued: boolean;
}

interface IndexNoticeProps {
  reason: BlastDegradedReason;
  resync?: IndexNoticeResync;
}

/** "Incomplete index" mark (AC8) with the reason text and, when `resync` is
    passed, a Resync button (AC25) that disables while the call is pending. */
export function IndexNotice({ reason, resync }: IndexNoticeProps) {
  const t = useTranslations("blast");
  return (
    <div style={s.notice}>
      <div style={s.noticeHeader}>
        <span style={s.noticeTitle}>{t("incomplete")}</span>
        {resync && (
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            loading={resync.pending}
            disabled={resync.pending}
            onClick={resync.onResync}
          >
            {resync.pending ? t("resyncing") : t("resync")}
          </Button>
        )}
      </div>
      <span style={s.noticeBody}>{t(REASON_LABEL_KEY[reason])}</span>
      {resync?.queued && <span style={s.noticeBody}>{t("resyncQueued")}</span>}
    </div>
  );
}
