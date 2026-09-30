import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { serializeUser } from '@/app/api/_compat/shared';
import { createNotification } from '@/features/shared/services/notifications/notificationService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleAuditLog(userId: string | null | undefined, action: string, entityType: string, entityId?: string | null, metadata?: Record<string, unknown>) {
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const roleError = requireRole(['admin'])(user);
  if (roleError) return roleError;

  if (String(user.id) === id) {
    return NextResponse.json({ error: 'You cannot block your own admin account' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({})) || {};
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : null;
  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      isBlocked: true,
      blockedAt: new Date(),
      blockedReason: reason,
    },
  });

  await createNotification({
    userId: updatedUser.id,
    type: 'security',
    title: 'Account access restricted',
    message: reason || 'Your account has been temporarily blocked by the admin team. Contact support if you need help.',
    actionUrl: `/contact?subject=${encodeURIComponent('Account access support')}&message=${encodeURIComponent(
      `I need help with my account access. User ID: ${updatedUser.id}.`,
    )}`,
    metadata: {
      userId: updatedUser.id,
      action: 'blocked',
      reason: reason || null,
    },
  });

  await handleAuditLog(String(user.id), 'admin.user.blocked', 'user', updatedUser.id, { reason });
  return NextResponse.json({ success: true, user: serializeUser(updatedUser) });
}
