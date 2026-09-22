"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";

/** The first scan and a re-scan are two separate buttons, both always visible:
    Run Scan is live until a scan exists, Re-scan from then on. A re-run reads
    differently to someone looking at a page full of decisions. */
export function ScanButtons({
  hasScanned,
  busy,
  onScan,
}: {
  hasScanned: boolean;
  busy: boolean;
  onScan: () => void;
}) {
  const t = useTranslations("conventions");
  return (
    <>
      <Button kind="primary" size="sm" icon="Play" onClick={onScan} disabled={busy || hasScanned}>
        {t("page.runScan")}
      </Button>
      <Button kind="secondary" size="sm" icon="RefreshCw" onClick={onScan} disabled={busy || !hasScanned}>
        {t("page.rescan")}
      </Button>
    </>
  );
}
