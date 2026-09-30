import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { serializeUser, serializeAddress, serializeNotificationPreference } from '@/app/api/_compat/shared';
import { normalizeSellerStatus } from '@/lib/sellerApproval';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serializeVerificationSubmission(submission: any) {
  if (!submission) return null;
  return {
    id: submission.id,
    status: submission.status,
    submitted_at: submission.submittedAt ? new Date(submission.submittedAt).toISOString() : undefined,
    reviewed_at: submission.reviewedAt ? new Date(submission.reviewedAt).toISOString() : null,
    rejection_reason: submission.rejectionReason ?? null,
    risk_score: submission.riskScore ?? 0,
    notes: submission.notes ?? null,
    documents: submission.documents?.map((doc: any) => ({
      id: doc.id,
      type: doc.type,
      url: doc.url,
      status: doc.status,
    })) ?? [],
    reviewed_by: submission.reviewedBy
      ? {
          id: submission.reviewedBy.id,
          name: submission.reviewedBy.name,
          email: submission.reviewedBy.email,
        }
      : null,
  };
}

function serializePayoutMethod(method: any) {
  return {
    id: method.id,
    type: method.type,
    provider: method.provider,
    details: method.details,
    status: method.status,
    is_default: method.isDefault ? 1 : 0,
    created_at: method.createdAt ? new Date(method.createdAt).toISOString() : undefined,
  };
}

function serializePayoutTransaction(transaction: any) {
  return {
    id: transaction.id,
    type: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
    status: transaction.status,
    source: transaction.source,
    description: transaction.description,
    balance_after: transaction.balanceAfter ?? 0,
    metadata: transaction.metadata ?? null,
    created_at: transaction.createdAt ? new Date(transaction.createdAt).toISOString() : undefined,
  };
}

function serializeRiskFlag(flag: any) {
  return {
    id: flag.id,
    severity: flag.severity,
    reason: flag.reason,
    notes: flag.notes ?? null,
    is_active: flag.isActive,
    created_at: flag.createdAt ? new Date(flag.createdAt).toISOString() : undefined,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const roleError = requireRole(['admin'])(user);
  if (roleError) return roleError;

  const targetUser = await prisma.user.findUnique({
    where: { id },
    include: {
      approvedBy: {
        select: { id: true, name: true, email: true },
      },
      addresses: true,
      notificationPreference: true,
      verificationSubmission: {
        include: {
          reviewedBy: { select: { id: true, name: true, email: true } },
          documents: true,
        },
      },
      payoutMethods: true,
      payoutTransactions: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      riskFlags: {
        orderBy: { createdAt: 'desc' },
      },
      products: {
        orderBy: { createdAt: 'desc' },
        include: {
          seller: {
            select: {
              id: true,
              name: true,
              storeName: true,
              sellerStatus: true,
              storefrontPublished: true,
            },
          },
        },
      },
      warehouses: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    user: serializeUser(targetUser),
    addresses: targetUser.addresses.map(serializeAddress),
    notification_preferences: serializeNotificationPreference(targetUser.notificationPreference),
    verification: serializeVerificationSubmission(targetUser.verificationSubmission),
    payout_methods: targetUser.payoutMethods.map(serializePayoutMethod),
    transactions: targetUser.payoutTransactions.map(serializePayoutTransaction),
    risk_flags: targetUser.riskFlags.map(serializeRiskFlag),
    products: targetUser.products.map((product: any) => ({
      ...product,
      seller: product.seller,
    })),
    pickup_locations: targetUser.warehouses.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      address: warehouse.address,
      city: warehouse.city,
      phone: warehouse.phone,
      contact_name: warehouse.contactName ?? null,
      pathao_store_id: warehouse.pathaoStoreId ?? null,
    })),
    seller_approval: targetUser.role === 'seller'
      ? {
          status: normalizeSellerStatus(targetUser.sellerStatus),
          submitted_for_review_at: targetUser.submittedForReviewAt ? new Date(targetUser.submittedForReviewAt).toISOString() : null,
          approved_at: targetUser.approvedAt ? new Date(targetUser.approvedAt).toISOString() : null,
          approved_by: targetUser.approvedBy
            ? {
                id: targetUser.approvedBy.id,
                name: targetUser.approvedBy.name,
                email: targetUser.approvedBy.email,
              }
            : null,
          rejection_reason: targetUser.rejectionReason ?? null,
          suspension_reason: targetUser.suspensionReason ?? null,
        }
      : null,
  });
}
