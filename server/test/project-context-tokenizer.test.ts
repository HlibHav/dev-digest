import { describe, it, expect, vi } from 'vitest';
import {
  withByteCeiling,
  TOKENIZER_BYTE_CEILING,
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
    const text = 'a'.repeat(TOKENIZER_BYTE_CEILING);
    expect(t.count(text)).toBe(text.length);
    expect(inner.count).toHaveBeenCalledTimes(1);
  });

  it('calls the counter below the ceiling', () => {
    const inner = spyCounter();
    expect(withByteCeiling(inner).count('hello')).toBe(5);
    expect(inner.count).toHaveBeenCalledWith('hello');
  });
});
