import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { getProfilePayload, requireApiUser } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const payload = await getProfilePayload(String(user.id));
  if (!payload) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  return NextResponse.json(payload);
}

export async function PATCH(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if ('name' in body) data.name = body.name ? String(body.name) : null;
  if ('phone' in body) data.phone = body.phone ? String(body.phone) : null;
  if ('alternate_phone' in body) data.alternatePhone = body.alternate_phone ? String(body.alternate_phone) : null;
  if ('bio' in body) data.bio = body.bio ? String(body.bio) : null;
  if ('store_name' in body) data.storeName = body.store_name ? String(body.store_name) : null;
  if ('storefront_headline' in body) data.storefrontHeadline = body.storefront_headline ? String(body.storefront_headline) : null;
  if ('storefront_banner_url' in body) data.storefrontBannerUrl = body.storefront_banner_url ? String(body.storefront_banner_url) : null;
  if ('storefront_accent_color' in body) data.storefrontAccentColor = body.storefront_accent_color ? String(body.storefront_accent_color) : null;
  if ('profile_visibility' in body) data.profileVisibility = body.profile_visibility ? String(body.profile_visibility) : 'private';
  if ('response_time_hours' in body) {
    data.responseTimeHours = body.response_time_hours == null ? null : Number(body.response_time_hours);
  }

  await prisma.user.update({
    where: { id: String(user.id) },
    data,
  });

  const payload = await getProfilePayload(String(user.id));
  return NextResponse.json(payload);
}
