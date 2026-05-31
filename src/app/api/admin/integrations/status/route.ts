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
        ? process.env.BKASH_SANDBOX === 'false'
          ? 'ready'
          : 'sandbox'
        : 'missing',
      process.env.BKASH_SANDBOX === 'false' ? 'Live mode' : 'Sandbox or missing',
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
      process.env.REDX_API_TOKEN ? 'ready' : 'partial',
      process.env.REDX_API_TOKEN ? 'API configured' : 'Manual mode',
      'Optional courier integration for shipping operations.',
    ),
    item(
      'steadfast',
      'Steadfast courier',
      hasAll(['STEADFAST_API_KEY', 'STEADFAST_SECRET_KEY']) ? 'ready' : 'partial',
      hasAll(['STEADFAST_API_KEY', 'STEADFAST_SECRET_KEY']) ? 'API configured' : 'Manual mode',
      'Optional courier integration for delivery operations.',
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
