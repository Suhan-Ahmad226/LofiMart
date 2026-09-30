import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireAdminRole, requireApiUser } from '../../../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  return requireAdminRole(user) || user;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const status = String(body.status || '').trim();

  const allowedStatuses = new Set(['unread', 'read', 'in_progress', 'resolved']);
  if (!allowedStatuses.has(status)) {
    return NextResponse.json({ error: 'Invalid message status' }, { status: 400 });
  }

  try {
    const message = await prisma.contactMessage.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error('PATCH /api/admin/messages/[id]/status error:', error);
    return NextResponse.json({ error: 'Failed to update message status' }, { status: 500 });
  }
}