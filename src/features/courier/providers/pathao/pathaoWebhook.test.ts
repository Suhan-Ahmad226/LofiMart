import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Webhook authenticity is the boundary that stops anyone from marking a parcel
 * as delivered, so these tests assert the failure modes rather than the happy
 * path: an unconfigured secret must reject, a wrong secret must reject, and a
 * body with no identifiable consignment must not be applied anywhere.
 */

const env: Record<string, string | undefined> = {};

vi.mock('../../../../lib/env', () => ({
  getServerEnv: () => env,
}));

vi.mock('../../../shared/services/messaging/redis', () => ({
  ensureRedis: async () => ({
    get: async () => null,
    set: async () => 'OK',
    del: async () => 0,
  }),
}));

const { parsePathaoWebhookPayload, verifyPathaoWebhookSignature } = await import(
  './pathaoWebhook'
);
const { CourierWebhookError } = await import('../../core/errors');

function webhookRequest(headers: Record<string, string>, body: unknown = {}) {
  return new Request('https://example.test/api/logistics/webhooks/pathao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
});

describe('verifyPathaoWebhookSignature', () => {
  it('rejects when no secret is configured, rather than accepting', () => {
    env.PATHAO_WEBHOOK_TOKEN = undefined;
    expect(verifyPathaoWebhookSignature(webhookRequest({}))).toBe(false);
  });

  it('rejects an empty configured secret', () => {
    env.PATHAO_WEBHOOK_TOKEN = '   ';
    expect(verifyPathaoWebhookSignature(webhookRequest({}))).toBe(false);
  });

  it('accepts the correct secret', () => {
    env.PATHAO_WEBHOOK_TOKEN = 'super-secret-value';
    expect(
      verifyPathaoWebhookSignature(webhookRequest({ 'X-Password': 'super-secret-value' })),
    ).toBe(true);
  });

  it('rejects a wrong secret', () => {
    env.PATHAO_WEBHOOK_TOKEN = 'super-secret-value';
    expect(verifyPathaoWebhookSignature(webhookRequest({ 'X-Password': 'guess' }))).toBe(false);
  });

  it('rejects when the signature header is missing', () => {
    env.PATHAO_WEBHOOK_TOKEN = 'super-secret-value';
    expect(verifyPathaoWebhookSignature(webhookRequest({}))).toBe(false);
  });

  it('rejects a signature of a different length without throwing', () => {
    env.PATHAO_WEBHOOK_TOKEN = 'super-secret-value';
    // A naive length check would throw here and leak the secret length.
    expect(verifyPathaoWebhookSignature(webhookRequest({ 'X-Password': 'a' }))).toBe(false);
    expect(verifyPathaoWebhookSignature(webhookRequest({ 'X-Password': 'x'.repeat(500) }))).toBe(
      false,
    );
  });

  it('accepts the alternative signature header names', () => {
    env.PATHAO_WEBHOOK_TOKEN = 'shared';
    expect(verifyPathaoWebhookSignature(webhookRequest({ 'X-Signature': 'shared' }))).toBe(true);
    expect(
      verifyPathaoWebhookSignature(webhookRequest({ 'X-Pathao-Signature': 'shared' })),
    ).toBe(true);
  });
});

describe('parsePathaoWebhookPayload', () => {
  it('maps a Pathao status into the internal vocabulary', async () => {
    const event = await parsePathaoWebhookPayload({
      consignment_id: 'ABCD123',
      order_status_slug: 'Parcel Delivered',
    });

    expect(event.provider).toBe('pathao');
    expect(event.externalShipmentId).toBe('ABCD123');
    expect(event.status).toBe('delivered');
    expect(event.providerStatus).toBe('Parcel Delivered');
  });

  it('preserves an unmapped status as null rather than guessing', async () => {
    const event = await parsePathaoWebhookPayload({
      consignment_id: 'ABCD123',
      order_status_slug: 'Parcel Teleported',
    });

    expect(event.status).toBeNull();
    expect(event.providerStatus).toBe('Parcel Teleported');
  });

  it('reads a numeric consignment id', async () => {
    const event = await parsePathaoWebhookPayload({ consignment_id: 987654 });
    expect(event.externalShipmentId).toBe('987654');
  });

  it('accepts a body nested under data', async () => {
    const event = await parsePathaoWebhookPayload({
      data: { consignment_id: 'XYZ789', order_status_slug: 'Parcel Picked Up' },
    });
    expect(event.externalShipmentId).toBe('XYZ789');
    expect(event.status).toBe('picked_up');
  });

  it('surfaces the merchant reference when the courier omits the consignment id', async () => {
    const event = await parsePathaoWebhookPayload({
      merchant_order_id: 'LFM-ship_1',
      order_status_slug: 'Parcel Delivered',
    });
    expect(event.merchantReference).toBe('LFM-ship_1');
  });

  it('rejects a body that identifies no shipment', async () => {
    // Must not be applied to an arbitrary row.
    await expect(parsePathaoWebhookPayload({ order_status_slug: 'Parcel Delivered' })).rejects.toThrow(
      CourierWebhookError,
    );
    await expect(parsePathaoWebhookPayload(null)).rejects.toThrow(CourierWebhookError);
    await expect(parsePathaoWebhookPayload('a string')).rejects.toThrow(CourierWebhookError);
  });

  it('keeps only allowlisted metadata, never the whole body', async () => {
    const event = await parsePathaoWebhookPayload({
      consignment_id: 'ABCD123',
      order_status_slug: 'Parcel Delivered',
      invoice_id: 'INV-9',
      recipient: { name: 'Customer Name', phone: '01700000000' },
      store_password: 'leaked-secret',
    });

    expect(event.metadata.invoiceId).toBe('INV-9');
    expect(JSON.stringify(event.metadata)).not.toMatch(/Customer Name/);
    expect(JSON.stringify(event.metadata)).not.toMatch(/leaked-secret/);
  });
});
