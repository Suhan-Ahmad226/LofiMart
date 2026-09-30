/**
 * Courier error taxonomy.
 *
 * Every failure that crosses the provider boundary is normalized into one of
 * these categories before it reaches a service, a log line, or an HTTP
 * response. Two properties matter:
 *
 *  - `retryable` answers "is a blind retry safe?". A timeout is retryable for a
 *    *read* but NOT for a booking, because the parcel may already exist at the
 *    courier. `uncertain` is the flag that captures that difference.
 *  - `customerMessage` is the only text safe to show an end user. It never
 *    contains a provider name, an HTTP body, or a SQL fragment.
 *
 * The technical detail stays on `cause` / `details` for logs and admin
 * diagnostics.
 */

export type CourierErrorCode =
  | 'COURIER_CONFIGURATION'
  | 'COURIER_AUTHENTICATION'
  | 'COURIER_AUTHORIZATION'
  | 'COURIER_VALIDATION'
  | 'COURIER_RATE_LIMIT'
  | 'COURIER_NETWORK'
  | 'COURIER_TIMEOUT'
  | 'COURIER_BOOKING'
  | 'COURIER_TRACKING'
  | 'COURIER_WEBHOOK'
  | 'COURIER_RESPONSE'
  | 'COURIER_UNSUPPORTED'
  | 'COURIER_NOT_ENABLED'
  | 'COURIER_UNKNOWN';

export class CourierError extends Error {
  readonly code: CourierErrorCode;
  readonly provider: string;
  /** Safe to show an end user. Never contains provider internals. */
  readonly customerMessage: string;
  /** Whether a blind retry is safe for this operation. */
  readonly retryable: boolean;
  /**
   * True when the request may have been processed by the provider but the
   * response was lost. A booking in this state must be reconciled, never
   * blindly retried, or a duplicate physical parcel is created.
   */
  readonly uncertain: boolean;
  readonly httpStatus: number | null;
  readonly details: Record<string, unknown>;

  constructor(init: {
    code: CourierErrorCode;
    provider: string;
    message: string;
    customerMessage?: string;
    retryable?: boolean;
    uncertain?: boolean;
    httpStatus?: number | null;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = 'CourierError';
    this.code = init.code;
    this.provider = init.provider;
    this.customerMessage = init.customerMessage ?? 'We could not complete the courier request right now.';
    this.retryable = init.retryable ?? false;
    this.uncertain = init.uncertain ?? false;
    this.httpStatus = init.httpStatus ?? null;
    this.details = init.details ?? {};
  }
}

const DEFAULT_CUSTOMER_MESSAGES: Record<CourierErrorCode, string> = {
  COURIER_CONFIGURATION:
    'Courier delivery is being configured. Please try again shortly or contact support.',
  COURIER_AUTHENTICATION: 'The courier service is temporarily unavailable. Please try again shortly.',
  COURIER_AUTHORIZATION: 'This delivery option is not available for your selected store. Please choose another.',
  COURIER_VALIDATION: 'Some delivery details are not valid for our courier. Please review them and try again.',
  COURIER_RATE_LIMIT: 'The courier is handling a high volume right now. Please try again in a moment.',
  COURIER_NETWORK: 'We could not reach the courier right now. Please try again shortly.',
  COURIER_TIMEOUT: 'The courier did not respond in time. Please try again shortly.',
  COURIER_BOOKING: 'We could not create the shipment right now. Please try again.',
  COURIER_TRACKING: 'Tracking information is temporarily unavailable. Please try again shortly.',
  COURIER_WEBHOOK: 'The courier sent an update we could not read.',
  COURIER_RESPONSE: 'The courier returned an unexpected response. No shipment was created.',
  COURIER_UNSUPPORTED: 'This courier is not available.',
  COURIER_NOT_ENABLED: 'This courier is not available right now.',
  COURIER_UNKNOWN: 'Something went wrong with the courier service. Please try again.',
};

export function customerMessageFor(code: CourierErrorCode): string {
  return DEFAULT_CUSTOMER_MESSAGES[code];
}

export class CourierConfigurationError extends CourierError {
  constructor(provider: string, missingKeys: string[], cause?: unknown) {
    super({
      code: 'COURIER_CONFIGURATION',
      provider,
      message: `${provider} API credentials are missing: ${missingKeys.join(', ')}`,
      details: { missingKeys },
      cause,
    });
    this.name = 'CourierConfigurationError';
  }
}

export class CourierAuthenticationError extends CourierError {
  constructor(provider: string, status = 401, cause?: unknown) {
    super({
      code: 'COURIER_AUTHENTICATION',
      provider,
      message: `${provider} rejected the stored credentials (HTTP ${status}).`,
      httpStatus: status,
      details: { status },
      cause,
    });
    this.name = 'CourierAuthenticationError';
  }
}

/**
 * Authentication succeeded but the account is not permitted to perform the
 * operation. Pathao returns 403 when a merchant is not yet enabled for an
 * endpoint, which is a setup problem rather than a data problem, so it is
 * reported separately from `CourierValidationError`.
 */
export class CourierAuthorizationError extends CourierError {
  constructor(provider: string, status = 403, cause?: unknown) {
    super({
      code: 'COURIER_AUTHORIZATION',
      provider,
      message: `${provider} refused the operation for this account (HTTP ${status}).`,
      httpStatus: status,
      details: { status },
      cause,
    });
    this.name = 'CourierAuthorizationError';
  }
}

export class CourierValidationError extends CourierError {
  constructor(provider: string, message: string, details?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'COURIER_VALIDATION',
      provider,
      message,
      details,
      cause,
    });
    this.name = 'CourierValidationError';
  }
}

export class CourierRateLimitError extends CourierError {
  readonly retryAfterMs: number | null;

  constructor(provider: string, retryAfterMs: number | null = null, cause?: unknown) {
    super({
      code: 'COURIER_RATE_LIMIT',
      provider,
      message: `${provider} rate limit reached.`,
      retryable: true,
      httpStatus: 429,
      details: { retryAfterMs },
      cause,
    });
    this.name = 'CourierRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class CourierNetworkError extends CourierError {
  constructor(provider: string, message: string, cause?: unknown) {
    super({
      code: 'COURIER_NETWORK',
      provider,
      message,
      retryable: true,
      details: {},
      cause,
    });
    this.name = 'CourierNetworkError';
  }
}

export class CourierTimeoutError extends CourierError {
  constructor(provider: string, timeoutMs?: number, cause?: unknown) {
    super({
      code: 'COURIER_TIMEOUT',
      provider,
      message: timeoutMs
        ? `Courier request to ${provider} timed out after ${timeoutMs}ms.`
        : `Courier request to ${provider} timed out.`,
      retryable: true,
      // A timeout on a write is the classic duplicate-booking cause: the parcel
      // may already exist. Callers that create a parcel must treat this as
      // `uncertain` and reconcile rather than retry.
      uncertain: true,
      details: { timeoutMs: timeoutMs ?? null },
      cause,
    });
    this.name = 'CourierTimeoutError';
  }
}

export class CourierBookingError extends CourierError {
  constructor(provider: string, message: string, cause?: unknown, details?: Record<string, unknown>) {
    super({
      code: 'COURIER_BOOKING',
      provider,
      message,
      details: details ?? {},
      cause,
    });
    this.name = 'CourierBookingError';
  }
}

export class CourierTrackingError extends CourierError {
  constructor(provider: string, message: string, cause?: unknown) {
    super({
      code: 'COURIER_TRACKING',
      provider,
      message,
      retryable: true,
      cause,
    });
    this.name = 'CourierTrackingError';
  }
}

export class CourierWebhookError extends CourierError {
  constructor(provider: string, message: string, cause?: unknown) {
    super({
      code: 'COURIER_WEBHOOK',
      provider,
      message,
      cause,
    });
    this.name = 'CourierWebhookError';
  }
}

/**
 * A response we could not use. `retryable` is explicit because the same class
 * covers two opposite situations: a 5xx from the courier (retryable) and a 2xx
 * with a missing/unparseable field (not retryable, and on a booking it means
 * the outcome is unknown).
 */
export class CourierResponseError extends CourierError {
  constructor(
    provider: string,
    message: string,
    details?: Record<string, unknown>,
    cause?: unknown,
    init?: { retryable?: boolean; uncertain?: boolean },
  ) {
    super({
      code: 'COURIER_RESPONSE',
      provider,
      message,
      details: details ?? {},
      cause,
      retryable: init?.retryable,
      uncertain: init?.uncertain,
    });
    this.name = 'CourierResponseError';
  }
}

export class CourierUnsupportedError extends CourierError {
  constructor(provider: string) {
    super({
      code: 'COURIER_UNSUPPORTED',
      provider: provider || 'unknown',
      message: `Courier provider "${provider || 'unknown'}" is not supported.`,
    });
    this.name = 'CourierUnsupportedError';
  }
}

export class CourierNotEnabledError extends CourierError {
  constructor(provider: string) {
    super({
      code: 'COURIER_NOT_ENABLED',
      provider,
      message: `Courier provider "${provider}" is not enabled for this platform.`,
    });
    this.name = 'CourierNotEnabledError';
  }
}

export class CourierUnknownError extends CourierError {
  constructor(provider: string, cause?: unknown) {
    super({
      code: 'COURIER_UNKNOWN',
      provider,
      message: cause instanceof Error ? cause.message : `Unknown ${provider} courier failure.`,
      cause,
    });
    this.name = 'CourierUnknownError';
  }
}

const COURIER_ERROR_NAMES = new Set([
  'CourierError',
  'CourierConfigurationError',
  'CourierAuthenticationError',
  'CourierAuthorizationError',
  'CourierValidationError',
  'CourierRateLimitError',
  'CourierNetworkError',
  'CourierTimeoutError',
  'CourierBookingError',
  'CourierTrackingError',
  'CourierWebhookError',
  'CourierResponseError',
  'CourierUnsupportedError',
  'CourierNotEnabledError',
  'CourierUnknownError',
]);

export function isCourierError(value: unknown): value is CourierError {
  return value instanceof Error && COURIER_ERROR_NAMES.has(value.name) && 'code' in value;
}

export function asCourierError(provider: string, error: unknown): CourierError {
  if (isCourierError(error)) return error;
  return new CourierUnknownError(provider, error);
}

/**
 * Flattens an error for a log line: safe technical context, no secrets, no
 * customer PII. Never serializes the cause chain beyond the top message.
 */
export function describeCourierError(error: unknown): Record<string, unknown> {
  if (isCourierError(error)) {
    return {
      code: error.code,
      provider: error.provider,
      message: error.message,
      retryable: error.retryable,
      uncertain: error.uncertain,
      httpStatus: error.httpStatus,
      ...error.details,
    };
  }

  return {
    code: 'COURIER_UNKNOWN',
    message: error instanceof Error ? error.message : String(error),
  };
}
