import type { Permission } from './permissions';
import type { Role } from './roles';

const rolePermissions: Record<Role, ReadonlySet<Permission>> = {
  guest: new Set<Permission>(['catalog:read']),
  customer: new Set<Permission>(['catalog:read', 'orders:read']),
  seller: new Set<Permission>(['catalog:read', 'catalog:write', 'orders:read', 'orders:write', 'inventory:read', 'inventory:write']),
  reseller: new Set<Permission>(['catalog:read', 'orders:read']),
  admin: new Set<Permission>([
    'admin:access',
    'catalog:read',
    'catalog:write',
    'orders:read',
    'orders:write',
    'inventory:read',
    'inventory:write',
    'users:read',
    'users:write',
  ]),
};

export function can(role: Role, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}

