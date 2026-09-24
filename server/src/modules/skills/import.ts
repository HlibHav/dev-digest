import { unzipSync } from 'fflate';
import type { SkillType } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { DEFAULT_SKILL_TYPE, IMPORT_MAX_BODY_BYTES, IMPORT_MAX_ENTRIES } from './constants.js';
import { sanitizeSkillBody, sanitizeSkillDescription, sanitizeSkillName } from './helpers.js';

/**
 * Skill import — parsing only, no persistence and no network.
 *
 * A skill is text, so importing one means finding the one markdown document
 * inside what the user handed us and reading its front matter. Everything else
 * in an archive — scripts, references, binaries — is LISTED and never inflated:
 * that is how "executable parts of the archive are not processed" is enforced,
 * and it is the zip-bomb gate as well, since `fflate`'s filter decides before
 * decompression and `originalSize` comes from the central directory.
 *
 * The result is a preview. Nothing is written until the user confirms and the
 * client POSTs it back to `POST /skills`.
 */

/** An archive entry we deliberately did not process. */
export interface SkippedEntry {
  path: string;
  bytes: number;
  reason: 'not-markdown' | 'too-large' | 'additional-markdown';
}

export interface SkillImportPreview {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  /** Which file the body came from — the upload itself, or an entry in the archive. */
  source_file: string;
  /** Entries present in the archive that were listed but never decompressed. */
  skipped: SkippedEntry[];
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** Archives announce themselves; don't trust the extension alone. */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return ZIP_MAGIC.every((b, i) => bytes[i] === b);
}

/** Entries no import should ever consider: directories and archiver metadata. */
function isIgnorableEntry(path: string): boolean {
  return (
    path.endsWith('/') ||
    path.startsWith('__MACOSX/') ||
    path.split('/').some((seg) => seg.startsWith('.'))
  );
}

function isMarkdown(path: string): boolean {
  return /\.mdx?$/i.test(path);
}

function depth(path: string): number {
  return path.split('/').length;
}

/**
 * Pick the entry that carries the skill: a `SKILL.md` if there is one, else the
 * shallowest markdown file. Ties break on the shorter path, so a top-level
 * document always wins over a nested one.
 */
export function chooseSkillEntry(paths: string[]): string | undefined {
  const markdown = paths.filter((p) => !isIgnorableEntry(p) && isMarkdown(p));
  if (markdown.length === 0) return undefined;
  const named = markdown.filter((p) => /(^|\/)skill\.mdx?$/i.test(p));
  const pool = named.length > 0 ? named : markdown;
  return [...pool].sort((a, b) => depth(a) - depth(b) || a.length - b.length || a.localeCompare(b))[0];
}

/**
 * Split YAML front matter off a markdown document.
 *
 * Deliberately not a YAML parser: a skill's front matter is a flat block of
 * `key: value` lines, and pulling in a YAML dependency to read two of them
 * would be a bigger decision than this feature needs.
 */
export function parseFrontMatter(text: string): {
  meta: Record<string, string>;
  body: string;
} {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of match[1]!.split('\n')) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const value = kv[2]!.trim().replace(/^['"]|['"]$/g, '');
    if (value) meta[kv[1]!.toLowerCase()] = value;
  }
  return { meta, body: text.slice(match[0].length) };
}

/** First markdown heading, used when front matter carries no name. */
function firstHeading(body: string): string | undefined {
  return /^#{1,3}\s+(.+)$/m.exec(body)?.[1];
}

/** First non-empty prose line, used when front matter carries no description. */
function firstParagraph(body: string): string | undefined {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('---')) continue;
    return trimmed;
  }
  return undefined;
}

function nameFromFilename(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.mdx?$/i, '').replace(/[-_]+/g, ' ').trim() || 'Imported skill';
}

/** A `type:` in front matter only wins when it names one of ours. */
function typeFromMeta(raw: string | undefined): SkillType {
  const candidates: SkillType[] = ['rubric', 'convention', 'security', 'custom'];
  const found = candidates.find((c) => c === raw?.toLowerCase());
  return found ?? DEFAULT_SKILL_TYPE;
}

/** Build the preview from one markdown document. */
function previewFromMarkdown(
  text: string,
  sourceFile: string,
  skipped: SkippedEntry[],
): SkillImportPreview {
  const { meta, body: rawBody } = parseFrontMatter(text);
  const body = sanitizeSkillBody(rawBody);
  if (body.length === 0) throw new ValidationError('The imported file has no skill body');

  const name = sanitizeSkillName(meta.name ?? firstHeading(body) ?? nameFromFilename(sourceFile));
  const description = sanitizeSkillDescription(meta.description ?? firstParagraph(body) ?? '');

  return { name, description, type: typeFromMeta(meta.type), body, source_file: sourceFile, skipped };
}

/**
 * Parse an uploaded skill file into a preview.
 *
 * `bytes` is the raw upload. A zip is recognised by its magic number, so a
 * mislabelled extension changes nothing about how it is handled.
 */
export function parseSkillUpload(filename: string, bytes: Uint8Array): SkillImportPreview {
  if (looksLikeZip(bytes)) return parseArchive(filename, bytes);

  if (bytes.byteLength > IMPORT_MAX_BODY_BYTES) {
    throw new ValidationError(
      `Skill file is larger than ${IMPORT_MAX_BODY_BYTES} bytes`,
    );
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return previewFromMarkdown(text, filename, []);
}

/**
 * `unzipSync`, with fflate's failures turned into a 422 instead of a 500.
 *
 * The bytes are an upload, so "this is not a valid archive" is an ordinary
 * client mistake, not a server fault — and fflate signals it by throwing a
 * plain `Error` (`invalid zip data`, `unexpected EOF`, …) from deep inside.
 */
function readArchive(
  bytes: Uint8Array,
  options: Parameters<typeof unzipSync>[1],
): Record<string, Uint8Array> {
  try {
    return unzipSync(bytes, options);
  } catch {
    // fflate's own wording ("invalid distance too far back") describes its
    // internals, not the caller's mistake, so it stays out of the response.
    throw new ValidationError('Could not read the archive — it is not a valid zip file');
  }
}

function parseArchive(filename: string, bytes: Uint8Array): SkillImportPreview {
  // Pass 1: read the central directory only. The filter returns false for every
  // entry, so nothing is inflated — we just learn what is in there.
  //
  // fflate throws a plain Error on a truncated or malformed archive ("invalid
  // zip data"). Uncaught, that surfaces as a 500 on what is simply a bad
  // upload, so every call into fflate is translated to a ValidationError (422),
  // the same answer every other rejected upload gets.
  const sizes = new Map<string, number>();
  readArchive(bytes, {
    filter: (file) => {
      if (sizes.size < IMPORT_MAX_ENTRIES) sizes.set(file.name, file.originalSize ?? 0);
      return false;
    },
  });

  const paths = [...sizes.keys()];
  if (paths.length === 0) throw new ValidationError('The archive is empty');

  const chosen = chooseSkillEntry(paths);
  if (!chosen) throw new ValidationError('No markdown file found in the archive');

  const chosenSize = sizes.get(chosen) ?? 0;
  if (chosenSize > IMPORT_MAX_BODY_BYTES) {
    throw new ValidationError(
      `${chosen} is larger than ${IMPORT_MAX_BODY_BYTES} bytes once decompressed`,
    );
  }

  const skipped: SkippedEntry[] = paths
    .filter((p) => p !== chosen && !isIgnorableEntry(p))
    .map((p) => ({
      path: p,
      bytes: sizes.get(p) ?? 0,
      reason: isMarkdown(p)
        ? ('additional-markdown' as const)
        : ((sizes.get(p) ?? 0) > IMPORT_MAX_BODY_BYTES
            ? ('too-large' as const)
            : ('not-markdown' as const)),
    }));

  // Pass 2: inflate exactly one entry.
  const unzipped = readArchive(bytes, { filter: (file) => file.name === chosen });
  const raw = unzipped[chosen];
  if (!raw) throw new ValidationError(`Could not read ${chosen} from the archive`);

  const preview = previewFromMarkdown(
    new TextDecoder('utf-8', { fatal: false }).decode(raw),
    chosen,
    skipped,
  );
  // An archive named after the skill is a better default than "SKILL".
  if (/^skill$/i.test(preview.name)) {
    preview.name = sanitizeSkillName(nameFromFilename(filename.replace(/\.zip$/i, '')));
  }
  return preview;
}
