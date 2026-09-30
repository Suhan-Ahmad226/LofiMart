/**
 * Shared helpers for provider-routed courier API routes.
 *
 * Routes under `/api/logistics/**` and `/api/admin/logistics/**` take a provider
 * as a path or query parameter and dispatch through the registry. These helpers
 * keep that dispatch — and the mapping from a courier error to an HTTP status —
 * in one place, so no route has to know a provider's name to exist.
 */

import { NextResponse } from 'next/server';

import {
  describeCourierError,
  isCourierError,
  type CourierErrorCode,
} from '@/features/courier/core/errors';
import { getCourierProviderView } from '@/features/courier/registry/providerRegistry';
import { logger } from '@/lib/logger';

/** Route path segments that are not courier codes. */
const RESERVED_SEGMENTS = new Set(['webhooks', 'providers', 'preview', 'shipments', 'stores', 'locations']);

/** Normalises a provider code from a path segment or query value. */
export function normalizeProviderCode(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

/**
 * 404 for a courier this deployment does not serve.
 *
 * Distinguishing "no such courier" from "courier is broken" matters: the first is
 * a configuration mistake in a webhook URL, the second is an outage, and they
 * need different responses.
 */
export function unsupportedProviderResponse(providerCode: string) {
  return NextResponse.json(
    { error: `Courier provider "${providerCode || 'unknown'}" is not available.`, provider: providerCode },
    { status: 404 },
  );
}

/** True when the segment is a provider code rather than a fixed route name. */
export function isProviderSegment(segment: string): boolean {
  return Boolean(segment) && !RESERVED_SEGMENTS.has(segment.toLowerCase());
}

/** The codes a client should see as its own fault rather than ours. */
const CLIENT_FAULT_CODES: ReadonlySet<CourierErrorCode> = new Set([
  'COURIER_VALIDATION',
  'COURIER_UNSUPPORTED',
  'COURIER_NOT_ENABLED',
  'COURIER_AUTHORIZATION',
]);

/**
 * Maps a courier error onto an HTTP response.
 *
 * The distinction that matters: a 4xx means the *caller* should change something,
 * a 5xx or 503 means the *caller* should retry. Getting this backwards either
 * makes a UI nag the user about their own input, or hides a real outage behind a
 * generic "something went wrong".
 *
 * Only `error.customerMessage` is ever returned. A raw provider body must not
 * reach a browser: Pathao returns internal diagnostics in its error payloads, and
 * those describe our server, not the shopper's mistake.
 */
export function courierErrorResponse(
  error: unknown,
  context: { operation: string; provider?: string },
): NextResponse {
  if (isCourierError(error)) {
    logger.error('Courier request failed.', {
      operation: context.operation,
      ...describeCourierError(error),
    });

    const status = CLIENT_FAULT_CODES.has(error.code)
      ? error.httpStatus && error.httpStatus >= 400 && error.httpStatus < 500
        ? error.httpStatus
        : 400
      : error.code === 'COURIER_RATE_LIMIT'
        ? 429
        : 503;

    return NextResponse.json(
      {
        error: error.customerMessage,
        code: error.code,
        // Lets a client distinguish "fix your input" from "try again" without
        // parsing prose.
        retryable: error.retryable,
      },
      { status },
    );
  }

  logger.error('Unhandled courier request failure.', {
    operation: context.operation,
    provider: context.provider,
    reason: error instanceof Error ? error.message : 'Unknown error',
  });

  return NextResponse.json(
    { error: 'Something went wrong with the courier service. Please try again.', code: 'COURIER_UNKNOWN' },
    { status: 500 },
  );
}

/** Resolves a provider view for a route guard, or a 404 response. */
export function requireProviderViewOr404(providerCode: string) {
  const view = getCourierProviderView(providerCode);
  if (!view) return { view: null, response: unsupportedProviderResponse(providerCode) };
  return { view, response: null };
}
