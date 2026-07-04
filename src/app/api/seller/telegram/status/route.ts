import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { getSellerDeepLink } from '@/src/features/telegram_bot';
import { requireApiUser, requireSellerRole } from '../../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const seller = await (prisma.user as any).findUnique({
    where: { id: String(user.id) },
    select: {
      id: true,
      name: true,
      storeName: true,
      telegramChatId: true,
      telegramLinkedAt: true,
    },
  });

  if (!seller) {
    return NextResponse.json({ error: 'Seller not found' }, { status: 404 });
  }

  return NextResponse.json({
    configured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME),
    linked: Boolean(seller.telegramChatId),
    linked_at: seller.telegramLinkedAt ? new Date(seller.telegramLinkedAt).toISOString() : null,
    chat_id_masked: seller.telegramChatId ? `${String(seller.telegramChatId).slice(0, 4)}...${String(seller.telegramChatId).slice(-3)}` : null,
    deep_link: getSellerDeepLink(seller.id),
    store_name: seller.storeName || seller.name || 'Seller',
  });
}

export async function DELETE(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  await (prisma.user as any).update({
    where: { id: String(user.id) },
    data: {
      telegramChatId: null,
      telegramLinkedAt: null,
    },
  });

  return NextResponse.json({ ok: true, linked: false });
}
