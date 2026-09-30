import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser } from '@/app/api/_compat/shared';

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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser(_request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;

  const method = await prisma.payoutMethod.findFirst({
    where: { id, userId: String(user.id) },
  });
  if (!method) {
    return NextResponse.json({ error: 'Payout method not found' }, { status: 404 });
  }

  await prisma.payoutMethod.delete({ where: { id: method.id } });
  await handleAuditLog(String(user.id), 'payout_method.deleted', 'payout_method', method.id);
  return NextResponse.json({ success: true });
}
