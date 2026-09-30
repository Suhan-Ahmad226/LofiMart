/**
 * Pathao webhook verification and parsing.
 *
 * Pathao signs deliveries with a shared secret in the `X-Password` header. Two
 * properties are non-negotiable:
 *
 *  - **Fail closed.** When no secret is configured, every delivery is rejected.
 *    An unconfigured endpoint that silently accepts traffic lets anyone forge
 *    "your parcel was delivered" events.
 *  - **Constant-time comparison.** A naive `===` leaks the secret byte by byte
 *    through response timing.
 *
 * Parsing is allowlist-based: only the fields needed to update a shipment are
 * extracted, so a webhook body never lands wholesale in the database and cannot
 * introduce unexpected columns.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { CourierWebhookError } from '../../core/errors';
import type { CourierWebhookEvent } from '../../core/contracts';
import { PATHAO_PROVIDER_CODE } from './pathaoConstants';
import { getPathaoWebhookSecret } from './pathaoClient';
import { mapPathaoStatus, pickPathaoStatusString } from './pathaoMapper';

/** Header Pathao signs deliveries with. */
const SIGNATURE_HEADERS = ['x-password', 'x-pathao-signature', 'x-signature'] as const;

function readSignature(headers: Headers): string | null {
  for (const header of SIGNATURE_HEADERS) {
    const value = headers.get(header);
    if (value && value.trim()) return value.trim();
  }
  return null;
}

/** Length-independent, timing-safe string comparison. */
function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  // `timingSafeEqual` throws on a length mismatch, which would itself leak the
  // length. Hashing first makes both operands a fixed 32 bytes.
  const leftDigest = createHmac('sha256', 'lofimart-webhook-compare').update(left).digest();
  const rightDigest = createHmac('sha256', 'lofimart-webhook-compare').update(right).digest();

  return timingSafeEqual(leftDigest, rightDigest);
}

/**
 * Verifies a webhook delivery.
 *
 * Returns `false` for a missing or unconfigured secret, a missing header, and a
 * mismatched signature. It never throws, so a caller can decide whether a
 * rejection is a 401 or a 503.
 */
export function verifyPathaoWebhookSignature(request: Request): boolean {
  const secret = getPathaoWebhookSecret();

  // Fail closed. Without a secret there is nothing to compare against, and
  // accepting would let anyone forge delivery confirmations.
  if (!secret) return false;

  const signature = readSignature(request.headers);
  if (!signature) return false;

  return safeCompare(signature, secret);
}

function readString(payload: Record<string, unknown>, field: string): string | null {
  const value = payload[field];
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Normalises a verified Pathao webhook body.
 *
 * Throws `CourierWebhookError` when the consignment cannot be identified: an
 * update we cannot attach to a shipment must not be applied to an arbitrary row.
 */
export async function parsePathaoWebhookPayload(payload: unknown): Promise<CourierWebhookEvent> {
  if (!payload || typeof payload !== 'object') {
    throw new CourierWebhookError(
      PATHAO_PROVIDER_CODE,
      'Webhook body was not a JSON object.',
    );
  }

  const body = payload as Record<string, unknown>;
  const nested = (body.data && typeof body.data === 'object' ? body.data : {}) as Record<
    string,
    unknown
  >;

  const externalShipmentId =
    readString(body, 'consignment_id') ??
    readString(body, 'order_id') ??
    readString(nested, 'consignment_id');

  const merchantReference =
    readString(body, 'merchant_order_id') ??
    readString(nested, 'merchant_order_id') ??
    readString(body, 'order_id');

  if (!externalShipmentId && !merchantReference) {
    throw new CourierWebhookError(
      PATHAO_PROVIDER_CODE,
      'Webhook body carried neither a consignment id nor a merchant reference.',
    );
  }

  const providerStatus = pickPathaoStatusString({ ...body, ...nested });

  // Allowlist. `invoice_id` is a courier invoice handle used to reconcile
  // charges; nothing customer-identifying is retained.
  const metadata: Record<string, unknown> = {};
  const invoiceId = readString(body, 'invoice_id') ?? readString(nested, 'invoice_id');
  if (invoiceId) metadata.invoiceId = invoiceId;

  const updatedAt = readString(body, 'updated_at') ?? readString(nested, 'updated_at');
  if (updatedAt) metadata.updatedAt = updatedAt;

  return {
    provider: PATHAO_PROVIDER_CODE,
    // Pathao does not always send a unique event id. When absent, the
    // consignment id plus the status is the strongest available dedupe handle
    // and is deliberately left to the service to combine.
    eventId: readString(body, 'event_id') ?? readString(body, 'notification_id'),
    externalShipmentId,
    merchantReference,
    status: mapPathaoStatus(providerStatus),
    providerStatus,
    occurredAt: updatedAt ?? null,
    metadata,
  };
}
