import { describe, it, expect, vi } from 'vitest';
import {
  withByteCeiling,
  TOKENIZER_BYTE_CEILING,
  TOKENIZER_MAX_RUN,
  type Tokenizer,
} from '../src/adapters/tokenizer/index.js';

function spyCounter(): Tokenizer & { count: ReturnType<typeof vi.fn> } {
  return { count: vi.fn((t: string) => t.length) };
}

describe('withByteCeiling (SR-1)', () => {
  it('estimates ceil(bytes/4) above the ceiling without calling the counter', () => {
    const inner = spyCounter();
    const t = withByteCeiling(inner);
    const text = 'é'.repeat(TOKENIZER_BYTE_CEILING / 2 + 1); // 2 bytes each => ceiling + 2 bytes
    const bytes = Buffer.byteLength(text, 'utf8');
    expect(bytes).toBeGreaterThan(TOKENIZER_BYTE_CEILING);
    expect(t.count(text)).toBe(Math.ceil(bytes / 4));
    expect(inner.count).not.toHaveBeenCalled();
  });

  it('calls the counter at exactly the ceiling', () => {
    const inner = spyCounter();
    const t = withByteCeiling(inner);
    // Broken into short words: a single 256 KB run would now be estimated (SR-4).
    const text = `${'a'.repeat(63)} `.repeat(TOKENIZER_BYTE_CEILING / 64);
    expect(t.count(text)).toBe(text.length);
    expect(inner.count).toHaveBeenCalledTimes(1);
  });

  it('calls the counter below the ceiling', () => {
    const inner = spyCounter();
    expect(withByteCeiling(inner).count('hello')).toBe(5);
    expect(inner.count).toHaveBeenCalledWith('hello');
  });

  it('SR-4: a long run of non-whitespace is estimated, the counter is not called', () => {
    const inner = spyCounter();
    const text = 'a'.repeat(1000);
    expect(withByteCeiling(inner).count(text)).toBe(Math.ceil(1000 / 4));
    expect(inner.count).not.toHaveBeenCalled();
  });

  it('SR-4: a run at the limit, and normal multi-line text, still use the counter', () => {
    const inner = spyCounter();
    const t = withByteCeiling(inner);
    t.count('a'.repeat(TOKENIZER_MAX_RUN));
    t.count('# Title\n\nsome prose here\n' + 'word '.repeat(500));
    expect(inner.count).toHaveBeenCalledTimes(2);
  });
});
