import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, requireSellerRole } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const row = await prisma.user.findUnique({
    where: { id: String(user.id) },
    select: {
      sellerStatus: true,
      storeName: true,
      storefrontSlug: true,
      storefrontPublished: true,
      profileVisibility: true,
    },
  });

  return NextResponse.json({
    seller_status: row?.sellerStatus ?? 'draft',
    store_name: row?.storeName ?? null,
    storefront_slug: row?.storefrontSlug ?? null,
    storefront_published: Boolean(row?.storefrontPublished ?? true),
    profile_visibility: row?.profileVisibility ?? 'private',
    completed: Boolean(row?.storeName && row?.storefrontSlug),
  });
}
