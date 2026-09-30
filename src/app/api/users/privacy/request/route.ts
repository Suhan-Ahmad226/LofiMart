import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { createClient } from '@/lib/server';
import { requireApiUser } from '@/app/api/_compat/shared';
import { privacyRequestSchema } from '@/modules/profile/validation';

async function handleAuditLog(
  userId: string | null | undefined,
  action: string,
  entityType: string,
  entityId?: string | null,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      userId: userId ? String(userId) : null,
      action,
      entityType,
      entityId: entityId || null,
      metadata: metadata ?? {},
    },
  });
}

async function markLoginActivitiesRevoked(userId: string) {
  await prisma.loginActivity.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

function serializeAccountActionRequest(request: any) {
  return {
    id: request.id,
    order_id: request.orderId ?? null,
    type: request.type,
    status: request.status,
    reason: request.reason ?? null,
    resolution_note: request.resolutionNote ?? null,
    processed_at: request.processedAt ? new Date(request.processedAt).toISOString() : null,
    created_at: request.createdAt ? new Date(request.createdAt).toISOString() : undefined,
  };
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json().catch(() => ({}));
  const parsed = privacyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid privacy request' },
      { status: 400 },
    );
  }

  const requestRecord = await prisma.accountActionRequest.create({
    data: {
      userId: String(user.id),
      type: parsed.data.type,
      reason: parsed.data.reason || null,
    },
  });

  if (parsed.data.type === 'deactivate') {
    await prisma.user.update({
      where: { id: String(user.id) },
      data: { deactivatedAt: new Date() },
    });
    try {
      const supabase = await createClient();
      await supabase.auth.signOut();
    } catch {
      // ignore sign-out errors; the deactivation still applies to the local record
    }
    await markLoginActivitiesRevoked(String(user.id));
  }

  await handleAuditLog(String(user.id), 'privacy.request_created', 'account_action_request', requestRecord.id, {
    type: requestRecord.type,
  });

  return NextResponse.json({ success: true, request: serializeAccountActionRequest(requestRecord) });
}
