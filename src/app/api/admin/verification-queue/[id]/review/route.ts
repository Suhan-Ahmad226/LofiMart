import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { verificationReviewSchema } from '@/modules/profile/validation';
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
  const parsed = verificationReviewSchema.safeParse({
    ...body,
    risk_score: typeof body?.risk_score === 'undefined' ? undefined : Number(body.risk_score),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid verification review payload' }, { status: 400 });
  }

  const updated = await prisma.verificationSubmission.update({
    where: { id },
    data: {
      status: parsed.data.status,
      rejectionReason: parsed.data.rejection_reason || null,
      riskScore: parsed.data.risk_score ?? 0,
      notes: parsed.data.notes || null,
      reviewedAt: new Date(),
      reviewedById: String(user.id),
    },
    include: {
      reviewedBy: { select: { id: true, name: true, email: true } },
      documents: true,
      user: { select: { id: true, role: true, tenantId: true } },
    },
  });

  await createNotification({
    userId: updated.user.id,
    tenantId: updated.user.tenantId ?? null,
    type: 'verification',
    title: updated.status === 'verified' ? 'Verification approved' : updated.status === 'rejected' ? 'Verification needs attention' : 'Verification updated',
    message:
      updated.status === 'verified'
        ? 'Your verification submission has been approved.'
        : updated.rejectionReason || 'Your verification submission was reviewed. Please check the latest update.',
    actionUrl: `/settings/${updated.user.role}/verification`,
    metadata: {
      verificationId: updated.id,
      status: updated.status,
      role: updated.user.role,
    },
  });

  await handleAuditLog(String(user.id), 'admin.verification.reviewed', 'verification_submission', updated.id, {
    status: updated.status,
    risk_score: updated.riskScore,
  });

  return NextResponse.json({ success: true, verification: {
    id: updated.id,
    status: updated.status,
    rejectionReason: updated.rejectionReason,
    riskScore: updated.riskScore,
    notes: updated.notes,
    reviewedAt: updated.reviewedAt,
    reviewedBy: updated.reviewedBy,
    documents: updated.documents,
  } });
}
