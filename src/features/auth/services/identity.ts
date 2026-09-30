export const BD_PHONE_REGEX = /^(?:\+?88)?01[3-9]\d{8}$/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
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
  if (email && email.includes('@')) {
    return { type: 'email', value: email };
  }

  return { type: 'invalid' };
}