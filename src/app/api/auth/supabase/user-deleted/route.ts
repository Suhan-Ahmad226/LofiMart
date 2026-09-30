import { NextRequest, NextResponse } from 'next/server';
import { getServerEnv } from '@/lib/env';
import { enqueueUserMediaCleanup } from '@/lib/media';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getBearerToken(request: NextRequest) {
  const header = request.headers.get('authorization') || '';
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

export async function POST(request: NextRequest) {
  const secret = getServerEnv().SUPABASE_AUTH_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Supabase auth cleanup webhook is not configured' }, { status: 503 });
  }

  const providedSecret = request.headers.get('x-lofimart-webhook-secret') || getBearerToken(request);
  if (providedSecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const record = body?.record || body?.old_record || body?.user || body;
  const supabaseAuthId = typeof record?.id === 'string' ? record.id : null;
  const email = typeof record?.email === 'string' ? record.email : null;

  if (!supabaseAuthId && !email) {
    return NextResponse.json({ error: 'Missing Supabase user identifier' }, { status: 400 });
  }

  await enqueueUserMediaCleanup({
    supabaseAuthId,
    email,
    reason: 'supabase-auth-user-deleted',
  });

  logger.info('USER_MEDIA_CLEANUP_STARTED', {
    reason: 'supabase-auth-user-deleted-webhook',
    hasSupabaseAuthId: Boolean(supabaseAuthId),
    hasEmail: Boolean(email),
  });

  return NextResponse.json({ success: true, queued: true });
}
