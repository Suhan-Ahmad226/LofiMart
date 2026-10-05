import { prisma } from '@/lib/server';
import type { TelegramUpdate } from '../types';
import { answerTelegramCallback, escapeTelegramHtml, getTelegramDashboardUrl, sendTelegramMessage } from './telegram';
import { updateSellerOrderStatus } from './orderService';

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

  // Persisting the link is the whole point of this update, so it gets its own
  // error handling. Without it a database failure surfaces as an opaque
  // platform-level 500 and Telegram retries the update forever.
  try {
    await (prisma.user as any).update({
      where: { id: account.id },
      data: {
        telegramChatId: String(chatId),
        telegramLinkedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('[telegram] failed to persist account link', {
      updateId: update.update_id,
      accountId: account.id,
      chatId: String(chatId),
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    await sendTelegramMessage({
      chatId,
      text: [
        '<b>Could not finish linking your account</b>',
        'Your Telegram account is fine, but the LofiMart database rejected the link.',
        'Please retry in a moment, or link your chat id manually from the seller panel.',
      ].join('\n'),
    }).catch(() => undefined);

    return true;
  }

  // The link is already committed at this point. The confirmation message is
  // best-effort: a Telegram API failure must not be reported as a failed
  // connect, otherwise the seller reconnects forever against a linked account.
  await sendTelegramMessage({
    chatId,
    text: [
      '<b>LofiMart Telegram connected</b>',
      `Account: ${escapeTelegramHtml(account.storeName || account.name || roleLabel(connect.role))}`,
      `Role: ${escapeTelegramHtml(roleLabel(connect.role))}`,
      'You will now receive order, stock, payment, and commission alerts here.',
    ].join('\n'),
    buttons: [[{ text: 'Open Dashboard', web_app: { url: getTelegramDashboardUrl(dashboardPathForRole(connect.role)) } }]],
  }).catch((error: unknown) => {
    console.error('[telegram] account linked but confirmation message failed', {
      updateId: update.update_id,
      accountId: account.id,
      error: error instanceof Error ? error.message : String(error),
    });
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

    await answerTelegramCallback(query.id, `Order ${result.status}`);
    return true;
  } catch (error) {
    console.error('[telegram] callback action failed', {
      updateId: update.update_id,
      callbackQueryId: query.id,
      error,
    });
    await answerTelegramCallback(
      query.id,
      error instanceof Error ? error.message : 'Action failed',
      true,
    );
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
    const chatId = update.message.chat.id;
    await sendTelegramMessage({
      chatId,
      text: [
        '<b>LofiMart Bot</b>',
        'Use your seller, reseller, or admin deep link to connect this chat.',
        'After linking, you can receive marketplace alerts and use supported action buttons.',
        '',
        `Your Telegram chat id is <code>${chatId}</code>.`,
        'If the deep link does not connect your account, paste this id into the',
        '"Link manually" box on your LofiMart seller Telegram panel.',
      ].join('\n'),
    });
  }

  return { handled: false };
}
