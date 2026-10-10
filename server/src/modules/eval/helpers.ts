import type { EvalCaseMeta } from '@devdigest/shared';

export function caseNameFromFinding(f: { file: string; start_line: number; title: string }): string {
  return `${f.file}:${f.start_line} — ${f.title}`;
}

/** Wrap a stored per-file patch in the git headers `parseUnifiedDiff` expects. */
export function buildCaseDiff(path: string, patch: string): string {
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${patch}`;
}

export function diffBytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function prDescription(meta: EvalCaseMeta): string | undefined {
  const text = `${meta.title.trim()}\n\n${meta.body.trim()}`.trim();
  return text === '' ? undefined : text;
}

/** Mask provider-key and bearer-token shapes before text reaches a log line. */
export function redactSecrets(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')
    .replace(/Bearer\s+[^\s'",;]+/gi, 'Bearer ***');
}
