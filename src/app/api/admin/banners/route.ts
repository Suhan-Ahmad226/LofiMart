import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/server';
import { requireAdminRole, requireApiUser } from '../../_compat/shared';
import { associateEntityMedia } from '@/lib/media';
import { HOMEPAGE_CACHE_TAGS } from '@/features/shop/screens/HomePage.data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serializeBanner(banner: any) {
  return {
    id: banner.id,
    title: banner.title,
    subtitle: banner.subtitle ?? '',
    image: banner.image,
    link: banner.link,
    button_text: banner.buttonText,
    buttonText: banner.buttonText,
    is_active: Boolean(banner.isActive),
    isActive: Boolean(banner.isActive),
    created_at: banner.createdAt ? new Date(banner.createdAt).toISOString() : undefined,
    updated_at: banner.updatedAt ? new Date(banner.updatedAt).toISOString() : undefined,
  };
}

async function requireAdmin(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  return requireAdminRole(user) || user;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const banners = await prisma.banner.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(banners.map(serializeBanner));
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  const image = String(body.image || '').trim();
  const link = String(body.link || '/shop').trim() || '/shop';
  const buttonText = String(body.button_text || body.buttonText || 'Shop Now').trim() || 'Shop Now';

  if (!title || !image) {
    return NextResponse.json({ error: 'Title and image are required' }, { status: 400 });
  }

  const banner = await prisma.banner.create({
    data: {
      title,
      subtitle: body.subtitle ? String(body.subtitle).trim() : '',
      image,
      link,
      buttonText,
      isActive: body.is_active ?? body.isActive ?? true,
    },
  });

  await associateEntityMedia({
    ownerId: String(admin.id),
    entityType: 'Banner',
    entityId: banner.id,
    fieldName: 'image',
    urls: [banner.image],
  });

  revalidateTag(HOMEPAGE_CACHE_TAGS.banners);

  return NextResponse.json(serializeBanner(banner), { status: 201 });
}
