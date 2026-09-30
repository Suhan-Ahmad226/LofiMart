import { describe, expect, it } from 'vitest';
import { classifyLoginIdentifier } from '@/features/auth/services/identity';

describe('classifyLoginIdentifier', () => {
  it('classifies a plain email', () => {
    expect(classifyLoginIdentifier('customer@example.com')).toEqual({
      type: 'email',
      value: 'customer@example.com',
    });
  });

  it('normalizes email case and surrounding whitespace', () => {
    expect(classifyLoginIdentifier('  Customer@Example.COM  ')).toEqual({
      type: 'email',
      value: 'customer@example.com',
    });
  });

  it('classifies a local 11-digit BD phone', () => {
    expect(classifyLoginIdentifier('01712345678')).toEqual({
      type: 'phone',
      value: '01712345678',
    });
  });

  it('classifies a +88-prefixed BD phone', () => {
    expect(classifyLoginIdentifier('+8801712345678')).toEqual({
      type: 'phone',
      value: '01712345678',
    });
  });

  it('classifies an 88-prefixed BD phone', () => {
    expect(classifyLoginIdentifier('8801712345678')).toEqual({
      type: 'phone',
      value: '01712345678',
    });
  });

  it('normalizes phone whitespace', () => {
    expect(classifyLoginIdentifier(' 017 123 456 78 ')).toEqual({
      type: 'phone',
      value: '01712345678',
    });
  });

  it('rejects a too-short numeric identifier', () => {
    expect(classifyLoginIdentifier('1712345678')).toEqual({ type: 'invalid' });
  });

  it('rejects a non-Bangladeshi phone like 01123456789', () => {
    expect(classifyLoginIdentifier('01123456789')).toEqual({ type: 'invalid' });
  });

  it('rejects free text without an email shape', () => {
    expect(classifyLoginIdentifier('hello')).toEqual({ type: 'invalid' });
  });

  it('rejects a bare number', () => {
    expect(classifyLoginIdentifier('123')).toEqual({ type: 'invalid' });
  });

  it('rejects empty and blank input', () => {
    expect(classifyLoginIdentifier('')).toEqual({ type: 'invalid' });
    expect(classifyLoginIdentifier('   ')).toEqual({ type: 'invalid' });
  });

  it('rejects non-string input', () => {
    expect(classifyLoginIdentifier(null)).toEqual({ type: 'invalid' });
    expect(classifyLoginIdentifier(42)).toEqual({ type: 'invalid' });
  });
});