import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { riskFlagSchema } from '@/modules/profile/validation';
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

  const body = await request.json().catch(() => ({})) || {};
  const parsed = riskFlagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid risk flag payload' }, { status: 400 });
  }

  const flag = await prisma.userRiskFlag.create({
    data: {
      userId: id,
      createdById: String(user.id),
      severity: parsed.data.severity,
      reason: parsed.data.reason,
      notes: parsed.data.notes || null,
    },
  });

  const flaggedUser = await prisma.user.findUnique({
    where: { id },
    select: { role: true },
  });

  await createNotification({
    userId: id,
    type: 'security',
    title: 'Account review alert',
    message: parsed.data.notes || parsed.data.reason,
    actionUrl: `/settings/${flaggedUser?.role}/security`,
    metadata: {
      riskFlagId: flag.id,
      severity: flag.severity,
      reason: flag.reason,
    },
  });

  await handleAuditLog(String(user.id), 'admin.risk_flag.created', 'user_risk_flag', flag.id, { severity: flag.severity });
  return NextResponse.json({ success: true, risk_flag: {
    id: flag.id,
    severity: flag.severity,
    reason: flag.reason,
    notes: flag.notes,
    is_active: flag.isActive,
    created_at: flag.createdAt ? new Date(flag.createdAt).toISOString() : undefined,
  } });
}
