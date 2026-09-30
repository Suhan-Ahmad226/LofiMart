import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getServerEnv } from '@/lib/env';

export const PASSWORD_RESET_SESSION_COOKIE = 'lofimart_password_reset';
export const PASSWORD_RESET_SESSION_TTL_SECONDS = 5 * 60;

type ResetSessionRecord = {
  email: string;
  supabaseAuthId: string | null;
  createdAt: string;
};

const memorySessions = new Map<string, { value: string; expiresAt: number }>();

function hashResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function getRedisPrefix() {
  try {
    return getServerEnv().REDIS_PREFIX;
  } catch {
    return 'lofimart';
  }
}

function getResetSessionKey(token: string) {
  return `${getRedisPrefix()}:auth:password-reset:${hashResetToken(token)}`;
}

function isProductionEnv() {
  try {
    const env = getServerEnv();
    return env.APP_ENV === 'production' || process.env.NODE_ENV === 'production';
  } catch {
    return process.env.NODE_ENV === 'production';
  }
}

async function setResetRecord(key: string, record: ResetSessionRecord) {
  const value = JSON.stringify(record);

  try {
    const { ensureRedis } = await import('@/features/shared/services/messaging/redis');
    const redis = await ensureRedis();
    await redis.set(key, value, 'EX', PASSWORD_RESET_SESSION_TTL_SECONDS);
    return;
  } catch (error) {
    if (isProductionEnv()) {
      throw error;
    }

    memorySessions.set(key, {
      value,
      expiresAt: Date.now() + PASSWORD_RESET_SESSION_TTL_SECONDS * 1000,
    });
  }
}

async function takeResetRecord(key: string): Promise<ResetSessionRecord | null> {
  let raw: string | null = null;

  try {
    const { ensureRedis } = await import('@/features/shared/services/messaging/redis');
    const redis = await ensureRedis();
    raw = typeof redis.getdel === 'function' ? await redis.getdel(key) : await redis.get(key);

    if (raw && typeof redis.getdel !== 'function') {
      await redis.del(key);
    }
  } catch (error) {
    if (isProductionEnv()) {
      throw error;
    }

    const record = memorySessions.get(key);
    memorySessions.delete(key);

    if (record && record.expiresAt > Date.now()) {
      raw = record.value;
    }
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ResetSessionRecord>;
    if (typeof parsed.email !== 'string' || typeof parsed.createdAt !== 'string') {
      return null;
    }

    return {
      email: parsed.email,
      supabaseAuthId: typeof parsed.supabaseAuthId === 'string' ? parsed.supabaseAuthId : null,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

export async function createPasswordResetSession(input: {
  email: string;
  supabaseAuthId: string | null;
}) {
  const token = randomBytes(32).toString('base64url');
  const key = getResetSessionKey(token);

  await setResetRecord(key, {
    email: input.email,
    supabaseAuthId: input.supabaseAuthId,
    createdAt: new Date().toISOString(),
  });

  return {
    token,
    expiresAt: new Date(Date.now() + PASSWORD_RESET_SESSION_TTL_SECONDS * 1000).toISOString(),
    expiresInSeconds: PASSWORD_RESET_SESSION_TTL_SECONDS,
  };
}

export async function consumePasswordResetSession(input: {
  token: string | null | undefined;
  email: string;
}): Promise<ResetSessionRecord | null> {
  if (!input.token) {
    return null;
  }

  const record = await takeResetRecord(getResetSessionKey(input.token));
  if (!record || record.email !== input.email) {
    return null;
  }

  return record;
}

export function attachPasswordResetSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(PASSWORD_RESET_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: PASSWORD_RESET_SESSION_TTL_SECONDS,
  });
}

export function clearPasswordResetSessionCookie(response: NextResponse) {
  response.cookies.set(PASSWORD_RESET_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
