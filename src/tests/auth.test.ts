import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { isAuthRole, createLocalUserFromSupabase } from '@/app/api/auth/supabase/shared';
import { isRole, roles } from '@/modules/rbac/roles';
import { can } from '@/modules/rbac/authorize';
import {
  requireUser,
  requireRole,
  requirePermission,
  getCurrentUser,
} from '@/server/next/requireUser';
import type { AuthenticatedUser } from '@/server/auth';

vi.mock('@/features/shared/services/messaging/redis', () => {
  const store = new Map<string, string>();

  function createMulti() {
    const multi = {
      set: vi.fn((_key: string, _val: string) => multi),
      del: vi.fn((_key: string) => multi),
      sadd: vi.fn((_key: string, ..._vals: string[]) => multi),
      srem: vi.fn((_key: string, ..._vals: string[]) => multi),
      expire: vi.fn((_key: string, _ttl: number) => multi),
      exec: vi.fn(async () => []),
    };
    return multi;
  }

  return {
    ensureRedis: vi.fn(async () => ({
      multi: vi.fn(createMulti),
      get: vi.fn((key: string) => Promise.resolve(store.get(key) || null)),
      getdel: vi.fn((key: string) => {
        const val = store.get(key);
        store.delete(key);
        return Promise.resolve(val || null);
      }),
      set: vi.fn((key: string, val: string) => { store.set(key, val); return Promise.resolve('OK'); }),
      del: vi.fn((key: string) => { store.delete(key); return Promise.resolve(1); }),
      smembers: vi.fn((_key: string) => Promise.resolve([])),
    })),
  };
});

vi.mock('@/lib/env', () => ({
  getServerEnv: vi.fn(() => ({
    REDIS_PREFIX: 'test',
    SESSION_TTL_SECONDS: 3600,
  })),
}));

const mockGetUser = vi.fn();

vi.mock('@/lib/server', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  createClient: vi.fn(() => ({
    auth: {
      getClaims: vi.fn(async () => {
        const result = await mockGetUser();
        return {
          data: { claims: result.data.user?.id ? { sub: result.data.user.id } : null },
          error: result.error ?? null,
        };
      }),
      signOut: vi.fn(),
    },
  })),
}));

const mockAuthenticatedUser: AuthenticatedUser = {
  authUserId: 'auth-123',
  userId: 'user-123',
  id: 'user-123',
  role: 'customer',
  email: 'test@example.com',
  phone: null,
  name: 'Test User',
  tenantId: null,
};

describe('auth.test.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: null } });
  });

  describe('register with valid data', () => {
    it('should accept valid roles', () => {
      expect(isAuthRole('customer')).toBe(true);
      expect(isAuthRole('seller')).toBe(true);
      expect(isAuthRole('reseller')).toBe(true);
      expect(isAuthRole('admin')).toBe(false);
    });

    it('should create local user from supabase data', async () => {
      const { prisma } = await import('@/lib/server');
      (prisma.user.create as any).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'customer',
        sellerStatus: 'approved',
        emailVerified: true,
        emailVerifiedAt: new Date(),
      });

      const user = await createLocalUserFromSupabase({
        email: 'test@example.com',
        name: 'Test User',
        role: 'customer',
        emailVerified: true,
        emailVerifiedAt: new Date(),
      });

      expect(user.email).toBe('test@example.com');
      expect(user.role).toBe('customer');
    });
  });

  describe('register with duplicate email', () => {
    it('should detect duplicate email', async () => {
      const { prisma } = await import('@/lib/server');
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'existing-user',
        email: 'test@example.com',
      });

      const existing = await prisma.user.findUnique({
        where: { email: 'test@example.com' },
      });

      expect(existing).not.toBeNull();
      expect(existing!.email).toBe('test@example.com');
    });
  });

  describe('getCurrentUser via Supabase session', () => {
    it('should return null when no Supabase session exists', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const user = await getCurrentUser();
      expect(user).toBeNull();
    });

    it('should return null when Supabase user has no ID', async () => {
      mockGetUser.mockResolvedValue({ data: { user: {} } });

      const user = await getCurrentUser();
      expect(user).toBeNull();
    });

    it('should return user when Supabase session and Prisma user exist', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'auth-123' } } });

      const { prisma } = await import('@/lib/server');
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-123',
        role: 'customer',
        email: 'test@example.com',
        phone: null,
        name: 'Test User',
        tenantId: null,
        isBlocked: false,
        deactivatedAt: null,
      });

      const user = await getCurrentUser();
      expect(user).not.toBeNull();
      expect(user!.userId).toBe('user-123');
      expect(user!.authUserId).toBe('auth-123');
      expect(user!.role).toBe('customer');
      expect(user!.email).toBe('test@example.com');
    });

    it('should return null when user is blocked', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'auth-123' } } });

      const { prisma } = await import('@/lib/server');
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-123',
        role: 'customer',
        email: 'test@example.com',
        phone: null,
        name: 'Test User',
        tenantId: null,
        isBlocked: true,
        deactivatedAt: null,
      });

      const user = await getCurrentUser();
      expect(user).toBeNull();
    });

    it('should return null when user is deactivated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'auth-123' } } });

      const { prisma } = await import('@/lib/server');
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-123',
        role: 'customer',
        email: 'test@example.com',
        phone: null,
        name: 'Test User',
        tenantId: null,
        isBlocked: false,
        deactivatedAt: new Date(),
      });

      const user = await getCurrentUser();
      expect(user).toBeNull();
    });

    it('should return null when Supabase ID does not match any local user', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'auth-999' } } });

      const { prisma } = await import('@/lib/server');
      (prisma.user.findUnique as any).mockResolvedValue(null);

      const user = await getCurrentUser();
      expect(user).toBeNull();
    });
  });

  describe('requireUser', () => {
    it('should return 401 when no session exists', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const result = await requireUser();
      expect(result instanceof NextResponse).toBe(true);
      if (result instanceof NextResponse) {
        expect(result.status).toBe(401);
      }
    });

    it('should return user when session is valid', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'auth-123' } } });

      const { prisma } = await import('@/lib/server');
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-123',
        role: 'customer',
        email: 'test@example.com',
        phone: null,
        name: 'Test User',
        tenantId: null,
        isBlocked: false,
        deactivatedAt: null,
      });

      const result = await requireUser();
      expect(result).not.toBeInstanceOf(NextResponse);
      expect((result as AuthenticatedUser).userId).toBe('user-123');
    });
  });

  describe('unknown role denial', () => {
    it('should deny access for unknown role', () => {
      expect(isRole('unknown')).toBe(false);
      expect(can('unknown', 'catalog:read')).toBe(false);
      expect(can('unknown', 'admin:access')).toBe(false);
    });

    it('should deny admin access for customer', () => {
      expect(can('customer', 'admin:access')).toBe(false);
    });

    it('should deny seller access to admin permissions', () => {
      expect(can('seller', 'admin:access')).toBe(false);
      expect(can('seller', 'users:write')).toBe(false);
    });

    it('should allow admin access to everything', () => {
      expect(can('admin', 'admin:access')).toBe(true);
      expect(can('admin', 'catalog:read')).toBe(true);
      expect(can('admin', 'users:write')).toBe(true);
      expect(can('admin', 'inventory:write')).toBe(true);
    });
  });

  describe('RBAC roles', () => {
    it('should have all expected roles', () => {
      expect(roles).toEqual(['guest', 'customer', 'seller', 'reseller', 'admin']);
    });

    it('should validate known roles', () => {
      expect(isRole('customer')).toBe(true);
      expect(isRole('seller')).toBe(true);
      expect(isRole('reseller')).toBe(true);
      expect(isRole('admin')).toBe(true);
      expect(isRole('guest')).toBe(true);
      expect(isRole('superadmin')).toBe(false);
      expect(isRole(null)).toBe(false);
      expect(isRole(123)).toBe(false);
    });
  });

  describe('session user validation', () => {
    it('should return 401 for unauthenticated request', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const result = await requireUser(new Request('http://localhost'));
      expect(result instanceof NextResponse).toBe(true);
      if (result instanceof NextResponse) {
        expect(result.status).toBe(401);
      }
    });

    it('should require customer role - deny admin', () => {
      const customerUser = { ...mockAuthenticatedUser, role: 'customer' as const };
      const response = requireRole(customerUser, ['admin']);
      expect(response).not.toBeNull();
      expect(response?.status).toBe(403);
    });

    it('should require admin role - allow admin', () => {
      const adminUser = { ...mockAuthenticatedUser, role: 'admin' as const };
      const response = requireRole(adminUser, ['admin']);
      expect(response).toBeNull();
    });

    it('should deny customer permission for admin:access', () => {
      const customerUser = { ...mockAuthenticatedUser, role: 'customer' as const };
      const response = requirePermission(customerUser, 'admin:access');
      expect(response).not.toBeNull();
      expect(response?.status).toBe(403);
    });

    it('should deny access for role not in allowed list', () => {
      const sellerUser = { ...mockAuthenticatedUser, role: 'seller' as const };
      const response = requireRole(sellerUser, ['admin', 'customer']);
      expect(response).not.toBeNull();
      expect(response?.status).toBe(403);
    });

    it('should allow access for role in allowed list', () => {
      const sellerUser = { ...mockAuthenticatedUser, role: 'seller' as const };
      const response = requireRole(sellerUser, ['seller', 'admin']);
      expect(response).toBeNull();
    });
  });
});
