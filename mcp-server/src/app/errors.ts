import { ApiError } from '../ports/api-client.js';
import { sanitizeUntrusted } from './present.js';

/** The only error type a tool handler ever turns into an `isError` tool result. Every
 * `resolve*`/use-case function throws this with the exact E1-E12 wording from the plan. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

function cut(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

/** Maps a raw `ApiError` (or anything else the adapter can throw) onto E6/E8/E9, per AC9. A
 * `ToolError` that already reached here (from a use case) passes through unchanged. */
export function toToolError(err: unknown, apiUrl: string): ToolError {
  if (err instanceof ToolError) return err;
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return new ToolError('The DevDigest API allows 10 review runs per minute. Wait a minute, then retry.');
    }
    if (err.status === null) {
      return new ToolError(
        `DevDigest API is not reachable at ${apiUrl}. Start it (cd server && pnpm dev) or set DEVDIGEST_API_URL.`,
      );
    }
    return new ToolError(
      `DevDigest API error ${err.status} on ${err.method} ${err.path}: ${cut(sanitizeUntrusted(err.message), 200)}.`,
    );
  }
  return new ToolError(err instanceof Error ? err.message : String(err));
}
