import { prisma } from '@/lib/server';
import type { TelegramUpdate } from '../types';
import { answerTelegramCallback, escapeTelegramHtml, getTelegramDashboardUrl, sendTelegramMessage } from './telegram';
import { updateSellerOrderStatus } from './orderService';
import { ensureRedis } from '@/features/shared/services/messaging/redis';

type TelegramConnectRole = 'seller' | 'admin' | 'reseller';

function parseStartPayload(text?: string) {
  const [rawCommand, payload] = String(text || '').trim().split(/\s+/, 2);
  const command = rawCommand?.split('@', 1)[0];
  if (command !== '/start' || !payload) return null;
  return payload;
}

function parseConnectPayload(payload: string | null): { role: TelegramConnectRole; userId: string } | null {
  const match = String(payload || '').match(/^(seller|admin|reseller)_(.+)$/);
  if (!match) return null;
  return {
    role: match[1] as TelegramConnectRole,
    userId: match[2].trim(),
  };
}

function dashboardPathForRole(role: TelegramConnectRole) {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'reseller') return '/reseller-dashboard/overview';
  return '/seller/dashboard';
}

function roleLabel(role: TelegramConnectRole) {
  if (role === 'admin') return 'admin';
  if (role === 'reseller') return 'reseller';
  return 'seller';
}

async function handleAccountOnboarding(update: TelegramUpdate) {
  const chatId = update.message?.chat.id;
  const text = update.message?.text;
  const payload = parseStartPayload(text);
  const connect = parseConnectPayload(payload);

  if (!chatId || !connect) return false;

  // Do not select the role field here. Production has a legacy role column
  // representation that can make Prisma fail while decoding the returned enum.
  const account = await (prisma.user as any).findFirst({
    where: {
      id: connect.userId,
      role: connect.role,
    },
    select: {
      id: true,
      name: true,
      storeName: true,
      telegramChatId: true,
    },
  });

  if (!account) {
    await sendTelegramMessage({
      chatId,
      text: `${roleLabel(connect.role)} account not found or not eligible for Telegram onboarding.`,
    });
    return true;
  }

  if (account.telegramChatId && account.telegramChatId !== String(chatId)) {
    await sendTelegramMessage({
      chatId,
      text: `This ${roleLabel(connect.role)} account is already linked to another Telegram chat.`,
    });
    return true;
  }

  await (prisma.user as any).update({
    where: { id: account.id },
    data: {
      telegramChatId: String(chatId),
      telegramLinkedAt: new Date(),
    },
  });

  await sendTelegramMessage({
    chatId,
    text: [
      '<b>LofiMart Telegram connected</b>',
      `Account: ${escapeTelegramHtml(account.storeName || account.name || roleLabel(connect.role))}`,
      `Role: ${escapeTelegramHtml(roleLabel(connect.role))}`,
      'You will now receive order, stock, payment, and commission alerts here.',
    ].join('\n'),
    buttons: [[{ text: 'Open Dashboard', web_app: { url: getTelegramDashboardUrl(dashboardPathForRole(connect.role)) } }]],
  });

  return true;
}

async function handleCallbackQuery(update: TelegramUpdate) {
  const query = update.callback_query;
  if (!query?.data || !query.message?.chat.id) return false;

  const [scope, action, orderId, sellerId] = query.data.split(':');
  if (scope !== 'order' || !action || !orderId || !sellerId) {
    await answerTelegramCallback(query.id, 'Unsupported action', true);
    return true;
  }

  try {
    const redis = await ensureRedis();
    const callbackKey = `telegram:callback:${query.id}`;
    const claimed = await redis.set(callbackKey, '1', 'EX', 300, 'NX');
    if (claimed !== 'OK') {
      await answerTelegramCallback(query.id, 'This action was already processed.', true);
      return true;
    }

    const mappedAction =
      action === 'accept'
        ? 'accept'
        : action === 'reject'
          ? 'reject'
          : action === 'ship'
            ? 'ship'
            : action === 'deliver'
              ? 'deliver'
              : null;

    if (!mappedAction) {
      await answerTelegramCallback(query.id, 'Unknown order action', true);
      return true;
    }

    const result = await updateSellerOrderStatus({
      chatId: query.message.chat.id,
      sellerId,
      orderId,
      action: mappedAction,
    });

    try {
      await answerTelegramCallback(query.id, `Order ${result.status}`);
    } catch (error) {
      console.error('[telegram] callback acknowledgement failed', { updateId: update.update_id, callbackQueryId: query.id, error });
    }
    return true;
  } catch (error) {
    console.error('[telegram] callback action failed', {
      updateId: update.update_id,
      callbackQueryId: query.id,
      error,
    });
    try {
      await answerTelegramCallback(
        query.id,
        error instanceof Error && error.message.length <= 180 ? error.message : 'Action failed',
        true,
      );
    } catch (ackError) {
      console.error('[telegram] callback error acknowledgement failed', { updateId: update.update_id, callbackQueryId: query.id, error: ackError });
    }
    return true;
  }
}

export async function processTelegramUpdate(update: TelegramUpdate) {
  if (await handleAccountOnboarding(update)) {
    return { handled: true };
  }

  if (await handleCallbackQuery(update)) {
    return { handled: true };
  }

  if (update.message?.chat.id) {
    await sendTelegramMessage({
      chatId: update.message.chat.id,
      text: [
        '<b>LofiMart Bot</b>',
        'Use your seller, reseller, or admin deep link to connect this chat.',
        'After linking, you can receive marketplace alerts and use supported action buttons.',
      ].join('\n'),
    });
  }

  return { handled: false };
}
