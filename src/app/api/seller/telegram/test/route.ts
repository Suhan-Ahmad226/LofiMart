import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { escapeTelegramHtml, getTelegramDashboardUrl, sendTelegramMessage } from '@/src/features/telegram_bot';
import { requireApiUser, requireSellerRole } from '../../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
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
    },
  });

  if (!seller) {
    return NextResponse.json({ error: 'Seller not found' }, { status: 404 });
  }

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: 'Telegram bot token is not configured' }, { status: 503 });
  }

  if (!seller.telegramChatId) {
    return NextResponse.json({ error: 'Telegram chat is not linked yet' }, { status: 409 });
  }

  await sendTelegramMessage({
    chatId: seller.telegramChatId,
    text: [
      '<b>LofiMart Telegram test successful</b>',
      '',
      `Store: <b>${escapeTelegramHtml(seller.storeName || seller.name || 'Seller')}</b>`,
      'You will receive order, inventory, payment, and commission alerts here.',
    ].join('\n'),
    buttons: [[{ text: 'Open Seller Dashboard', web_app: { url: getTelegramDashboardUrl('/seller/dashboard') } }]],
  });

  return NextResponse.json({ ok: true });
}
