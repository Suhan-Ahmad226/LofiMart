import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, requireSellerRole } from '../../../_compat/shared';
import { serializeProduct } from '../../../products/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const { id } = await params;
  const product = await prisma.product.findFirst({
    where: {
      id,
      sellerId: String(user.id),
    },
  });

  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

  return NextResponse.json(serializeProduct(product));
}
