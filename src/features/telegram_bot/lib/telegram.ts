import { getServerEnv } from '../../../lib/env';
import type { TelegramInlineKeyboardButton } from '../types';

type SendMessageInput = {
  chatId: string | number;
  text: string;
  buttons?: TelegramInlineKeyboardButton[][];
  disableWebPagePreview?: boolean;
};

type SendDocumentInput = {
  chatId: string | number;
  documentUrl: string;
  caption?: string;
  buttons?: TelegramInlineKeyboardButton[][];
};

function getBotToken() {
  return getServerEnv().TELEGRAM_BOT_TOKEN || '';
}

function apiUrl(method: string) {
  const token = getBotToken();
  if (!token) {
    throw new Error('Telegram bot token is not configured');
  }

  return `https://api.telegram.org/bot${token}/${method}`;
}

async function telegramFetch<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(apiUrl(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => null)) as {
    ok?: boolean;
    description?: string;
    result?: T;
  } | null;
  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram ${method} failed`);
  }

  return data.result as T;
}

export function escapeTelegramHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function getTelegramDashboardUrl(path = '/seller/dashboard') {
  const baseUrl = getServerEnv().FRONTEND_URL;
  return new URL(path, baseUrl).toString();
}

export function getSellerDeepLink(sellerId: string) {
  return getTelegramDeepLink('seller', sellerId);
}

export function getTelegramDeepLink(role: 'seller' | 'admin' | 'reseller', userId: string) {
  const username = getServerEnv().TELEGRAM_BOT_USERNAME;
  if (!username) return null;
  return `https://t.me/${username.replace(/^@/, '')}?start=${role}_${userId}`;
}

export async function sendTelegramMessage(input: SendMessageInput) {
  return telegramFetch('sendMessage', {
    chat_id: input.chatId,
    text: input.text,
    parse_mode: 'HTML',
    disable_web_page_preview: input.disableWebPagePreview ?? true,
    ...(input.buttons
      ? {
          reply_markup: {
            inline_keyboard: input.buttons,
          },
        }
      : {}),
  });
}

export async function sendTelegramDocument(input: SendDocumentInput) {
  return telegramFetch('sendDocument', {
    chat_id: input.chatId,
    document: input.documentUrl,
    caption: input.caption,
    parse_mode: 'HTML',
    ...(input.buttons
      ? {
          reply_markup: {
            inline_keyboard: input.buttons,
          },
        }
      : {}),
  });
}

export async function answerTelegramCallback(callbackQueryId: string, text: string, showAlert = false) {
  return telegramFetch('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

export function validateTelegramWebhookSecret(headers: Headers) {
  const expected = getServerEnv().TELEGRAM_WEBHOOK_SECRET;
  if (!expected) {
    return process.env.NODE_ENV !== 'production';
  }

  return headers.get('x-telegram-bot-api-secret-token') === expected;
}
