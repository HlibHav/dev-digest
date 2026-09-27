import { describe, it, expect } from 'vitest';
import { sizeBucket, patchSizeLabel } from '../src/modules/pulls/size.js';

describe('sizeBucket', () => {
  it('buckets a large PR as L', () => {
    expect(sizeBucket(350, 120)).toBe('L');
  });

  it('buckets a medium PR as M', () => {
    expect(sizeBucket(150, 50)).toBe('M');
  });
});

describe('patchSizeLabel', () => {
  it('formats the patch size', () => {
    expect(patchSizeLabel('x'.repeat(1500))).toBe('1.5 kB');
  });
});
