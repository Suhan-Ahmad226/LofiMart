import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireAdminRole, requireApiUser } from '../../../../_compat/shared';
import {
  SELLER_STATUSES,
  buildSellerApprovalRequirements,
  getMissingSellerApprovalRequirements,
  isKycSubmittedStatus,
  normalizeSellerStatus,
} from '@/lib/sellerApproval';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

async function requireAdmin(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  return requireAdminRole(user) || user;
}

export async function POST(request: NextRequest, context: { params: Params }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const rawStatus = String(body.status || '').trim().toLowerCase();
  const allowedStatuses = new Set(['approved', 'rejected', 'suspended', 'under_review', 'draft']);

  if (!allowedStatuses.has(rawStatus)) {
    return NextResponse.json({ success: false, error: { code: 'INVALID_STATUS', message: 'Invalid seller status' } }, { status: 400 });
  }

  const status = rawStatus as 'approved' | 'rejected' | 'suspended' | 'under_review' | 'draft';
  const seller = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      sellerStatus: true,
      emailVerified: true,
      phoneVerified: true,
      storeName: true,
      storefrontSlug: true,
      warehouses: { select: { id: true }, take: 1 },
      payoutMethods: { select: { id: true }, take: 1 },
      verificationSubmission: { select: { id: true, status: true } },
    },
  });

  if (!seller || seller.role !== 'seller') {
    return NextResponse.json({ success: false, error: { code: 'SELLER_NOT_FOUND', message: 'Seller not found' } }, { status: 404 });
  }

  const requirements = buildSellerApprovalRequirements({
    emailVerified: seller.emailVerified,
    phoneVerified: seller.phoneVerified,
    hasStoreInfo: Boolean(seller.storeName?.trim() && seller.storefrontSlug?.trim()),
    hasPickupLocation: seller.warehouses.length > 0,
    hasKycSubmission: Boolean(
      seller.verificationSubmission && isKycSubmittedStatus(seller.verificationSubmission.status),
    ),
    hasPayoutMethod: seller.payoutMethods.length > 0,
  });

  if (status === SELLER_STATUSES.approved) {
    const missing = getMissingSellerApprovalRequirements(requirements);
    if (missing.length > 0) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'SELLER_APPROVAL_INCOMPLETE',
          message: 'Seller cannot be approved until all onboarding requirements are complete.',
          missing_requirements: missing.map((item) => item.id),
        },
      }, { status: 409 });
    }
  }

  let reason: string | null = null;
  if (status === SELLER_STATUSES.rejected || status === SELLER_STATUSES.suspended) {
    reason = body.reason ? String(body.reason).trim() : '';
    if (reason.length < 5) {
      return NextResponse.json({
        success: false,
        error: { code: 'REASON_REQUIRED', message: 'A reason of at least 5 characters is required for rejected or suspended sellers.' },
      }, { status: 400 });
    }
  }

  const now = new Date();
  const data: Record<string, unknown> = { sellerStatus: status };

  if (status === SELLER_STATUSES.approved) {
    data.approvedAt = now;
    data.approvedById = admin.id;
    data.rejectionReason = null;
    data.suspensionReason = null;
  } else if (status === SELLER_STATUSES.rejected) {
    data.approvedAt = null;
    data.approvedById = null;
    data.rejectionReason = reason;
    data.suspensionReason = null;
  } else if (status === SELLER_STATUSES.suspended) {
    data.approvedAt = null;
    data.approvedById = null;
    data.suspensionReason = reason;
    data.rejectionReason = null;
  } else if (status === SELLER_STATUSES.under_review) {
    data.rejectionReason = null;
    data.suspensionReason = null;
  } else {
    data.approvedAt = null;
    data.approvedById = null;
    data.rejectionReason = null;
    data.suspensionReason = null;
  }

  await prisma.user.update({ where: { id }, data });

  return NextResponse.json({
    success: true,
    data: {
      id,
      previous_status: normalizeSellerStatus(seller.sellerStatus),
      status,
      approved_at: status === SELLER_STATUSES.approved ? now.toISOString() : null,
    },
  });
}
