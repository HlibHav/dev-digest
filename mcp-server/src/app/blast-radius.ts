import type { BlastDegradedReason, BlastRadius } from '@devdigest/shared';
import type { ServerDeps } from '../ports/api-client.js';
import { resolveRepo, resolvePr } from './resolve.js';
import { toToolError, ToolError } from './errors.js';
import { truncate, sanitizeUntrusted, UNTRUSTED_NOTICE, type BlastRadiusOut } from './present.js';

// MCP-only caps (Contracts & data). The route's own caps (repo-intel's
// MAX_CALLERS_PER_SYMBOL, etc.) already ran server-side; these just keep the tool's JSON
// payload and each field small for an LLM client.
const MAX_SYMBOLS = 10;
const MAX_CALLERS_PER_SYMBOL = 8;
const MAX_ENDPOINTS_PER_SYMBOL = 5;
const MAX_CRONS_PER_SYMBOL = 5;
const MAX_FILE = 160;
const MAX_NAME = 80;
const MAX_ENDPOINT_OR_CRON = 100;
const MAX_SUMMARY = 200;

/** Sanitises untrusted text, then truncates to `max`. Reports whether the cap actually cut
 * something (sanitisation alone, stripping zero-width/control characters, doesn't count),
 * so the caller can set `truncated` per Resolved spec point 3. */
function cap(s: string, max: number): { value: string; cut: boolean } {
  const clean = sanitizeUntrusted(s);
  const value = truncate(clean, max);
  return { value, cut: value !== clean };
}

/** `devdigest_get_blast_radius`: resolves repo → PR, reads `GET /pulls/:id/blast` once, and
 * maps the API's map onto `BlastRadiusOut` — same content and order, capped and sanitised
 * for an MCP client (Contracts & data, AC9/AC17/AC18/AC24). */
export async function getBlastRadius(
  deps: ServerDeps,
  input: { repo: string; pr: number; files?: string[] },
): Promise<BlastRadiusOut> {
  try {
    const repo = await resolveRepo(deps.api, input.repo);
    const pr = await resolvePr(deps.api, repo, input.pr);
    const radius: BlastRadius = await deps.api.getBlastRadius(pr.id);

    const files = input.files;

    // A group is kept when any changed-symbol declaration with that name lives in a file
    // the caller asked about (Resolved spec point 4).
    const keepGroup = (symbolName: string): boolean => {
      if (!files || files.length === 0) return true;
      return radius.changed_symbols.some((s) => s.name === symbolName && files.includes(s.file));
    };

    let truncated = false;
    const keptGroups = radius.downstream.filter((group) => keepGroup(group.symbol));
    if (keptGroups.length > MAX_SYMBOLS) truncated = true;

    const downstream = keptGroups.slice(0, MAX_SYMBOLS).map((group) => {
      if (group.callers.length > MAX_CALLERS_PER_SYMBOL) truncated = true;
      if (group.endpoints_affected.length > MAX_ENDPOINTS_PER_SYMBOL) truncated = true;
      if (group.crons_affected.length > MAX_CRONS_PER_SYMBOL) truncated = true;

      const symbolCap = cap(group.symbol, MAX_NAME);
      if (symbolCap.cut) truncated = true;

      // Revision 5.1: a caller is `"<file>:<line> <name>"` (file capped 160, name capped 80,
      // both sanitised, joined after capping) — flattened from `{name,file,line}` to keep
      // `tools/list` under its byte cap.
      const callers = group.callers.slice(0, MAX_CALLERS_PER_SYMBOL).map((caller) => {
        const nameCap = cap(caller.name, MAX_NAME);
        const fileCap = cap(caller.file, MAX_FILE);
        if (nameCap.cut || fileCap.cut) truncated = true;
        return `${fileCap.value}:${caller.line} ${nameCap.value}`;
      });

      const endpoints = group.endpoints_affected.slice(0, MAX_ENDPOINTS_PER_SYMBOL).map((ep) => {
        const epCap = cap(ep, MAX_ENDPOINT_OR_CRON);
        if (epCap.cut) truncated = true;
        return epCap.value;
      });

      const crons = group.crons_affected.slice(0, MAX_CRONS_PER_SYMBOL).map((c) => {
        const cronCap = cap(c, MAX_ENDPOINT_OR_CRON);
        if (cronCap.cut) truncated = true;
        return cronCap.value;
      });

      return { symbol: symbolCap.value, callers, endpoints, crons };
    });

    const degraded = radius.degraded ?? false;
    const reason: BlastDegradedReason | null = radius.reason ?? null;

    const summaryCap = cap(radius.summary, MAX_SUMMARY);
    if (summaryCap.cut) truncated = true;

    // M7 whenever degraded, even with an empty map; M6 only when not degraded and the
    // (filtered, capped) downstream is empty (Resolved spec point 2).
    const message = degraded
      ? `The code index for ${repo.full_name} is incomplete (${reason}), so callers may be missing. Resync the repo in DevDigest, then retry.`
      : downstream.length === 0
        ? `No callers of the changed symbols were found for PR #${pr.number} in ${repo.full_name}.`
        : null;

    return {
      notice: UNTRUSTED_NOTICE,
      repo: repo.full_name,
      pr: pr.number,
      summary: summaryCap.value,
      degraded,
      reason,
      downstream,
      truncated,
      message,
    };
  } catch (err) {
    if (err instanceof ToolError) throw err;
    throw toToolError(err, deps.apiUrl);
  }
}
