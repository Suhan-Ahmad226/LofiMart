import { NextRequest, NextResponse } from 'next/server';
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

  await processTelegramUpdate(update);

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'lofimart-telegram-webhook',
  });
}
