import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMock, requireApiUser, requireAdminRole } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      count: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
  requireApiUser: vi.fn(),
  requireAdminRole: vi.fn(),
}));

vi.mock('@/lib/server', () => ({ prisma: prismaMock }));
vi.mock('@/app/api/_compat/shared', () => ({
  requireApiUser,
  requireAdminRole,
  serializeUser: (user: { id: string; role: string }) => ({ id: user.id, role: user.role }),
  toPlainNumber: (value: unknown) => value,
}));

import { GET } from '@/app/api/admin/users/route';
import { POST } from '@/app/api/admin/users/[id]/role/route';

describe('admin user management API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiUser.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    requireAdminRole.mockReturnValue(null);
    prismaMock.user.count.mockResolvedValue(26);
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'user-26', role: 'customer', verificationSubmission: null, riskFlags: [] },
    ]);
    prismaMock.user.update.mockResolvedValue({ id: 'user-26', role: 'admin' });
  });

  it('searches and paginates users on the server', async () => {
    const request = new NextRequest('http://localhost/api/admin/users?search=admin%40gmail.com&page=2&pageSize=25');

    const response = await GET(request);
    const payload = await response.json();

    expect(prismaMock.user.count).toHaveBeenCalledWith({
      where: {
        OR: [
          { id: { contains: 'admin@gmail.com' } },
          { email: { contains: 'admin@gmail.com', mode: 'insensitive' } },
          { name: { contains: 'admin@gmail.com', mode: 'insensitive' } },
        ],
      },
    });
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 25, take: 25 }),
    );
    expect(payload.pagination).toMatchObject({ page: 2, limit: 25, total: 26, totalPages: 2 });
    expect(payload.users[0]).toMatchObject({ id: 'user-26', role: 'customer' });
  });

  it('rejects attempts to promote a user to admin', async () => {
    const request = new NextRequest('http://localhost/api/admin/users/user-26/role', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'user-26' }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Admin role assignment is disabled' });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});