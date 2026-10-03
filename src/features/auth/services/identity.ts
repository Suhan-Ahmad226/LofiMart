export const BD_PHONE_REGEX = /^(?:\+?88)?01[3-9]\d{8}$/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

/**
 * Canonical email shape for LofiMart identity matching.
 *
 * Deliberately not an RFC 5322 implementation: it only rejects what cannot be
 * a deliverable address (missing parts, no top level domain, stray or doubled
 * dots) while allowing every real-world form such as `user+shop@gmail.com`.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hasValidEmailParts(email: string): boolean {
  const [local, domain] = email.split('@');

  // No empty segments and no consecutive dots on either side of the @.
  if (!local || !domain) return false;
  if (local.includes('..') || domain.includes('..')) return false;
  if (local.startsWith('.') || local.endsWith('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  // A domain label cannot begin or end with a hyphen.
  if (domain.split('.').some((label) => !label || label.startsWith('-') || label.endsWith('-'))) return false;

  return true;
}

/** A deliberately non-restrictive validation check for canonical email input. */
export function isValidEmail(value: unknown): value is string {
  const email = normalizeEmail(value);
  return Boolean(email && EMAIL_SHAPE.test(email) && hasValidEmailParts(email));
}

export function normalizeBdPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const digits = value.replace(/\D+/g, '');

  if (digits.length === 11 && digits.startsWith('01')) {
    return BD_PHONE_REGEX.test(digits) ? digits : null;
  }

  if (digits.length === 13 && digits.startsWith('880')) {
    const local = `0${digits.slice(3)}`;
    return BD_PHONE_REGEX.test(local) ? local : null;
  }

  return null;
}

export function isBdPhone(value: unknown): value is string {
  return normalizeBdPhone(value) !== null;
}

export type LoginIdentifier =
  | { type: 'email'; value: string }
  | { type: 'phone'; value: string }
  | { type: 'invalid' };

export function classifyLoginIdentifier(input: unknown): LoginIdentifier {
  if (typeof input !== 'string') {
    return { type: 'invalid' };
  }

  const phone = normalizeBdPhone(input);
  if (phone) {
    return { type: 'phone', value: phone };
  }

  const email = normalizeEmail(input);
  if (email && isValidEmail(email)) {
    return { type: 'email', value: email };
  }

  return { type: 'invalid' };
}
