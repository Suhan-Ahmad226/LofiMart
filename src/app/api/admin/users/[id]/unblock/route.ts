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
    return NextResponse.json({ error: 'Your own admin account cannot be managed from this action' }, { status: 400 });
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      isBlocked: false,
      blockedAt: null,
      blockedReason: null,
    },
  });

  await createNotification({
    userId: updatedUser.id,
    type: 'security',
    title: 'Account access restored',
    message: 'Your account access has been restored. You can sign in again now.',
    actionUrl: '/login',
    metadata: {
      userId: updatedUser.id,
      action: 'unblocked',
    },
  });

  await handleAuditLog(String(user.id), 'admin.user.unblocked', 'user', updatedUser.id);
  return NextResponse.json({ success: true, user: serializeUser(updatedUser) });
}
