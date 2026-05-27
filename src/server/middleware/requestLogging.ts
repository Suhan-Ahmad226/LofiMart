import type { RequestHandler } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../../lib/logger';

export const requestLogger: RequestHandler = (req, res, next) => {
  const requestId = req.headers['x-request-id']?.toString() || randomUUID();
  const startedAt = Date.now();

  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    logger.info('request.completed', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      userAgent: req.headers['user-agent'] || 'unknown',
    });
  });

  next();
};
