import type { SmartDiffRole } from '@devdigest/shared';
import { CLASSIFY_RULES } from './constants.js';

/**
 * Pure path classification for Smart Diff. No HTTP, no DB, no model call —
 * grouping must work before the first review ever runs. Reused by lesson L08
 * as a prompt filter.
 */

/** Escape one literal character for use inside a regex character class-free body. */
function escapeLiteral(ch: string): string {
  return /[.+^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

/**
 * Translate one glob pattern (supporting double-star, star, question-mark) to
 * an anchored RegExp, in this order: a LEADING double-star-slash becomes
 * "(?:.*(slash))?" (zero or more directories, so a root-level file still
 * matches); a TRAILING slash-double-star becomes "(slash).*"; any other
 * double-star becomes ".*"; a lone star becomes "[^(slash)]*"; a question
 * mark becomes "[^(slash)]"; everything else is escaped literally.
 *
 * Getting the leading/trailing double-star cases right matters: a naive
 * double-star-to-".*" translation turns a leading "double-star, slash, star,
 * dot, md" pattern into one that requires a slash before the filename,
 * silently missing every root-level doc file.
 */
export function globToRegExp(pattern: string): RegExp {
  let body = pattern;
  let prefix = '';
  let suffix = '';

  if (body.startsWith('**/')) {
    prefix = '(?:.*/)?';
    body = body.slice(3);
  }
  if (body.endsWith('/**')) {
    suffix = '/.*';
    body = body.slice(0, -3);
  }

  let src = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '*' && body[i + 1] === '*') {
      src += '.*';
      i++; // consumed both stars
    } else if (ch === '*') {
      src += '[^/]*';
    } else if (ch === '?') {
      src += '[^/]';
    } else {
      src += escapeLiteral(ch!);
    }
  }

  return new RegExp(`^${prefix}${src}${suffix}$`);
}

/**
 * A pattern containing `/` is anchored to the whole repo-root-relative path
 * (gitignore-style); a pattern with no `/` matches the file's basename at any
 * depth. This is what makes `pnpm-lock.yaml` catch both `pnpm-lock.yaml` and
 * `server/pnpm-lock.yaml`, `index.ts` catch a nested `.../index.ts`, and
 * `.github/**` / `e2e/**` stay anchored to the repo root.
 */
function matchesPattern(path: string, pattern: string): boolean {
  const target = pattern.includes('/') ? path : (path.split('/').pop() ?? path);
  return globToRegExp(pattern).test(target);
}

/** Classify one file path by role. Walks `CLASSIFY_RULES` in order (first
 *  match wins); `'core'` is the fallback when nothing matches. */
export function classifyFile(path: string): SmartDiffRole {
  for (const rule of CLASSIFY_RULES) {
    if (rule.patterns.some((pattern) => matchesPattern(path, pattern))) return rule.role;
  }
  return 'core';
}
