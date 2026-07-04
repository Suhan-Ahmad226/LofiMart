import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, requireSellerRole } from '../../../_compat/shared';
import { serializeProduct } from '../../../products/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const products = await prisma.product.findMany({
    where: { sellerId: String(user.id) },
    orderBy: { createdAt: 'desc' },
  });
  const serialized = products.map(serializeProduct);
  const categories = [...new Set(serialized.map((product) => String(product.category || 'Uncategorized')))];

  return NextResponse.json({ products: serialized, categories });
}
