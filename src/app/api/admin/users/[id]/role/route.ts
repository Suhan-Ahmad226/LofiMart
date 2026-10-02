import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireAdminRole, requireApiUser } from '../../../../_compat/shared';
import type { UserRole } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

async function requireAdmin(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  return requireAdminRole(user) || user;
}

export async function POST(request: NextRequest, context: { params: Params }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const role = String(body.role || '').trim();

  if (role === 'admin') {
    return NextResponse.json({ error: 'Admin role assignment is disabled' }, { status: 403 });
  }

  const allowedRoles = new Set(['customer', 'seller', 'reseller']);
  if (!allowedRoles.has(role)) {
    return NextResponse.json({ error: 'Invalid role provided' }, { status: 400 });
  }
  if (String(admin.id) === id) {
    return NextResponse.json(
      { error: 'You cannot change your own role from the admin panel' },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id },
    data: {
      role: role as UserRole,
      sellerStatus: role === 'seller' ? 'draft' : undefined,
      profileVisibility: role === 'customer' ? 'private' : 'public',
    },
  });

  return NextResponse.json({ success: true });
}