import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole, requireApiUser } from '../../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type IntegrationStatus = 'ready' | 'partial' | 'sandbox' | 'missing';

function item(key: string, label: string, status: IntegrationStatus, value: string, description: string) {
  return { key, label, status, value, description };
}

function hasAll(keys: string[]) {
  return keys.every((key) => Boolean(process.env[key]));
}

function isLiveBkashBaseUrl() {
  return String(process.env.BKASH_BASE_URL || '').includes('tokenized.pay.bka.sh');
}

async function requireAdmin(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  return requireAdminRole(user) || user;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const items = [
    item(
      'supabase',
      'Supabase Auth',
      hasAll(['NEXT_PUBLIC_SUPABASE_URL']) &&
        Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
        ? 'ready'
        : 'missing',
      process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Configured' : 'Missing URL',
      'Handles OAuth, account sessions, and auth callbacks.',
    ),
    item(
      'database',
      'PostgreSQL database',
      process.env.DATABASE_URL ? 'ready' : 'missing',
      process.env.DATABASE_URL ? 'Configured' : 'Missing DATABASE_URL',
      'Stores product, order, seller, and admin data.',
    ),
    item(
      'cloudinary',
      'Cloudinary media',
      hasAll(['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) ? 'ready' : 'missing',
      process.env.CLOUDINARY_CLOUD_NAME ? 'Configured' : 'Missing credentials',
      'Powers banner, product, and content image uploads.',
    ),
    item(
      'redis',
      'Redis cache',
      process.env.REDIS_URL ? 'ready' : 'partial',
      process.env.REDIS_URL ? 'Configured' : 'Memory fallback active',
      'Speeds cache, cart sync, sessions, and recovery workflows.',
    ),
    item(
      'bkash',
      'bKash payment',
      hasAll(['BKASH_APP_KEY', 'BKASH_APP_SECRET', 'BKASH_USERNAME', 'BKASH_PASSWORD'])
        ? isLiveBkashBaseUrl()
          ? 'ready'
          : 'sandbox'
        : 'missing',
      isLiveBkashBaseUrl() ? 'Live mode' : 'Sandbox or missing',
      'Supports mobile payment checkout when enabled.',
    ),
    item(
      'pathao',
      'Pathao courier',
      hasAll(['PATHAO_CLIENT_ID', 'PATHAO_CLIENT_SECRET']) ? 'ready' : 'partial',
      hasAll(['PATHAO_CLIENT_ID', 'PATHAO_CLIENT_SECRET']) ? 'API configured' : 'Manual mode',
      'Supports courier booking, store mapping, and delivery estimates.',
    ),
    item(
      'redx',
      'RedX courier',
      hasAll(['REDX_API_KEY', 'REDX_SECRET_KEY', 'REDX_BASE_URL']) ? 'ready' : 'partial',
      hasAll(['REDX_API_KEY', 'REDX_SECRET_KEY', 'REDX_BASE_URL']) ? 'API configured' : 'Manual mode',
      'Optional courier integration for shipping operations.',
    ),
    item(
      'steadfast',
      'Steadfast courier',
      hasAll(['STEADFAST_API_KEY', 'STEADFAST_SECRET_KEY']) ? 'ready' : 'partial',
      hasAll(['STEADFAST_API_KEY', 'STEADFAST_SECRET_KEY']) ? 'API configured' : 'Manual mode',
      'Optional courier integration for delivery operations.',
    ),
    item(
      'google-analytics',
      'Google Analytics 4',
      process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ? 'ready' : 'missing',
      process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ? 'Configured' : 'Missing measurement ID',
      'Tracks storefront traffic, page views, and conversion funnels through GA4.',
    ),
    item(
      'meta-pixel',
      'Meta/Facebook Pixel',
      process.env.NEXT_PUBLIC_META_PIXEL_ID ? 'ready' : 'missing',
      process.env.NEXT_PUBLIC_META_PIXEL_ID ? 'Configured' : 'Missing pixel ID',
      'Tracks ad attribution and retargeting events for Meta campaigns.',
    ),
    item(
      'telegram',
      'Telegram bot',
      hasAll(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME', 'TELEGRAM_WEBHOOK_SECRET']) ? 'ready' : 'missing',
      hasAll(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME']) ? 'Bot configured' : 'Missing bot credentials',
      'Sends seller order controls, inventory alerts, payment updates, and invoice documents to Telegram.',
    ),
  ];

  const summary = items.reduce(
    (acc, entry) => {
      acc[entry.status] += 1;
      return acc;
    },
    { ready: 0, partial: 0, sandbox: 0, missing: 0 },
  );

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    items,
    summary,
  });
}
