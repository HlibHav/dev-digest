/* DocPreviewModal — one repo doc rendered as markdown in the vendored Modal. */
"use client";

import React from "react";
import { Modal, Markdown, Skeleton } from "@devdigest/ui";
import { useContextDoc } from "../../../../lib/hooks/project-context";
import { s } from "../../styles";

export function DocPreviewModal({
  repoId,
  path,
  errorLabel,
  onClose,
}: {
  repoId: string;
  path: string;
  errorLabel: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useContextDoc(repoId, path);
  return (
    <Modal width={720} title={<span className="mono">{path}</span>} onClose={onClose}>
      <div style={s.preview}>
        {isLoading && <Skeleton height={120} />}
        {isError && <p style={s.note}>{errorLabel}</p>}
        {data && <Markdown>{data.content}</Markdown>}
      </div>
    </Modal>
  );
}
