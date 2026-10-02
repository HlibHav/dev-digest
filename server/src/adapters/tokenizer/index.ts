/**
 * tokenizer adapter — token counter for the repo-map budget search (T3).
 *
 * The repo-map renderer (pipeline/repo-map.ts) binary-searches the largest set
 * of symbols that fits a token budget; that loop calls `count()` ≤ ~13 times.
 *
 * Default impl: js-tiktoken `cl100k_base` (pure-JS, no natives). The encoder is
 * lazy-initialised (loading the BPE ranks is the heavy part) and any failure
 * falls back to the `ceil(chars / 4)` heuristic — the renderer must never throw.
 *
 * Scope: in-process. Two callers today — the repo-map budget search, and the
 * review executor, which counts the assembled skills block so the run trace can
 * show what the skills alone cost. Swappable in tests via a mock counter
 * (ContainerOverrides.tokenizer).
 */
import { getEncoding, type Tiktoken } from 'js-tiktoken';

export interface Tokenizer {
  count(text: string): number;
}

/** Heuristic fallback used before/instead of a real encoder. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Largest text (UTF-8 bytes) handed to the real encoder by `withByteCeiling`.
 * js-tiktoken's synchronous `encode()` can stall for minutes on pathological
 * input (a 1 MiB run of one character), blocking the event loop.
 */
export const TOKENIZER_BYTE_CEILING = 256 * 1024;

/**
 * Longest run of non-whitespace characters the real encoder may see. js-tiktoken's
 * `encode()` is roughly quadratic on a run with no break (16384 chars: 14 s;
 * 32768: 62 s), so the 256 KB byte ceiling alone does not bound the stall (SR-4).
 */
export const TOKENIZER_MAX_RUN = 256;
const LONG_RUN = new RegExp(`\\S{${TOKENIZER_MAX_RUN + 1},}`);

/**
 * Decorator: above the byte ceiling, or when the text holds a non-whitespace
 * run longer than `TOKENIZER_MAX_RUN`, the count is the estimate
 * `ceil(bytes / 4)` and the wrapped counter is never called. Used by Project
 * Context only; `container.tokenizer` itself is unchanged.
 */
export function withByteCeiling(inner: Tokenizer, ceilingBytes = TOKENIZER_BYTE_CEILING): Tokenizer {
  return {
    count(text: string): number {
      const bytes = Buffer.byteLength(text, 'utf8');
      return bytes > ceilingBytes || LONG_RUN.test(text) ? Math.ceil(bytes / 4) : inner.count(text);
    },
  };
}

export class TiktokenTokenizer implements Tokenizer {
  private enc?: Tiktoken;
  private broken = false;

  count(text: string): number {
    if (this.broken) return approxTokens(text);
    try {
      this.enc ??= getEncoding('cl100k_base');
      return this.enc.encode(text).length;
    } catch {
      // BPE load failed once — don't retry per call; stick to the heuristic.
      this.broken = true;
      return approxTokens(text);
    }
  }
}
