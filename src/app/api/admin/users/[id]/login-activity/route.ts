import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { buildPrismaPagination } from '@/server/middleware/pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serializeLoginActivity(activity: any) {
  return {
    id: activity.id,
    user_id: activity.userId,
    ip_address: activity.ipAddress ?? null,
    user_agent: activity.userAgent ?? null,
    location: activity.location ?? null,
    logged_in_at: activity.loggedInAt ? new Date(activity.loggedInAt).toISOString() : undefined,
    logged_out_at: activity.loggedOutAt ? new Date(activity.loggedOutAt).toISOString() : null,
    is_revoked: Boolean(activity.isRevoked),
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const roleError = requireRole(['admin'])(user);
  if (roleError) return roleError;

  const { skip, take, meta } = buildPrismaPagination(request as any);
  const [total, activities] = await Promise.all([
    prisma.loginActivity.count({ where: { userId: id } }),
    prisma.loginActivity.findMany({
      where: { userId: id },
      orderBy: { loggedInAt: 'desc' },
      skip,
      take,
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: activities.map(serializeLoginActivity),
    meta: { ...meta, total },
  });
}
