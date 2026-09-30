import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, requireSellerRole } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const sellerId = String(user.id);

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
