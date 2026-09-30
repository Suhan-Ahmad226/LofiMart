import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { serializeTenantSetting } from '@/app/api/_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireRole([''])(user);
  if (roleError) return roleError;

  const tenants = await prisma.tenant.findMany({
    include: {
      settings: true,
      _count: {
        select: {
          users: true,
          products: true,
          orders: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(
    tenants.map((tenant) => ({
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      settings: serializeTenantSetting(tenant.settings),
      stats: tenant._count,
      created_at: tenant.createdAt ? new Date(tenant.createdAt).toISOString() : undefined,
    })),
  );
}
