import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser } from '@/app/api/products/shared';
import { takeRateLimit } from '@/features/auth/services/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const productId = typeof body.productId === 'string' ? body.productId : null;

  if (message.length < 3 || message.length > 1000) {
    return NextResponse.json({ error: 'Message must be between 3 and 1000 characters.' }, { status: 400 });
  }

  const { allowed, resetAfterMs } = await takeRateLimit(`seller-contact:${user.id}:${slug}`, {
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: 'Please wait before sending another message to this seller.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(resetAfterMs / 1000)) } },
    );
  }

  const seller = await prisma.user.findFirst({
    where: {
      role: 'seller',
      storefrontSlug: slug,
      sellerStatus: 'approved',
      storefrontPublished: true,
      profileVisibility: { not: 'private' },
      isBlocked: false,
      deactivatedAt: null,
    },
    select: { id: true },
  });

  if (!seller) return NextResponse.json({ error: 'Seller storefront was not found.' }, { status: 404 });
  if (seller.id === String(user.id)) return NextResponse.json({ error: 'You cannot message your own store.' }, { status: 400 });

  await prisma.userNotification.create({
    data: {
      userId: seller.id,
      createdById: String(user.id),
      type: 'seller_contact',
      title: 'New customer inquiry',
      message,
      actionUrl: '/seller/notifications',
      metadata: { productId, customerId: String(user.id), source: 'product-details' },
    },
  });

  return NextResponse.json({ success: true });
}
