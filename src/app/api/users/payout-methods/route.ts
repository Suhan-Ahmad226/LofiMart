import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, toPlainNumber } from '@/app/api/_compat/shared';
import { encryptSensitiveValue, redactSensitiveValue } from '@/features/shared/services/security/fieldEncryption';
import { payoutMethodSchema } from '@/modules/profile/validation';
import { isSellerApproved, getSellerApprovalBlockedMessage } from '@/lib/sellerApproval';

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

function serializePayoutMethod(method: any) {
  return {
    id: method.id,
    type: method.type,
    provider: method.provider,
    account_name: method.accountName ?? null,
    account_last4: method.accountLast4 ?? null,
    bank_account_masked: redactSensitiveValue(method.encryptedAccountNumber),
    mobile_number_masked: redactSensitiveValue(method.encryptedMobileNumber),
    is_default: method.isDefault,
    status: method.status,
    metadata: method.metadata ?? null,
    created_at: method.createdAt ? new Date(method.createdAt).toISOString() : undefined,
    updated_at: method.updatedAt ? new Date(method.updatedAt).toISOString() : undefined,
  };
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const methods = await prisma.payoutMethod.findMany({
    where: { userId: String(user.id) },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json(methods.map(serializePayoutMethod));
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json().catch(() => ({}));
  const parsed = payoutMethodSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid payout method payload' },
      { status: 400 },
    );
  }

  const userId = String(user.id);
  const data = parsed.data;

  if (!['seller', 'reseller', 'admin'].includes(String(user.role))) {
    return NextResponse.json(
      { error: 'Payout methods are only available for seller and reseller accounts' },
      { status: 403 },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    if (data.is_default) {
      await tx.payoutMethod.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    return tx.payoutMethod.create({
      data: {
        userId,
        type: data.type,
        provider: data.provider,
        accountName: data.account_name || null,
        encryptedAccountNumber: data.account_number ? encryptSensitiveValue(data.account_number) : null,
        encryptedRoutingNumber: data.routing_number ? encryptSensitiveValue(data.routing_number) : null,
        encryptedMobileNumber: data.mobile_number ? encryptSensitiveValue(data.mobile_number) : null,
        accountLast4: (data.account_number || data.mobile_number || '').replace(/\D+/g, '').slice(-4) || null,
        isDefault: data.is_default,
        metadata: data.metadata || undefined,
      },
    });
  });

  await handleAuditLog(userId, 'payout_method.created', 'payout_method', created.id, {
    provider: created.provider,
    type: created.type,
  });

  return NextResponse.json({ success: true, payout_method: serializePayoutMethod(created) });
}
