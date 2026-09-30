import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireAdminRole, requireApiUser } from '../../_compat/shared';
import { buildPrismaPagination } from '@/server/middleware/pagination';
import type { UserRole } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireAdminRole(user);
  if (roleError) return roleError;

  const { skip, take, meta } = buildPrismaPagination(request as any, { maxLimit: 100 });
  const where = { role: 'seller' as UserRole };
  const [total, sellers] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        products: {
          select: {
            rating: true,
          },
        },
        _count: {
          select: {
            products: true,
            payoutMethods: true,
            warehouses: true,
          },
        },
        verificationSubmission: {
          select: {
            status: true,
            submittedAt: true,
            rejectionReason: true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: sellers.map((seller) => {
      const ratings = seller.products.map((product) => product.rating).filter((value: number) => value > 0);
      const avgRating = ratings.length
        ? ratings.reduce((sum: number, value: number) => sum + value, 0) / ratings.length
        : null;

      return {
        id: seller.id,
        name: seller.name,
        email: seller.email,
        shop_name: seller.storeName || seller.name,
        storefront_slug: seller.storefrontSlug ?? null,
        status: seller.sellerStatus,
        submitted_for_review_at: seller.submittedForReviewAt
          ? seller.submittedForReviewAt.toISOString()
          : null,
        approved_at: seller.approvedAt ? seller.approvedAt.toISOString() : null,
        rejection_reason: seller.rejectionReason ?? null,
        suspension_reason: seller.suspensionReason ?? null,
        verification_status: seller.verificationSubmission?.status ?? null,
        pickup_count: seller._count.warehouses,
        payout_method_count: seller._count.payoutMethods,
        rating: avgRating,
        product_count: seller._count.products,
      };
    }),
    meta: { ...meta, total },
  });
}
