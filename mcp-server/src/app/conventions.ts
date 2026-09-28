import type { ServerDeps } from '../ports/api-client.js';
import { resolveRepo } from './resolve.js';
import { toToolError, ToolError } from './errors.js';
import { truncate, sanitizeUntrusted, UNTRUSTED_NOTICE, type ConventionsOut } from './present.js';

const MAX_RULE = 240;
const MAX_FILE = 200;
const MAX_ITEMS = 50;

/** `devdigest_get_conventions`: `accepted` candidates by default, `status` widens the
 * filter. Caps at 50 items, with `total`/`truncated` reporting the rest. */
export async function getConventions(
  deps: ServerDeps,
  input: { repo: string; status?: 'accepted' | 'pending' | 'all' },
): Promise<ConventionsOut> {
  try {
    const repo = await resolveRepo(deps.api, input.repo);
    const status = input.status ?? 'accepted';
    const page = await deps.api.listConventions(repo.id);
    const filtered =
      status === 'all' ? page.candidates : page.candidates.filter((c) => c.status === status);

    const total = filtered.length;
    const truncated = total > MAX_ITEMS;
    const conventions = filtered.slice(0, MAX_ITEMS).map((c) => ({
      category: c.category,
      rule: truncate(sanitizeUntrusted(c.rule), MAX_RULE),
      file: truncate(sanitizeUntrusted(c.evidence_path), MAX_FILE),
      line: c.evidence_line,
    }));

    return {
      notice: UNTRUSTED_NOTICE,
      repo: repo.full_name,
      conventions,
      total,
      truncated,
      message:
        conventions.length === 0
          ? `No ${status} conventions for ${repo.full_name} — extract and accept them in DevDigest (Conventions), then retry.`
          : null,
    };
  } catch (err) {
    if (err instanceof ToolError) throw err;
    throw toToolError(err, deps.apiUrl);
  }
}
