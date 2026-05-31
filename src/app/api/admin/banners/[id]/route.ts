import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireAdminRole, requireApiUser } from '../../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

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

export async function PATCH(request: NextRequest, context: { params: Params }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if ('title' in body) data.title = String(body.title || '').trim();
  if ('subtitle' in body) data.subtitle = body.subtitle ? String(body.subtitle).trim() : '';
  if ('image' in body) data.image = String(body.image || '').trim();
  if ('link' in body) data.link = String(body.link || '/shop').trim() || '/shop';
  if ('button_text' in body || 'buttonText' in body) {
    data.buttonText = String(body.button_text || body.buttonText || 'Shop Now').trim() || 'Shop Now';
  }
  if ('is_active' in body || 'isActive' in body) {
    data.isActive = Boolean(body.is_active ?? body.isActive);
  }

  if (data.title === '' || data.image === '') {
    return NextResponse.json({ error: 'Title and image are required' }, { status: 400 });
  }

  const banner = await prisma.banner.update({
    where: { id },
    data,
  });

  return NextResponse.json(serializeBanner(banner));
}

export async function DELETE(request: NextRequest, context: { params: Params }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await context.params;
  await prisma.banner.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
