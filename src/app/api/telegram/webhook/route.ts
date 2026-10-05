import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { ensureRedis } from '@/features/shared/services/messaging/redis';
import { processTelegramUpdate, validateTelegramWebhookSecret, type TelegramUpdate } from '../../../../features/telegram_bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const webhookHits = new Map<string, { count: number; resetAt: number }>();
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

    const redis = await ensureRedis();
    const updateKey = `telegram:update:${update.update_id}`;
    const claimed = await redis.set(updateKey, '1', 'EX', 24 * 60 * 60, 'NX');

    if (claimed !== 'OK') {
      return NextResponse.json({ ok: true, already_processed: true });
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
