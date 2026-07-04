import { getServerEnv } from '@/src/lib/env';
import type {
  CourierAdapter,
  CourierProviderView,
  ShipmentBookingInput,
  ShipmentBookingResult,
} from '@/src/modules/logistics/contracts';

function normalizeUrl(baseUrl: string, endpoint: string) {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }

  return `${baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
}

function resolveTrackingUrl(baseUrl: string, endpoint: string, trackingId: string) {
  const normalizedEndpoint = endpoint.includes('{trackingId}')
    ? endpoint.replaceAll('{trackingId}', encodeURIComponent(trackingId))
    : `${endpoint.replace(/\/+$/, '')}/${encodeURIComponent(trackingId)}`;

  return normalizeUrl(baseUrl, normalizedEndpoint);
}

function collectCandidateValues(value: unknown, candidates: string[] = []): string[] {
  if (!value || typeof value !== 'object') {
    return candidates;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectCandidateValues(item, candidates);
    }

    return candidates;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.includes('tracking') ||
      normalizedKey.includes('consignment') ||
      normalizedKey.includes('parcel_id') ||
      normalizedKey.includes('parcelid')
    ) {
      if (typeof nestedValue === 'string' && nestedValue.trim()) {
        candidates.push(nestedValue.trim());
      } else if (typeof nestedValue === 'number' && Number.isFinite(nestedValue)) {
        candidates.push(String(nestedValue));
      }
    }

    collectCandidateValues(nestedValue, candidates);
  }

  return candidates;
}

function extractTrackingId(payload: unknown) {
  const [firstMatch] = collectCandidateValues(payload);
  return firstMatch ?? null;
}

function extractStatusValue(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested = extractStatusValue(item);
      if (nested) return nested;
    }
    return null;
  }

  for (const [key, nestedValue] of Object.entries(payload)) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.includes('status') ||
      normalizedKey === 'event' ||
      normalizedKey.includes('delivery_state') ||
      normalizedKey.includes('parcel_state')
    ) {
      if (typeof nestedValue === 'string' && nestedValue.trim()) {
        return nestedValue.trim();
      }
    }

    const nested = extractStatusValue(nestedValue);
    if (nested) return nested;
  }

  return null;
}

export async function getRedxOrderInfo(trackingId: string) {
  const env = getServerEnv();

  if (!env.REDX_API_KEY || !env.REDX_SECRET_KEY || !env.REDX_BASE_URL) {
    throw new Error('RedX API credentials are missing.');
  }

  const endpoint = env.REDX_TRACKING_ENDPOINT || '/api/v1/merchant/parcels/{trackingId}';
  const url = resolveTrackingUrl(env.REDX_BASE_URL, endpoint, trackingId);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.REDX_API_KEY,
      'x-secret-key': env.REDX_SECRET_KEY,
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const responseMessage =
      payload && typeof payload === 'object'
        ? String((payload as { message?: unknown; error?: unknown }).message ?? (payload as { message?: unknown; error?: unknown }).error ?? '')
        : '';
    const message = responseMessage || `RedX tracking lookup failed with status ${response.status}`;

    throw new Error(message);
  }

  return {
    payload,
    trackingId: extractTrackingId(payload) || trackingId,
    rawStatus: extractStatusValue(payload),
  };
}

export class RedxApiAdapter implements CourierAdapter {
  constructor(private readonly provider: CourierProviderView) {}

  getProvider(): CourierProviderView {
    return this.provider;
  }

  async bookShipment(input: ShipmentBookingInput): Promise<ShipmentBookingResult> {
    const env = getServerEnv();

    if (!env.REDX_API_KEY || !env.REDX_SECRET_KEY || !env.REDX_BASE_URL) {
      throw new Error('RedX API credentials are missing.');
    }

    const endpoint = env.REDX_BOOKING_ENDPOINT || '/api/v1/merchant/parcels';
    const url = normalizeUrl(env.REDX_BASE_URL, endpoint);

    const payload = {
      merchant_reference: input.merchantReference,
      order_id: input.orderId,
      customer_name: input.customer.name,
      customer_phone: input.customer.phone || '',
      customer_city: input.customer.city || '',
      customer_address: input.customer.address || '',
      collection_amount: input.codAmount ?? 0,
      order_amount: input.amount,
      cash_on_delivery: Number(input.codAmount ?? 0) > 0,
      note: `LofiMart order ${input.orderId}`,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.REDX_API_KEY,
        'x-secret-key': env.REDX_SECRET_KEY,
      },
      body: JSON.stringify(payload),
    });

    const responsePayload = await response.json().catch(() => null);

    if (!response.ok) {
      const responseMessage =
        responsePayload && typeof responsePayload === 'object'
          ? String(
              (responsePayload as { message?: unknown; error?: unknown }).message ??
                (responsePayload as { message?: unknown; error?: unknown }).error ??
                '',
            )
          : '';
      const message = responseMessage || `RedX booking failed with status ${response.status}`;

      throw new Error(message);
    }

    const trackingId = extractTrackingId(responsePayload);

    if (!trackingId) {
      throw new Error('RedX booking response did not include a tracking ID.');
    }

    return {
      providerCode: this.provider.code,
      providerName: this.provider.name,
      trackingId,
      bookingMode: 'api',
      status: 'pickup_requested',
      notes: 'Shipment booked through RedX API.',
      metadata:
        responsePayload && typeof responsePayload === 'object'
          ? { request: payload, response: responsePayload as Record<string, unknown> }
          : { request: payload },
    };
  }
}
