import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getServerEnv } from '@/lib/env';
import { runDueSocialWork } from '@/features/social-automation/services/runner.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function GET(request: NextRequest) {
  const env = getServerEnv();
  const expected = env.CRON_SECRET || env.SOCIAL_AUTOMATION_WORKER_TOKEN;
  const authorization = request.headers.get('authorization') ?? '';
  const provided = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';

  if (!expected || !provided || !safeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const result = await runDueSocialWork();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Social automation cron failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
