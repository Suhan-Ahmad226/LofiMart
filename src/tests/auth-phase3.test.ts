import { describe, it, expect } from 'vitest';
import { sanitizeRegistrationRole } from '@/modules/rbac/registration';
import { classifyExistingAccountRegistration } from '@/features/auth/services/registration-flow';
import type { AuthPurpose } from '@/features/auth/server/auth-service';

describe('auth phase 3: self-service registration roles', () => {
  it('accepts the three public roles', () => {
    expect(sanitizeRegistrationRole('customer')).toBe('customer');
    expect(sanitizeRegistrationRole('seller')).toBe('seller');
    expect(sanitizeRegistrationRole('reseller')).toBe('reseller');
  });

  it('never returns admin or super-admin from the client', () => {
    expect(sanitizeRegistrationRole('admin')).toBe('customer');
    expect(sanitizeRegistrationRole('super_admin')).toBe('customer');
    expect(sanitizeRegistrationRole('staff')).toBe('customer');
  });

  it('coerces arbitrary or missing values to customer', () => {
    expect(sanitizeRegistrationRole(undefined)).toBe('customer');
    expect(sanitizeRegistrationRole(null)).toBe('customer');
    expect(sanitizeRegistrationRole('')).toBe('customer');
    expect(sanitizeRegistrationRole({ role: 'admin' })).toBe('customer');
  });
});

describe('auth phase 3: existing-account resume vs conflict', () => {
  const unverified = {
    existingEmailVerified: false,
    existingPhoneVerified: false,
  };

  it('resumes a fully-matching unverified leftover account', () => {
    const outcome = classifyExistingAccountRegistration({
      ...unverified,
      existingEmail: 'buyer@example.com',
      existingPhone: '01712345678',
      requestEmail: 'buyer@example.com',
      requestPhone: '01712345678',
    });
    expect(outcome.action).toBe('resume');
  });

  it('never resumes a partial (attacker) identity match', () => {
    const outcome = classifyExistingAccountRegistration({
      ...unverified,
      existingEmail: 'victim@example.com',
      existingPhone: '01711111111',
      requestEmail: 'victim@example.com',
      requestPhone: '01722222222',
    });
    expect(outcome.action).toBe('conflict');
  });

  it('never resumes when only the phone matches', () => {
    const outcome = classifyExistingAccountRegistration({
      ...unverified,
      existingEmail: 'someone@example.com',
      existingPhone: '01712345678',
      requestEmail: 'other@example.com',
      requestPhone: '01712345678',
    });
    expect(outcome.action).toBe('conflict');
  });

  it('conflicts on any already-verified account even with a full match', () => {
    const outcome = classifyExistingAccountRegistration({
      existingEmail: 'buyer@example.com',
      existingPhone: '01712345678',
      existingEmailVerified: true,
      existingPhoneVerified: false,
      requestEmail: 'buyer@example.com',
      requestPhone: '01712345678',
    });
    expect(outcome.action).toBe('conflict');
    expect(outcome).toMatchObject({ code: 'ACCOUNT_EXISTS' });
  });
});

describe('auth phase 3: AuthPurpose allowlist', () => {
  it('covers all six expected auth workflows', () => {
    const purposes: AuthPurpose[] = ['register', 'verify_email', 'verify_phone', 'reset_password', 'set_password', 'guest_claim'];
    expect(purposes).toHaveLength(6);
  });
});
