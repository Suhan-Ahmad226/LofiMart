import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireAdminRole, requireApiUser } from '../../../../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  return requireAdminRole(user) || user;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const status = String(body.status || '').trim();

  const allowedStatuses = new Set(['open', 'reviewed', 'dismissed']);
  if (!allowedStatuses.has(status)) {
    return NextResponse.json({ error: 'Invalid report status' }, { status: 400 });
  }

  try {
    await prisma.communityPostReport.update({
      where: { id },
      data: {
        status,
        moderatedAt: new Date(),
        moderatedById: String(admin.id),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/admin/community/reports/[id]/review error:', error);
    return NextResponse.json({ error: 'Failed to review report' }, { status: 500 });
  }
}