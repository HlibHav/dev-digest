"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Chip } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi, type DiffViewerGroup } from "@/components/diff-viewer";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePrComments,
  useCreatePrComment,
  usePrReviews,
  usePrActiveRuns,
  useSmartDiff,
  useFindingAction,
} from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { latestReviewFindings } from "./helpers";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** Needed by FindingCard's inline finding cards (GitHub blob links). */
  repoFullName?: string | null;
  headSha?: string | null;
}

export function DiffTab({ prId, filesCount, files, canComment, repoFullName, headSha }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // react-query dedupes this against the page-level `usePrReviews(prId)` call
  // (same queryKey), so this is not an extra network round trip.
  const { data: reviews } = usePrReviews(prId);
  const { data: smartDiff } = useSmartDiff(prId);
  const action = useFindingAction();
  // Counters and dots refresh when a run finishes while THIS tab is open
  // (P3-17). `onRunDone` lives in FindingsTab, which is unmounted here, so
  // watch the polled active-run list and refetch reviews on the running → idle
  // edge instead.
  const qc = useQueryClient();
  const { data: activeRuns } = usePrActiveRuns(prId);
  const running = (activeRuns?.length ?? 0) > 0;
  const wasRunning = React.useRef(false);
  React.useEffect(() => {
    if (wasRunning.current && !running && prId) qc.invalidateQueries({ queryKey: ["reviews", prId] });
    wasRunning.current = running;
  }, [running, prId, qc]);
  // One shared toggle now gates BOTH GitHub comments and inline findings
  // (P2-13) — default shown, unlike the old comments-only toggle.
  const [showComments, setShowComments] = React.useState(true);
  const [order, setOrder] = React.useState<"smart" | "original">("smart");

  const commentCount = comments?.length ?? 0;
  const reviewFindings = React.useMemo(() => latestReviewFindings(reviews ?? []), [reviews]);

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const findings: DiffFindingApi = {
    findings: reviewFindings,
    showFindings: showComments,
    renderFinding: (f) => (
      <FindingCard
        f={f}
        // Not optional (P1-5): FindingCard defaults this to false, which
        // would hide the rationale and fail the acceptance criterion outright.
        // The header-click collapse (P3-15) still works from this expanded
        // starting state.
        defaultExpanded={true}
        pending={action.isPending}
        repoFullName={repoFullName}
        headSha={headSha}
        onAction={(act) => {
          if (prId) action.mutate({ findingId: f.id, action: act, prId });
        }}
      />
    ),
  };

  // Join smart-diff groups' file paths back to `files` by path — the
  // smart-diff route returns no patch. The server already emits groups in
  // ROLE_ORDER; DiffTab never re-sorts them.
  const byPath = React.useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);
  const groups: DiffViewerGroup[] | undefined =
    order === "smart" && smartDiff
      ? smartDiff.groups.map((g) => ({
          role: g.role,
          label: t(`smartDiff.${g.role}Label`),
          hint: t(`smartDiff.${g.role}Hint`),
          files: g.files.map((f) => byPath.get(f.path)).filter((f): f is PrFile => !!f),
        }))
      : undefined;

  // Gate on comments OR findings (P2-13): a PR with findings but zero GitHub
  // comments must still see the toggle, not just when commentCount > 0.
  const toggleCount = commentCount + reviewFindings.length;

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {reviews && reviews.length === 0 && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("smartDiff.emptyNoReview")}</span>
            )}
            <Chip active={order === "smart"} onClick={() => setOrder("smart")}>
              {t("smartDiff.orderSmart")}
            </Chip>
            <Chip active={order === "original"} onClick={() => setOrder("original")}>
              {t("smartDiff.orderOriginal")}
            </Chip>
            {toggleCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {t(showComments ? "smartDiff.toggleHide" : "smartDiff.toggleShow", { count: toggleCount })}
              </Button>
            )}
          </div>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      <DiffViewer files={files} commenting={commenting} groups={groups} findings={findings} />
    </section>
  );
}
