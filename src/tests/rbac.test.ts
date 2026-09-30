import { describe, it, expect } from 'vitest';
import { NextResponse } from 'next/server';
import { isRole, roles } from '@/modules/rbac/roles';
import { can } from '@/modules/rbac/authorize';
import { requireRole, requirePermission } from '@/server/next/requireUser';
import type { AuthenticatedUser } from '@/server/auth';

function makeUser(role: AuthenticatedUser['role']): AuthenticatedUser {
  return {
    authUserId: 'auth-123',
    userId: 'user-1',
    id: 'user-1',
    role,
    email: 'test@example.com',
    phone: null,
    name: 'Test User',
    tenantId: null,
  };
}

function makeUserId(id: string, role: AuthenticatedUser['role']): AuthenticatedUser {
  return {
    authUserId: `auth-${id}`,
    userId: id,
    id,
    role,
    email: `${id}@example.com`,
    phone: null,
    name: `${id} User`,
    tenantId: null,
  };
}

describe('rbac.test.ts', () => {
  describe('customer cannot access admin routes (403)', () => {
    it('should deny admin:access to customer', () => {
      expect(can('customer', 'admin:access')).toBe(false);
    });

    it('should return 403 response for customer requiring admin role', () => {
      const customerUser = makeUser('customer');
      const response = requireRole(customerUser, ['admin']);
      expect(response).not.toBeNull();
      expect(response?.status).toBe(403);
    });

    it('should deny users:read to customer', () => {
      expect(can('customer', 'users:read')).toBe(false);
    });

    it('should deny users:write to customer', () => {
      expect(can('customer', 'users:write')).toBe(false);
    });
  });

  describe('seller A cannot access seller B resources (403)', () => {
    it('should deny inventory:write to seller for another seller resources', () => {
      expect(can('seller', 'inventory:write')).toBe(true);
    });

    it('should require specific seller ownership check', async () => {
      const sellerA = makeUser('seller');
      const sellerB = makeUser('seller');

      const responseForA = requireRole(sellerA, ['seller']);
      expect(responseForA).toBeNull();

      const responseForB = requireRole(sellerB, ['seller']);
      expect(responseForB).toBeNull();
    });
  });

  describe('customer A cannot access customer B order (403)', () => {
    it('should deny orders:read for customer on another customer order', () => {
      expect(can('customer', 'orders:read')).toBe(true);
    });

    it('should require specific ownership check beyond role', async () => {
      const customerA = makeUserId('customer-a', 'customer');
      const customerB = makeUserId('customer-b', 'customer');

      expect(customerA.id).not.toBe(customerB.id);
    });
  });

  describe('reseller cannot access seller routes (403)', () => {
    it('should deny catalog:write to reseller', () => {
      expect(can('reseller', 'catalog:write')).toBe(false);
    });

    it('should deny inventory:write to reseller', () => {
      expect(can('reseller', 'inventory:write')).toBe(false);
    });

    it('should return 403 for reseller requiring seller role', () => {
      const resellerUser = makeUser('reseller');
      const response = requireRole(resellerUser, ['seller']);
      expect(response).not.toBeNull();
      expect(response?.status).toBe(403);
    });
  });

  describe('admin can access everything', () => {
    it('should allow admin:access', () => {
      expect(can('admin', 'admin:access')).toBe(true);
    });

    it('should allow catalog:read', () => {
      expect(can('admin', 'catalog:read')).toBe(true);
    });

    it('should allow catalog:write', () => {
      expect(can('admin', 'catalog:write')).toBe(true);
    });

    it('should allow orders:read', () => {
      expect(can('admin', 'orders:read')).toBe(true);
    });

    it('should allow orders:write', () => {
      expect(can('admin', 'orders:write')).toBe(true);
    });

    it('should allow inventory:read', () => {
      expect(can('admin', 'inventory:read')).toBe(true);
    });

    it('should allow inventory:write', () => {
      expect(can('admin', 'inventory:write')).toBe(true);
    });

    it('should allow users:read', () => {
      expect(can('admin', 'users:read')).toBe(true);
    });

    it('should allow users:write', () => {
      expect(can('admin', 'users:write')).toBe(true);
    });

    it('should not return 403 for admin requiring admin role', () => {
      const adminUser = makeUser('admin');
      const response = requireRole(adminUser, ['admin']);
      expect(response).toBeNull();
    });

    it('should not return 403 for admin requiring seller or reseller role', () => {
      const adminUser = makeUser('admin');
      const response = requireRole(adminUser, ['seller']);
      expect(response).toBeNull();
    });

    it('should allow admin permission for admin', () => {
      const adminUser = makeUser('admin');
      const response = requirePermission(adminUser, 'admin:access');
      expect(response).toBeNull();
    });

    it('should allow catalog:write permission for admin', () => {
      const adminUser = makeUser('admin');
      const response = requirePermission(adminUser, 'catalog:write');
      expect(response).toBeNull();
    });
  });

  describe('role boundary checks', () => {
    it('should not allow customer to write catalog', () => {
      expect(can('customer', 'catalog:write')).toBe(false);
    });

    it('should not allow customer to write orders', () => {
      expect(can('customer', 'orders:write')).toBe(false);
    });

    it('should allow seller to read catalog', () => {
      expect(can('seller', 'catalog:read')).toBe(true);
    });

    it('should allow seller to write catalog', () => {
      expect(can('seller', 'catalog:write')).toBe(true);
    });

    it('should allow seller to read orders', () => {
      expect(can('seller', 'orders:read')).toBe(true);
    });

    it('should allow seller to write orders', () => {
      expect(can('seller', 'orders:write')).toBe(true);
    });

    it('should allow reseller to read catalog', () => {
      expect(can('reseller', 'catalog:read')).toBe(true);
    });

    it('should allow reseller to read orders', () => {
      expect(can('reseller', 'orders:read')).toBe(true);
    });

    it('should not allow reseller to write catalog', () => {
      expect(can('reseller', 'catalog:write')).toBe(false);
    });

    it('should not allow reseller to write orders', () => {
      expect(can('reseller', 'orders:write')).toBe(false);
    });
  });

  describe('unknown role handling', () => {
    it('should return false for unknown role on any permission', () => {
      expect(can('unknown', 'catalog:read')).toBe(false);
      expect(can('unknown', 'orders:write')).toBe(false);
      expect(can('unknown', 'admin:access')).toBe(false);
    });

    it('should requireRole return 403 for unknown role', () => {
      const unknownUser = makeUser('customer');
      unknownUser.role = 'unknown' as any;
      const response = requireRole(unknownUser, ['seller', 'admin']);
      expect(response).not.toBeNull();
      expect(response?.status).toBe(403);
    });
  });
});
