import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getServerEnv } from '@/lib/env';
import { getRedis, ensureRedis } from '@/features/shared/services/messaging/redis';
import { getSocialAutomationStatus, runDueSocialWork } from '@/features/social-automation/services/runner.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REPLAY_WINDOW_MS = 5 * 60 * 1000;
const DEDUPE_TTL_SECONDS = 60;
const MAX_BODY_BYTES = 4096;

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function readToken(request: NextRequest) {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
}

async function verifyRequest(request: NextRequest): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const env = getServerEnv();
  const expected = env.SOCIAL_AUTOMATION_WORKER_TOKEN;
  if (!expected) {
    return { ok: false, status: 503, error: 'Worker token is not configured.' };
  }

  const provided = readToken(request);
  if (!provided || !safeEqual(provided, expected)) {
    return { ok: false, status: 401, error: 'Unauthorized.' };
  }

  const timestampHeader = request.headers.get('x-social-timestamp') ?? '';
  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, status: 400, error: 'Missing or invalid x-social-timestamp header.' };
  }
  if (Math.abs(Date.now() - timestamp) > REPLAY_WINDOW_MS) {
    return { ok: false, status: 400, error: 'Request is outside the allowed time window.' };
  }

  const requestId = request.headers.get('x-social-request-id') ?? '';
  if (!requestId || requestId.length > 128) {
    return { ok: false, status: 400, error: 'Missing or invalid x-social-request-id header.' };
  }

  return { ok: true };
}

async function deduplicateRequest(requestId: string): Promise<boolean> {
  try {
    const redis = await ensureRedis();
    const key = `social-run:${requestId}`;
    const result = await redis.set(key, String(Date.now()), 'EX', DEDUPE_TTL_SECONDS, 'NX');
    return result === 'OK';
  } catch {
    // Redis unavailable: rely on the DB-level claim lease + per-cycle unique run
    // row that already make a duplicated trigger harmless.
    return true;
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const requestId = request.headers.get('x-social-request-id') ?? '';
  const replayed = !(await deduplicateRequest(requestId));
  if (replayed) {
    return NextResponse.json({ ok: true, error: 'Duplicate request within the dedupe window.' }, { status: 200 });
  }

  try {
    const pendingBody = await request.text();
    if (pendingBody && Buffer.byteLength(pendingBody, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Body too large.' }, { status: 413 });
    }

    const result = await runDueSocialWork();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Worker run failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = await verifyRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    return NextResponse.json(await getSocialAutomationStatus());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Status check failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}