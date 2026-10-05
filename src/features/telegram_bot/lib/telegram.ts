import crypto from 'node:crypto';
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

const TELEGRAM_REQUEST_TIMEOUT_MS = 8_000;
const TELEGRAM_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function isRetryableNetworkError(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))
  );
}

async function telegramFetch<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const url = apiUrl(method);
  const body = JSON.stringify(payload);
  let lastError: unknown;

  // Telegram is called from inside webhook handlers, so a single stalled
  // request can otherwise hold the whole function open until the platform
  // terminates it. Bound every attempt and retry only transient failures.
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TELEGRAM_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });

      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        description?: string;
        result?: T;
      } | null;

      if (response.ok && data?.ok) {
        return data.result as T;
      }

      const description = data?.description || `Telegram ${method} failed`;
      if (!TELEGRAM_RETRYABLE_STATUS.has(response.status) || attempt === 1) {
        throw new Error(description);
      }

      lastError = new Error(description);
    } catch (error) {
      const canRetry = isRetryableNetworkError(error);
      if (!canRetry || attempt === 1) {
        throw error;
      }
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Telegram ${method} failed`);
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

type TelegramChat = {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
};

export function isTelegramBotConfigured() {
  return Boolean(getBotToken());
}

export async function getTelegramChat(chatId: string | number) {
  return telegramFetch<TelegramChat>('getChat', { chat_id: chatId });
}

export async function getTelegramWebhookInfo() {
  return telegramFetch<{
    url: string;
    pending_update_count: number;
    last_error_message?: string;
    last_error_date?: number;
    allowed_updates?: string[];
  }>('getWebhookInfo', {});
}

export function validateTelegramWebhookSecret(headers: Headers) {
  const expected = getServerEnv().TELEGRAM_WEBHOOK_SECRET;
  if (!expected) {
    return process.env.NODE_ENV !== 'production';
  }

  const provided = headers.get('x-telegram-bot-api-secret-token') || '';
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}
