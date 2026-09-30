/**
 * Zod schemas for the Pathao responses this project acts on.
 *
 * Scope rule: validate strictly only the fields the integration depends on
 * (consignment id, status, charges, locations). Everything else is passed
 * through untouched, so Pathao adding a field can never break the app and the
 * pass-through city/zone/area lists keep rendering in the admin UI.
 *
 * A raw `ZodError` never escapes this module: a malformed response becomes a
 * typed `CourierResponseError` whose message contains field paths only, never
 * the payload, because the payload can carry customer PII.
 */

import { z } from 'zod';

import { CourierResponseError } from '../../core/errors';
import { PATHAO_PROVIDER_CODE } from './pathaoConstants';

/**
 * Consignment and store ids become the stored tracking id, so they are
 * restricted to numbers or digit-only strings. A loose `z.string()` would let a
 * malformed response (an error object, a message) become a tracking number the
 * courier can never match.
 */
const numericId = z.union([
  z.number().finite(),
  z.string().trim().regex(/^\d+$/, 'Expected a numeric id'),
]);

/**
 * Parses a courier flag without the truthiness trap of `z.coerce.boolean()`,
 * which evaluates `Boolean('false')` and `Boolean('0')` to `true` and would
 * silently invert an `is_active` / `cod_enabled` answer.
 */
const flagBoolean = z
  .union([z.boolean(), z.literal(0), z.literal(1), z.literal('0'), z.literal('1')])
  .transform((value) => value === true || value === 1 || value === '1');

/** Pathao amounts arrive as either a number or a numeric string. */
const moneyish = z.union([z.number().finite(), z.string().trim()]);

/* -------------------------------------------------------------------- token */

export const PathaoTokenSchema = z.object({
  token_type: z.string().trim().min(1).default('Bearer'),
  access_token: z.string().trim().min(1),
  refresh_token: z.string().trim().min(1).nullish(),
  expires_in: z.coerce.number().finite().positive(),
});

/**
 * Parses a token response into the internal bundle shape.
 *
 * `issuedAt` is stamped locally rather than trusted from the response, because
 * freshness is decided by comparing it against the local clock.
 */
export function parsePathaoToken(payload: unknown): {
  tokenType: string;
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  issuedAt: number;
} {
  const parsed = parsePathaoPayload(
    PathaoTokenSchema,
    payload,
    'Pathao token request',
  );

  return {
    tokenType: parsed.token_type,
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? null,
    expiresIn: parsed.expires_in,
    issuedAt: Date.now(),
  };
}

/* --------------------------------------------------------------------- list */

/**
 * Pathao list endpoints (cities, zones, areas, stores) return
 * `{ success, message, data: { data: [...] } }`. Only the envelope is
 * validated; rows are forwarded verbatim.
 */
export const PathaoListSchema = z
  .object({
    data: z
      .object({ data: z.array(z.record(z.string(), z.unknown())).nullish() })
      .nullish(),
  })
  .passthrough();

/** Store rows are read field by field, so those fields are typed. */
export const PathaoStoreListSchema = z
  .object({
    data: z
      .object({
        data: z
          .array(
            z
              .object({
                store_id: numericId,
                store_name: z.string().trim().nullish(),
                store_address: z.string().trim().nullish(),
                is_active: z.union([z.boolean(), z.number(), z.string()]).nullish(),
                city_id: numericId.nullish(),
                zone_id: numericId.nullish(),
                area_id: numericId.nullish(),
              })
              .passthrough(),
          )
          .nullish(),
      })
      .nullish(),
  })
  .passthrough();

/* ------------------------------------------------------------------- orders */

/**
 * Order creation and order info both expose `consignment_id`, but creation
 * returns it at the top level while info nests it under `data`. Both shapes are
 * declared; the mapper picks whichever is populated.
 */
export const PathaoOrderSchema = z
  .object({
    data: z
      .object({
        consignment_id: numericId.nullish(),
        merchant_order_id: z.string().trim().nullish(),
        order_status_slug: z.string().trim().nullish(),
        order_status: z.string().trim().nullish(),
        event: z.string().trim().nullish(),
        delivery_fee: moneyish.nullish(),
        is_parcel: flagBoolean.nullish(),
        updated_at: z.string().trim().nullish(),
      })
      .passthrough()
      .nullish(),
    consignment_id: numericId.nullish(),
    merchant_order_id: z.string().trim().nullish(),
    order_status_slug: z.string().trim().nullish(),
    order_status: z.string().trim().nullish(),
    event: z.string().trim().nullish(),
    delivery_fee: moneyish.nullish(),
    is_parcel: flagBoolean.nullish(),
  })
  .passthrough();

/* -------------------------------------------------------------------- price */

export const PathaoPriceSchema = z
  .object({
    data: z
      .object({
        final_price: moneyish.nullish(),
        price: moneyish.nullish(),
        discount: moneyish.nullish(),
        promo_discount: moneyish.nullish(),
        additional_charge: moneyish.nullish(),
        cod_percentage: moneyish.nullish(),
        cod_enabled: z.union([z.boolean(), z.number(), z.string()]).nullish(),
        plan_id: z.union([z.number(), z.string()]).nullish(),
        delivery_fee: moneyish.nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

/* ------------------------------------------------------------------ parsing */

export function parsePathaoPayload<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  payload: unknown,
  context: string,
): z.infer<TSchema> {
  const result = schema.safeParse(payload);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');

    throw new CourierResponseError(
      PATHAO_PROVIDER_CODE,
      `${context} returned an unexpected response shape (${issues})`,
    );
  }

  return result.data;
}

/**
 * Pathao nests list rows under `data.data`. Returns an empty array when absent
 * so callers can iterate without a guard, and a non-array value is treated as
 * empty rather than crashing the admin UI.
 */
export function extractPathaoListRows(payload: unknown): Array<Record<string, unknown>> {
  const envelope = (payload ?? {}) as { data?: { data?: unknown } | null };
  const rows = envelope?.data?.data;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

/** Reads a value from either the top level or the nested `data` object. */
export function readPathaoField(payload: unknown, field: string): unknown {
  if (!payload || typeof payload !== 'object') return undefined;
  const top = (payload as Record<string, unknown>)[field];
  if (top !== undefined && top !== null) return top;
  const nested = (payload as { data?: Record<string, unknown> | null }).data;
  return nested && typeof nested === 'object' ? nested[field] : undefined;
}

export { numericId as pathaoNumericId, flagBoolean as pathaoFlagBoolean };
