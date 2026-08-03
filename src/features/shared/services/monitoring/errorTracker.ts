import { logger } from '../../../../lib/logger';

export type ErrorContext = {
  scope: string;
  metadata?: Record<string, unknown>;
};

export function captureError(error: unknown, context: ErrorContext) {
  logger.error('error.captured', {
    scope: context.scope,
    metadata: context.metadata,
    error: error instanceof Error ? error.message : String(error),
  });
}
