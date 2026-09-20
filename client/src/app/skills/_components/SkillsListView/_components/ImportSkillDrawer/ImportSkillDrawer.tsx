/* ImportSkillDrawer — pick a markdown file or an archive, read what WOULD be
   saved, then confirm. Nothing is written before the confirm: the preview comes
   from a parse-only endpoint. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, Icon, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import {
  useCreateSkill,
  usePreviewSkillImport,
  type SkillImportPreview,
} from "../../../../../../lib/hooks/skills";
import { IMPORT_ACCEPT, TYPE_COLOR } from "../../constants";
import { fileToBase64, formatBytes } from "../../helpers";
import { s } from "./styles";

export function ImportSkillDrawer({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported?: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const preview = usePreviewSkillImport();
  const create = useCreateSkill();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [filename, setFilename] = React.useState<string | null>(null);
  const [reading, setReading] = React.useState(false);
  const [parsed, setParsed] = React.useState<SkillImportPreview | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setFilename(file.name);
    setParsed(null);
    setReading(true);
    try {
      const content_base64 = await fileToBase64(file);
      preview.mutate(
        { filename: file.name, content_base64 },
        { onSuccess: setParsed },
      );
    } finally {
      setReading(false);
    }
  }

  function confirm() {
    if (!parsed) return;
    create.mutate(
      {
        name: parsed.name,
        description: parsed.description,
        type: parsed.type,
        body: parsed.body,
        // Records provenance AND lands the row disabled: an imported body does
        // not reach a prompt until someone reads it.
        imported: true,
        evidence_files: [parsed.source_file],
      },
      {
        onSuccess: (skill) => {
          onImported?.(skill);
          onClose();
        },
      },
    );
  }

  return (
    <Drawer
      width={640}
      title={t("drawer.title")}
      subtitle={t("drawer.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" size="sm" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button
            kind="primary"
            size="sm"
            onClick={confirm}
            disabled={!parsed || create.isPending}
          >
            {create.isPending ? t("importer.confirming") : t("importer.confirm")}
          </Button>
        </div>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={IMPORT_ACCEPT}
        style={{ display: "none" }}
        onChange={(e) => void pick(e.target.files?.[0])}
      />

      <button style={s.dropzone} onClick={() => inputRef.current?.click()}>
        <Icon.Upload size={18} />
        <span style={s.dropzoneLabel}>
          {reading ? t("importer.picking") : preview.isPending ? t("importer.parsing") : t("importer.pick")}
        </span>
        {filename && <span style={s.filename}>{filename}</span>}
      </button>

      {preview.isError && (
        <div style={s.error}>
          {t("drawer.importFailed")}: {(preview.error as Error).message}
        </div>
      )}

      {parsed && (
        <div style={s.preview}>
          <div style={s.trust}>
            <strong style={s.trustTitle}>{t("importer.trustTitle")}</strong>
            <span>{t("importer.trustBody")}</span>
          </div>

          <div style={s.previewTitle}>{t("importer.previewTitle")}</div>
          <div style={s.row}>
            <span style={s.name}>{parsed.name}</span>
            <Badge color={TYPE_COLOR[parsed.type]} dot>
              {t(`listItem.type.${parsed.type}`)}
            </Badge>
          </div>
          {parsed.description && <p style={s.description}>{parsed.description}</p>}
          <p style={s.sourceFile}>{t("importer.sourceFile", { path: parsed.source_file })}</p>

          <div style={s.body}>
            <Markdown>{parsed.body}</Markdown>
          </div>

          {parsed.skipped.length > 0 && (
            <div style={s.skipped}>
              <div style={s.skippedTitle}>
                {t("importer.skippedTitle", { count: parsed.skipped.length })}
              </div>
              <ul style={s.skippedList}>
                {parsed.skipped.map((entry) => (
                  <li key={entry.path} style={s.skippedItem}>
                    <span className="mono" style={s.skippedPath}>
                      {entry.path}
                    </span>
                    <span style={s.skippedMeta}>
                      {formatBytes(entry.bytes)} · {t(`importer.reason.${entry.reason}`)}
                    </span>
                  </li>
                ))}
              </ul>
              <p style={s.skippedHint}>{t("importer.skippedHint")}</p>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
