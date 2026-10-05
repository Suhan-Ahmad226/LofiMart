import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import {
  getSellerDeepLink,
  getTelegramChat,
  getTelegramWebhookInfo,
  isTelegramBotConfigured,
  sendTelegramMessage,
} from '../../../../../features/telegram_bot';
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

  const payload: Record<string, unknown> = {
    configured: isTelegramBotConfigured() && Boolean(process.env.TELEGRAM_BOT_USERNAME),
    linked: Boolean(seller.telegramChatId),
    linked_at: seller.telegramLinkedAt ? new Date(seller.telegramLinkedAt).toISOString() : null,
    chat_id_masked: seller.telegramChatId ? `${String(seller.telegramChatId).slice(0, 4)}...${String(seller.telegramChatId).slice(-3)}` : null,
    deep_link: getSellerDeepLink(seller.id),
    store_name: seller.storeName || seller.name || 'Seller',
  };

  // The panel polls this route, so the (relatively slow) webhook lookup is only
  // performed when explicitly requested by the diagnostics button.
  if (request.nextUrl.searchParams.get('diagnostics') === '1') {
    try {
      const info = await getTelegramWebhookInfo();
      payload.webhook = {
        reachable: true,
        url: info.url,
        pending_updates: info.pending_update_count,
        last_error: info.last_error_message || null,
        last_error_at: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null,
      };
    } catch (error) {
      payload.webhook = {
        reachable: false,
        error: error instanceof Error ? error.message : 'Could not reach the Telegram Bot API',
      };
    }
  }

  return NextResponse.json(payload);
}

/**
 * Manual fallback for sellers whose `/start` deep link cannot be delivered
 * because the Telegram webhook is failing. Ownership of the chat is proven by
 * successfully delivering a bot message to it, so a chat id belonging to
 * someone else cannot be claimed.
 */
export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  if (!isTelegramBotConfigured()) {
    return NextResponse.json({ error: 'Telegram bot is not configured' }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { chat_id?: unknown } | null;
  const chatId = String(body?.chat_id ?? '').trim();

  if (!/^-?\d+$/.test(chatId)) {
    return NextResponse.json({ error: 'Enter the numeric Telegram chat id' }, { status: 400 });
  }

  const sellerId = String(user.id);

  try {
    await getTelegramChat(chatId);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Telegram rejected this chat id: ${error.message}`
            : 'Telegram rejected this chat id',
      },
      { status: 400 },
    );
  }

  try {
    await sendTelegramMessage({
      chatId,
      text: [
        '<b>LofiMart Telegram verification</b>',
        'You are about to link this Telegram chat to your LofiMart seller account.',
        'If you did not start this in LofiMart, ignore this message.',
      ].join('\n'),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `This bot cannot deliver messages to chat ${chatId}: ${error.message}`
            : `This bot cannot deliver messages to chat ${chatId}`,
      },
      { status: 400 },
    );
  }

  try {
    await (prisma.user as any).update({
      where: { id: sellerId },
      data: {
        telegramChatId: chatId,
        telegramLinkedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('[telegram] manual link failed', {
      sellerId,
      chatId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Could not save the chat id. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, linked: true, chat_id_masked: `${chatId.slice(0, 4)}...${chatId.slice(-3)}` });
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
