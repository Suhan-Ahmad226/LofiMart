import { getServerEnv } from '../../lib/env';
import type {
  CourierAdapter,
  CourierProviderView,
  ShipmentBookingInput,
  ShipmentBookingResult,
} from '../../modules/logistics/contracts';

function normalizeUrl(baseUrl: string, endpoint: string) {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }

  return `${baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
}

function normalizeBangladeshPhone(phone: string | null | undefined) {
  const raw = String(phone || '').replace(/\D+/g, '');
  if (raw.length === 11) return raw;
  if (raw.length === 13 && raw.startsWith('880')) return `0${raw.slice(3)}`;
  return '';
}

function parseObjectPayload(response: Response) {
  return response.json().catch(() => null);
}

function buildHeaders() {
  const env = getServerEnv();

  if (!env.STEADFAST_API_KEY || !env.STEADFAST_SECRET_KEY || !env.STEADFAST_BASE_URL) {
    throw new Error('Steadfast API credentials are missing.');
  }

  return {
    baseUrl: env.STEADFAST_BASE_URL,
    headers: {
      'Api-Key': env.STEADFAST_API_KEY,
      'Secret-Key': env.STEADFAST_SECRET_KEY,
      'Content-Type': 'application/json',
    },
  };
}

function extractMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback;

  const message = String((payload as Record<string, unknown>).message || '').trim();
  return message || fallback;
}

function extractTrackingCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested = extractTrackingCode(item);
      if (nested) return nested;
    }
    return null;
  }

  const objectPayload = payload as Record<string, unknown>;
  const direct = objectPayload.tracking_code;
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }

  for (const value of Object.values(objectPayload)) {
    const nested = extractTrackingCode(value);
    if (nested) return nested;
  }

  return null;
}

function extractConsignmentId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested = extractConsignmentId(item);
      if (nested) return nested;
    }
    return null;
  }

  const objectPayload = payload as Record<string, unknown>;
  const direct = objectPayload.consignment_id;
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }
  if (typeof direct === 'number' && Number.isFinite(direct)) {
    return String(direct);
  }

  for (const value of Object.values(objectPayload)) {
    const nested = extractConsignmentId(value);
    if (nested) return nested;
  }

  return null;
}

function extractDeliveryStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested = extractDeliveryStatus(item);
      if (nested) return nested;
    }
    return null;
  }

  const objectPayload = payload as Record<string, unknown>;
  const directCandidates = [
    objectPayload.delivery_status,
    objectPayload.status,
    objectPayload.order_status,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  for (const value of Object.values(objectPayload)) {
    const nested = extractDeliveryStatus(value);
    if (nested) return nested;
  }

  return null;
}

async function steadfastRequest(endpoint: string, init?: RequestInit) {
  const { baseUrl, headers } = buildHeaders();
  const response = await fetch(normalizeUrl(baseUrl, endpoint), {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers || {}),
    },
  });

  const payload = await parseObjectPayload(response);
  if (!response.ok) {
    throw new Error(extractMessage(payload, `Steadfast request failed with status ${response.status}`));
  }

  return payload;
}

export async function createSteadfastOrder(payload: Record<string, unknown>) {
  return steadfastRequest('/create_order', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createSteadfastBulkOrders(orders: Record<string, unknown>[]) {
  return steadfastRequest('/create_order/bulk-order', {
    method: 'POST',
    body: JSON.stringify({
      data: JSON.stringify(orders),
    }),
  });
}

export async function getSteadfastStatusByTrackingCode(trackingCode: string) {
  const payload = await steadfastRequest(`/status_by_trackingcode/${encodeURIComponent(trackingCode)}`, {
    method: 'GET',
  });

  return {
    payload,
    trackingId: extractTrackingCode(payload) || trackingCode,
    consignmentId: extractConsignmentId(payload),
    rawStatus: extractDeliveryStatus(payload),
  };
}

export async function getSteadfastOrderInfo(trackingCode: string) {
  return getSteadfastStatusByTrackingCode(trackingCode);
}

export async function getSteadfastBalance() {
  return steadfastRequest('/get_balance', { method: 'GET' });
}

export async function createSteadfastReturnRequest(payload: Record<string, unknown>) {
  return steadfastRequest('/create_return_request', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getSteadfastReturnRequest(id: string) {
  return steadfastRequest(`/get_return_request/${encodeURIComponent(id)}`, { method: 'GET' });
}

export async function getSteadfastReturnRequests() {
  return steadfastRequest('/get_return_requests', { method: 'GET' });
}

export async function getSteadfastPayments() {
  return steadfastRequest('/payments', { method: 'GET' });
}

export async function getSteadfastPayment(paymentId: string) {
  return steadfastRequest(`/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
}

export async function getSteadfastPoliceStations() {
  return steadfastRequest('/police_stations', { method: 'GET' });
}

export function getSteadfastDiagnostics() {
  const env = getServerEnv();
  const apiConfigured = Boolean(env.STEADFAST_API_KEY && env.STEADFAST_SECRET_KEY && env.STEADFAST_BASE_URL);
  return {
    apiConfigured,
    webhookConfigured: Boolean(env.STEADFAST_WEBHOOK_TOKEN),
    baseUrl: env.STEADFAST_BASE_URL || null,
  };
}

export class SteadfastApiAdapter implements CourierAdapter {
  constructor(private readonly provider: CourierProviderView) {}

  getProvider(): CourierProviderView {
    return this.provider;
  }

  async bookShipment(input: ShipmentBookingInput): Promise<ShipmentBookingResult> {
    const recipientPhone = normalizeBangladeshPhone(input.customer.phone);

    if (!recipientPhone) {
      throw new Error('Recipient phone number must be a valid 11-digit Bangladeshi mobile number for Steadfast.');
    }

    if (!input.customer.address || input.customer.address.trim().length < 10) {
      throw new Error('Recipient address must be at least 10 characters for Steadfast booking.');
    }

    const quantity = Math.max(1, Number(input.parcel?.quantity || 1));
    const payload: Record<string, unknown> = {
      invoice: input.merchantReference,
      recipient_name: input.customer.name,
      recipient_phone: recipientPhone,
      alternative_phone: normalizeBangladeshPhone(input.customer.secondaryPhone) || undefined,
      recipient_address: input.customer.address,
      cod_amount: Math.max(0, Math.round(Number(input.codAmount || 0))),
      note: input.parcel?.specialInstruction || `Shipment ${input.shipmentId || input.orderId} generated from LofiMart marketplace.`,
      item_description: input.parcel?.description || `Marketplace shipment for order ${input.orderId}`,
      total_lot: quantity,
      delivery_type: 0,
    };

    const responsePayload = await createSteadfastOrder(payload);
    const trackingId = extractTrackingCode(responsePayload);
    const consignmentId = extractConsignmentId(responsePayload);

    if (!trackingId) {
      throw new Error('Steadfast booking response did not include a tracking code.');
    }

    return {
      providerCode: this.provider.code,
      providerName: this.provider.name,
      trackingId,
      bookingMode: 'api',
      status: 'pickup_requested',
      notes: 'Shipment booked through Steadfast API.',
      metadata: {
        bookingReference: input.merchantReference,
        invoice: input.merchantReference,
        trackingCode: trackingId,
        consignmentId,
        orderPayload: payload,
        orderResponse: responsePayload,
      },
    };
  }
}
