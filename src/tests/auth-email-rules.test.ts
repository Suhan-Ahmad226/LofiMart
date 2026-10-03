import { describe, expect, it } from 'vitest';
import { isValidEmail, normalizeEmail } from '@/features/auth/services/identity';

/**
 * The canonical identity rules every entry point depends on: what counts as a
 * valid address, and what one person looks like after normalisation.
 */

describe('email normalization', () => {
  it('trims and lowercases to one canonical form', () => {
    expect(normalizeEmail('  USER@GMAIL.COM  ')).toBe('user@gmail.com');
    expect(normalizeEmail('User@Gmail.Com')).toBe('user@gmail.com');
    expect(normalizeEmail(' user@gmail.com')).toBe('user@gmail.com');
    expect(normalizeEmail('\tuser@gmail.com\n')).toBe('user@gmail.com');
  });

  it('rejects values that are not usable addresses', () => {
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });

  it('maps every casing of one address to the same identity', () => {
    const forms = ['user@gmail.com', 'USER@GMAIL.COM', 'User@Gmail.Com', ' user@gmail.com '];
    const canonical = new Set(forms.map((form) => normalizeEmail(form)));

    expect(canonical.size).toBe(1);
    expect([...canonical][0]).toBe('user@gmail.com');
  });
});

describe('email validation', () => {
  it('accepts real-world addresses', () => {
    expect(isValidEmail('user@gmail.com')).toBe(true);
    expect(isValidEmail('user.name@gmail.com')).toBe(true);
    expect(isValidEmail('user+shop@gmail.com')).toBe(true);
    expect(isValidEmail('user_name@sub.domain.co')).toBe(true);
    expect(isValidEmail('  USER@GMAIL.COM  ')).toBe(true);
  });

  it('rejects the documented invalid shapes', () => {
    expect(isValidEmail('abc')).toBe(false);
    expect(isValidEmail('abc@')).toBe(false);
    expect(isValidEmail('abc@gmail')).toBe(false);
    expect(isValidEmail('@gmail.com')).toBe(false);
    expect(isValidEmail('abc..def@gmail.com')).toBe(false);
    expect(isValidEmail('abc.@gmail.com')).toBe(false);
    expect(isValidEmail('.abc@gmail.com')).toBe(false);
    expect(isValidEmail('abc@gmail..com')).toBe(false);
    expect(isValidEmail('abc@-gmail.com')).toBe(false);
    expect(isValidEmail('abc user@gmail.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('   ')).toBe(false);
  });
});