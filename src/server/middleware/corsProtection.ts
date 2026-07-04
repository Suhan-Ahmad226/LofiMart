import type { RequestHandler } from 'express';
import { getServerEnv } from '../../lib/env';
import { isAllowedRequestOrigin } from '../security/origin';

function buildCorsHeaders(origin: string | undefined, host: string | undefined) {
  const env = getServerEnv();
  const allowOrigin = origin && isAllowedRequestOrigin(origin, host) ? origin : env.FRONTEND_URL;

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Requested-With,X-Request-Id',
    Vary: 'Origin',
  };
}

export const corsProtection: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;
  const headers = buildCorsHeaders(origin, req.headers.host);

  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (origin && !isAllowedRequestOrigin(origin, req.headers.host)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
};
