export const roles = ['guest', 'customer', 'seller', 'reseller', 'admin'] as const;

export type Role = (typeof roles)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (roles as readonly string[]).includes(value);
}

