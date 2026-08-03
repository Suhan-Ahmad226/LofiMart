import { describe, it, expect } from 'vitest';
import { copyText } from '@/lib/browser-actions';

describe('browser-actions', () => {
  it('exports copyText as function', () => {
    expect(typeof copyText).toBe('function');
  });
});
