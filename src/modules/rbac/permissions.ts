// Keep permissions intentionally coarse while scaffolding.
// We can split into finer-grained capabilities as modules mature.

export const permissions = [
  'catalog:read',
  'catalog:write',
  'orders:read',
  'orders:write',
  'inventory:read',
  'inventory:write',
  'users:read',
  'users:write',
  'admin:access',
] as const;

export type Permission = (typeof permissions)[number];

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (permissions as readonly string[]).includes(value);
}

