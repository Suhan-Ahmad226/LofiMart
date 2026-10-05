import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, requireSellerRole } from '../../_compat/shared';
import {
  buildSellerApprovalRequirements,
  getMissingSellerApprovalRequirements,
  canSellerSubmitForReview,
  normalizeSellerStatus,
} from '@/lib/sellerApproval';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const seller = await prisma.user.findUnique({
    where: { id: String(user.id) },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      emailVerified: true,
      phoneVerified: true,
      storeName: true,
      storefrontSlug: true,
      sellerStatus: true,
      submittedForReviewAt: true,
      approvedAt: true,
      rejectionReason: true,
      suspensionReason: true,
      warehouses: { select: { id: true }, take: 100 },
      payoutMethods: { select: { id: true }, take: 100 },
      verificationSubmission: {
        select: {
          status: true,
          rejectionReason: true,
          documentNumber: true,
          documents: { select: { type: true } },
        },
      },
    },
  });

  if (!seller) {
    return NextResponse.json({ error: 'Seller not found' }, { status: 404 });
  }

  const verificationStatus = String(seller.verificationSubmission?.status || '').toLowerCase();
  const verificationDocumentTypes = new Set(
    (seller.verificationSubmission?.documents || []).map((document) => String(document.type).toLowerCase()),
  );
  const hasKycSubmission =
    ['pending', 'submitted', 'under_review', 'approved', 'verified'].includes(verificationStatus) &&
    Boolean(seller.verificationSubmission?.documentNumber?.trim()) &&
    verificationDocumentTypes.has('front') &&
    verificationDocumentTypes.has('back') &&
    verificationDocumentTypes.has('selfie');

  const requirements = buildSellerApprovalRequirements({
    emailVerified: seller.emailVerified,
    phoneVerified: seller.phoneVerified,
    hasStoreInfo: Boolean(seller.storeName?.trim()),
    hasPickupLocation: seller.warehouses.length > 0,
    hasKycSubmission,
    hasPayoutMethod: seller.payoutMethods.length > 0,
  });

  const missingRequirements = getMissingSellerApprovalRequirements(requirements);
  const sellerStatus = normalizeSellerStatus(seller.sellerStatus);

  const steps = [
    {
      id: 'profile',
      title: 'Profile & store info',
      description: 'Add your name, phone number, store name, and storefront slug.',
      completed: requirements.find((item) => item.id === 'store_info_completed')?.completed ?? false,
      status: requirements.find((item) => item.id === 'store_info_completed')?.completed ? 'complete' : 'required',
      action_path: '/seller/settings?section=profile',
    },
    {
      id: 'pickup',
      title: 'Pickup location',
      description: 'Add at least one seller pickup location.',
      completed: requirements.find((item) => item.id === 'pickup_location_added')?.completed ?? false,
      status: requirements.find((item) => item.id === 'pickup_location_added')?.completed ? 'complete' : 'required',
      action_path: '/seller/pickup-locations',
    },
    {
      id: 'verification',
      title: 'Verification & KYC',
      description: 'Submit your NID/passport/birth certificate documents and selfie.',
      completed: hasKycSubmission,
      status: hasKycSubmission ? verificationStatus : 'required',
      action_path: '/seller/settings?section=verification',
    },
    {
      id: 'payout',
      title: 'Payout method',
      description: 'Add a payout account for seller earnings.',
      completed: seller.payoutMethods.length > 0,
      status: seller.payoutMethods.length > 0 ? 'complete' : 'required',
      action_path: '/seller/settings?section=payout',
    },
  ];

  const completedSteps = steps.filter((step) => step.completed).length;
  const totalSteps = steps.length;
  const canSubmitForReview = canSellerSubmitForReview(requirements, sellerStatus);
  const nextStep = steps.find((step) => !step.completed) || null;

  return NextResponse.json({
    seller: {
      id: seller.id,
      name: seller.name,
      email: seller.email,
      phone: seller.phone,
      store_name: seller.storeName,
      storefront_slug: seller.storefrontSlug,
      seller_status: sellerStatus,
      submitted_for_review_at: seller.submittedForReviewAt?.toISOString() ?? null,
      approved_at: seller.approvedAt?.toISOString() ?? null,
      rejection_reason: seller.rejectionReason ?? null,
      suspension_reason: seller.suspensionReason ?? null,
    },
    summary: {
      completed_steps: completedSteps,
      total_steps: totalSteps,
      progress_percent: totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0,
      ready_for_live_booking: canSubmitForReview,
      ready_for_admin_review: canSubmitForReview,
      ready_for_payout: seller.payoutMethods.length > 0,
      ready_for_storefront_publish: Boolean(seller.storeName?.trim() && seller.storefrontSlug?.trim()),
    },
    steps,
    next_step: nextStep,
    pickups: {
      total: seller.warehouses.length,
      linked_courier_store_count: 0,
    },
    verification: seller.verificationSubmission
      ? {
          status: verificationStatus,
          rejection_reason: seller.verificationSubmission.rejectionReason ?? null,
        }
      : null,
    approval: {
      status: sellerStatus,
      submitted_for_review_at: seller.submittedForReviewAt?.toISOString() ?? null,
      approved_at: seller.approvedAt?.toISOString() ?? null,
      rejection_reason: seller.rejectionReason ?? null,
      suspension_reason: seller.suspensionReason ?? null,
      requirements,
      missing_requirements: missingRequirements,
      can_submit_for_review: canSubmitForReview,
    },
  });
}
