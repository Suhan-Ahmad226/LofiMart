import { NextRequest, NextResponse } from 'next/server';
import { prismaDirect } from '@/features/shared/services/database/prisma';
import { requireApiUser, requireRole, toPlainNumber } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireReseller(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  return requireRole(['reseller'])(user) || user;
}

export async function GET(request: NextRequest) {
  const user = await requireReseller(request);
  if (user instanceof NextResponse) return user;

  const markups = await prismaDirect.resellerMarkup.findMany({
    where: { resellerId: String(user.id) },
    include: {
      product: {
        include: {
          seller: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(
    markups.map((markup) => {
      const basePrice = Number(toPlainNumber(markup.product?.resellerBasePrice ?? markup.product?.price ?? 0) || 0);
      const markupAmount = Number(toPlainNumber(markup.markupAmount) || 0);
      return {
        id: markup.id,
        reseller_id: markup.resellerId,
        product_id: markup.productId,
        markup_amount: markupAmount,
        reseller_base_price: basePrice,
        reseller_sale_price: Number((basePrice + markupAmount).toFixed(2)),
        created_at: markup.createdAt ? new Date(markup.createdAt).toISOString() : undefined,
        updated_at: markup.updatedAt ? new Date(markup.updatedAt).toISOString() : undefined,
        product: markup.product
          ? {
              id: markup.product.id,
              name: markup.product.name,
              price: toPlainNumber(markup.product.price),
              reseller_enabled: Boolean(markup.product.resellerEnabled),
              reseller_base_price: markup.product.resellerBasePrice == null ? null : toPlainNumber(markup.product.resellerBasePrice),
              reseller_suggested_price: markup.product.resellerSuggestedPrice == null ? null : toPlainNumber(markup.product.resellerSuggestedPrice),
              image: markup.product.image ?? null,
              category: markup.product.category ?? null,
              stock: markup.product.stock,
              seller_name: markup.product.seller?.name ?? null,
            }
          : undefined,
      };
    }),
  );
}
