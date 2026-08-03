import { describe, it, expect } from 'vitest';
import { cn, formatPrice } from '@/lib/utils';

describe('cn', () => {
  it('merges class names', () => {
    const result = cn('text-red-500', 'text-blue-500');
    expect(result).toBe('text-blue-500');
  });

  it('handles conditional classes', () => {
    const result = cn('base', false && 'hidden', 'extra');
    expect(result).toContain('base');
    expect(result).toContain('extra');
    expect(result).not.toContain('hidden');
  });

  it('handles undefined and null', () => {
    const result = cn('base', undefined, null);
    expect(result).toBe('base');
  });
});

describe('formatPrice', () => {
  it('formats zero', () => {
    const result = formatPrice(0);
    expect(result).toContain('0');
  });

  it('formats positive numbers', () => {
    const result = formatPrice(1500);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('formats decimal numbers', () => {
    const result = formatPrice(99.99);
    expect(result).toBeTruthy();
  });
});
