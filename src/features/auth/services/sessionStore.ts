import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getServerEnv } from '@/src/lib/env';
import { ensureRedis } from '@/src/services/messaging/redis';
import { getSecureCookieOptions } from '@/src/server/security/cookies';

export type SessionUser = {
  id: number | string;
  email?: string;
  name?: string;
  role: string;
  tenantId?: string | null;
};

const CUSTOMER_SESSION_TTL_SECONDS = 24 * 60 * 60;
const PRIVILEGED_SESSION_TTL_SECONDS = 60 * 60;

type PersistedSession = {
  sid: string;
  user: SessionUser;
  refreshToken: string;
  createdAt: string;
  expiresAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceName?: string | null;
  location?: string | null;
};

function sessionKey(sid: string) {
  return `${getServerEnv().REDIS_PREFIX}:session:${sid}`;
}

function refreshKey(token: string) {
  return `${getServerEnv().REDIS_PREFIX}:refresh:${token}`;
}

function userSessionsKey(userId: string | number) {
  return `${getServerEnv().REDIS_PREFIX}:user-sessions:${userId}`;
}

function getSessionTtlSecondsForRole(role: string) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (normalizedRole === 'customer') {
    return CUSTOMER_SESSION_TTL_SECONDS;
  }

  if (normalizedRole === 'seller' || normalizedRole === 'reseller' || normalizedRole === 'admin') {
    return PRIVILEGED_SESSION_TTL_SECONDS;
  }

  return getServerEnv().SESSION_TTL_SECONDS;
}

function accessTokenExpiresInSeconds(user?: SessionUser) {
  return user ? getSessionTtlSecondsForRole(user.role) : 15 * 60;
}

function sessionExpiresInSeconds(user?: SessionUser) {
  return user ? getSessionTtlSecondsForRole(user.role) : getServerEnv().SESSION_TTL_SECONDS;
}

function allowStatelessSessionFallback() {
  return process.env.NODE_ENV !== 'production';
}

export function getAccessCookieOptions(user?: SessionUser) {
  return getSecureCookieOptions(accessTokenExpiresInSeconds(user));
}

export function getRefreshCookieOptions(user?: SessionUser) {
  return getSecureCookieOptions(sessionExpiresInSeconds(user));
}

export function signAccessToken(user: SessionUser, sid: string) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      email: user.email,
      tenantId: user.tenantId,
      sid,
    },
    getServerEnv().JWT_SECRET,
    { expiresIn: `${accessTokenExpiresInSeconds(user)}s` },
  );
}

type CreateSessionMetadata = {
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceName?: string | null;
  location?: string | null;
};

export async function createSession(user: SessionUser, metadata: CreateSessionMetadata = {}) {
  const sid = crypto.randomUUID();
  const refreshToken = crypto.randomUUID();
  const sessionTtlSeconds = sessionExpiresInSeconds(user);
  const expiresAt = new Date(Date.now() + sessionTtlSeconds * 1000);
  const session: PersistedSession = {
    sid,
    user,
    refreshToken,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    ipAddress: metadata.ipAddress ?? null,
    userAgent: metadata.userAgent ?? null,
    deviceName: metadata.deviceName ?? null,
    location: metadata.location ?? null,
  };

  try {
    const redis = await ensureRedis();
    await redis.multi()
      .set(sessionKey(sid), JSON.stringify(session), 'EX', sessionTtlSeconds)
      .set(refreshKey(refreshToken), sid, 'EX', sessionTtlSeconds)
      .sadd(userSessionsKey(user.id), sid)
      .expire(userSessionsKey(user.id), sessionTtlSeconds)
      .exec();
  } catch (error) {
    if (!allowStatelessSessionFallback()) {
      throw error;
    }

    console.warn('[auth] Redis session store unavailable; using development stateless session fallback.');
  }

  return {
    session,
    accessToken: signAccessToken(user, sid),
    refreshToken,
    expiresAt,
  };
}

export async function getSessionById(sid: string) {
  const redis = await ensureRedis();
  const raw = await redis.get(sessionKey(sid));
  return raw ? (JSON.parse(raw) as PersistedSession) : null;
}

export async function listSessionsForUser(userId: string | number) {
  const redis = await ensureRedis();
  const sessionIds = await redis.smembers(userSessionsKey(userId));
  const sessions = await Promise.all(sessionIds.map((sid) => getSessionById(sid)));

  return sessions.filter(Boolean).sort((a, b) => {
    return new Date(b!.createdAt).getTime() - new Date(a!.createdAt).getTime();
  }) as PersistedSession[];
}

async function revokeSessionById(sid: string) {
  const redis = await ensureRedis();
  const session = await getSessionById(sid);
  if (!session) return;

  await redis.multi()
    .del(sessionKey(sid))
    .del(refreshKey(session.refreshToken))
    .srem(userSessionsKey(session.user.id), sid)
    .exec();
}

export async function revokeSessionByRefreshToken(refreshToken: string) {
  const redis = await ensureRedis();
  const sid = await redis.get(refreshKey(refreshToken));
  if (!sid) return;
  await revokeSessionById(sid);
}

export async function rotateSession(refreshToken: string) {
  const redis = await ensureRedis();
  const sid = await redis.get(refreshKey(refreshToken));
  if (!sid) {
    return null;
  }

  const session = await getSessionById(sid);
  if (!session) {
    await redis.del(refreshKey(refreshToken));
    return null;
  }

  const sessionTtlSeconds = sessionExpiresInSeconds(session.user);
  const newRefreshToken = crypto.randomUUID();
  const updatedSession: PersistedSession = {
    ...session,
    refreshToken: newRefreshToken,
    expiresAt: new Date(Date.now() + sessionTtlSeconds * 1000).toISOString(),
  };

  await redis.multi()
    .del(refreshKey(refreshToken))
    .set(sessionKey(sid), JSON.stringify(updatedSession), 'EX', sessionTtlSeconds)
    .set(refreshKey(newRefreshToken), sid, 'EX', sessionTtlSeconds)
    .exec();

  return {
    session: updatedSession,
    accessToken: signAccessToken(updatedSession.user, sid),
    refreshToken: newRefreshToken,
    expiresAt: new Date(updatedSession.expiresAt),
  };
}

export async function revokeAllSessionsForUser(userId: string | number) {
  const redis = await ensureRedis();
  const key = userSessionsKey(userId);
  const sessionIds = await redis.smembers(key);

  if (!sessionIds.length) return;

  for (const sid of sessionIds) {
    await revokeSessionById(sid);
  }

  await redis.del(key);
}

export async function validateAccessToken(token: string) {
  const payload = jwt.verify(token, getServerEnv().JWT_SECRET) as SessionUser & { sid?: string };
  if (!payload.sid) {
    throw new Error('Missing session id');
  }

  let session: PersistedSession | null = null;
  try {
    session = await getSessionById(payload.sid);
  } catch (error) {
    if (!allowStatelessSessionFallback()) {
      throw error;
    }
  }

  if (!session) {
    if (allowStatelessSessionFallback()) {
      return payload;
    }

    throw new Error('Session expired');
  }

  if (String(session.user.id) !== String(payload.id)) {
    throw new Error('Session mismatch');
  }

  return {
    ...session.user,
    sid: session.sid,
  };
}
