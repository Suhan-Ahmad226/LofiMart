import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { processTelegramUpdate, validateTelegramWebhookSecret, type TelegramUpdate } from '../../../../features/telegram_bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const webhookHits = new Map<string, { count: number; resetAt: number }>();
const processedUpdateIds = new Set<number>();
const MAX_PROCESSED_IDS = 1000;

function rateLimit(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const now = Date.now();
  const windowMs = 60_000;
  const max = 120;
  const current = webhookHits.get(ip);

  if (!current || current.resetAt <= now) {
    webhookHits.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }

  current.count += 1;
  return current.count > max;
}

export async function POST(request: NextRequest) {
  try {
    if (rateLimit(request)) {
      return NextResponse.json({ error: 'Too many Telegram updates' }, { status: 429 });
    }

    if (!validateTelegramWebhookSecret(request.headers)) {
      return NextResponse.json({ error: 'Invalid Telegram webhook secret' }, { status: 401 });
    }

    const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
    if (!update || typeof update.update_id !== 'number') {
      return NextResponse.json({ error: 'Invalid Telegram update' }, { status: 400 });
    }

    if (processedUpdateIds.has(update.update_id)) {
      return NextResponse.json({ ok: true, already_processed: true });
    }

    processedUpdateIds.add(update.update_id);
    if (processedUpdateIds.size > MAX_PROCESSED_IDS) {
      const oldestId = processedUpdateIds.values().next().value;
      if (oldestId !== undefined) {
        processedUpdateIds.delete(oldestId);
      }
    }

    // Acknowledge before touching the database or Telegram. Telegram treats
    // any non-2xx response as a failed delivery and retries with backoff, so a
    // slow or fragile downstream step must never delay or replace the 200.
    after(async () => {
      try {
        await processTelegramUpdate(update);
      } catch (error) {
        console.error('[telegram] webhook processing failed', {
          updateId: update.update_id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[telegram] webhook request failed', {
      error,
    });

    // Keep malformed/internal processing failures from producing repeated
    // Telegram webhook retries after the request has been safely parsed.
    return NextResponse.json({ ok: true, error: 'Webhook processing failed' });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'lofimart-telegram-webhook',
  });
}
