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

/** Clamp a finding's line range to what `EvalExpectation` accepts: lines >= 1, end >= start. */
export function normalizeRange(startLine: number, endLine: number): { start: number; end: number } {
  const lo = Math.min(startLine, endLine);
  const hi = Math.max(startLine, endLine);
  const start = Number.isFinite(lo) ? Math.max(1, Math.trunc(lo)) : 1;
  const end = Number.isFinite(hi) ? Math.max(start, Math.trunc(hi)) : start;
  return { start, end };
}

/** Mask common provider-key, token and key=value shapes before text reaches a log line. */
export function redactSecrets(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')
    .replace(/xai-[A-Za-z0-9_-]+/g, 'xai-***')
    .replace(/github_pat_[A-Za-z0-9_]+/g, 'github_pat_***')
    .replace(/gh[pousr]_[A-Za-z0-9]{16,}/g, 'gh_***')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, 'AIza***')
    .replace(/Bearer\s+[^\s'",;]+/gi, 'Bearer ***')
    .replace(/((?:api[_-]?key|access[_-]?token|secret|token|key)=)[^\s&'",;]+/gi, '$1***');
}
