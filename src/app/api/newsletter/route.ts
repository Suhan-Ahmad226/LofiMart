import { NextRequest, NextResponse } from 'next/server';
import { prismaDirect } from '../../../features/shared/services/database/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NEWSLETTER_SETTING_KEY = 'newsletter_subscribers';
const MAX_STORED_SUBSCRIBERS = 5000;

type NewsletterSubscriber = {
  email: string;
  source: string;
  subscribedAt: string;
};

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseSubscribers(value: string | null | undefined): NewsletterSubscriber[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => ({
        email: normalizeEmail(entry?.email),
        source: String(entry?.source || 'unknown').slice(0, 40),
        subscribedAt: String(entry?.subscribedAt || new Date().toISOString()),
      }))
      .filter((entry) => isValidEmail(entry.email));
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const source = String(body?.source || 'footer').slice(0, 40);

  try {
    const current = await prismaDirect.platformSetting.findUnique({
      where: { key: NEWSLETTER_SETTING_KEY },
    });
    const subscribers = parseSubscribers(current?.value);
    const alreadySubscribed = subscribers.some((entry) => entry.email === email);

    if (!alreadySubscribed) {
      const nextSubscribers = [
        { email, source, subscribedAt: new Date().toISOString() },
        ...subscribers,
      ].slice(0, MAX_STORED_SUBSCRIBERS);

      await prismaDirect.platformSetting.upsert({
        where: { key: NEWSLETTER_SETTING_KEY },
        create: {
          key: NEWSLETTER_SETTING_KEY,
          value: JSON.stringify(nextSubscribers),
        },
        update: {
          value: JSON.stringify(nextSubscribers),
        },
      });
    }

    return NextResponse.json({ success: true, alreadySubscribed });
  } catch (error) {
    console.error('POST /api/newsletter error:', error);
    return NextResponse.json({ error: 'Newsletter signup is temporarily unavailable.' }, { status: 500 });
  }
}
