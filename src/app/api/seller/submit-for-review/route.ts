import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, requireSellerRole } from '../../_compat/shared';
import { buildSellerApprovalRequirements, getMissingSellerApprovalRequirements } from '@/lib/sellerApproval';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const sellerId = String(user.id);

  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: {
      emailVerified: true, phoneVerified: true, storeName: true, storefrontSlug: true,
      warehouses: { select: { id: true }, take: 1 },
      payoutMethods: { select: { id: true }, take: 1 },
      verificationSubmission: { select: { status: true } },
      sellerStatus: true,
    },
  });
  if (!seller) return NextResponse.json({ success: false, error: { code: 'SELLER_NOT_FOUND', message: 'Seller not found' } }, { status: 404 });
  const requirements = buildSellerApprovalRequirements({
    emailVerified: seller.emailVerified,
    phoneVerified: seller.phoneVerified,
    hasStoreInfo: Boolean(seller.storeName?.trim() && seller.storefrontSlug?.trim()),
    hasPickupLocation: seller.warehouses.length > 0,
    hasKycSubmission: Boolean(seller.verificationSubmission && ['submitted','under_review','approved'].includes(String(seller.verificationSubmission.status).toLowerCase())),
    hasPayoutMethod: seller.payoutMethods.length > 0,
  });
  const missing = getMissingSellerApprovalRequirements(requirements);
  if (missing.length) return NextResponse.json({ success: false, error: { code: 'SELLER_ONBOARDING_INCOMPLETE', message: 'Complete all seller onboarding requirements before submitting for review.', missing_requirements: missing.map(item => item.id) } }, { status: 409 });

  if (!['draft', 'rejected'].includes(String(seller.sellerStatus).toLowerCase())) {
    return NextResponse.json({ success: false, error: { code: 'INVALID_SELLER_STATUS', message: 'Only draft or rejected sellers can be submitted for review.' } }, { status: 409 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: sellerId },
      data: {
        sellerStatus: 'pending_review',
        submittedForReviewAt: new Date(),
      },
      select: {
        id: true,
        sellerStatus: true,
        submittedForReviewAt: true,
        storeName: true,
        storefrontSlug: true,
      },
    });

    return NextResponse.json({
      success: true,
      seller_status: updated.sellerStatus,
      submitted_for_review_at: updated.submittedForReviewAt
        ? new Date(updated.submittedForReviewAt).toISOString()
        : null,
      store_name: updated.storeName ?? null,
      storefront_slug: updated.storefrontSlug ?? null,
    });
  } catch (error: any) {
    console.error('POST /api/seller/submit-for-review error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to submit store for review' }, { status: 500 });
  }
}
