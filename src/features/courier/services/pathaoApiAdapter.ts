import { prisma } from '@/src/services/database/prisma';
import type {
  CourierAdapter,
  CourierProviderView,
  ShipmentBookingInput,
  ShipmentBookingResult,
} from '@/src/modules/logistics/contracts';
import {
  createPathaoOrder,
  createPathaoStore,
  getPathaoOrderInfo,
  listPathaoStores,
} from './pathaoClient';

function collectTrackingCandidates(value: unknown, candidates: string[] = []): string[] {
  if (!value || typeof value !== 'object') {
    return candidates;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTrackingCandidates(item, candidates);
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

    collectTrackingCandidates(nestedValue, candidates);
  }

  return candidates;
}

function extractTrackingId(payload: unknown) {
  const [firstMatch] = collectTrackingCandidates(payload);
  return firstMatch ?? null;
}

function normalizePhone(phone: string | null | undefined) {
  const raw = String(phone || '').replace(/\D+/g, '');
  if (raw.length === 11) return raw;
  if (raw.length === 13 && raw.startsWith('880')) return `0${raw.slice(3)}`;
  return '';
}

async function resolvePathaoStoreId(input: ShipmentBookingInput) {
  const warehouseId = input.pickupLocation?.warehouseId;
  if (!warehouseId) {
    throw new Error('Pathao booking requires a shipment pickup warehouse.');
  }

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      phone: true,
      contactName: true,
      secondaryContact: true,
      otpNumber: true,
      pathaoStoreId: true,
      pathaoCityId: true,
      pathaoZoneId: true,
      pathaoAreaId: true,
    },
  });

  if (!warehouse) {
    throw new Error('Shipment pickup warehouse was not found.');
  }

  if (warehouse.pathaoStoreId) {
    return {
      storeId: warehouse.pathaoStoreId,
      warehouse,
      created: false,
      storePayload: null,
      storeResponse: null,
    };
  }

  if (!warehouse.pathaoCityId || !warehouse.pathaoZoneId || !warehouse.pathaoAreaId) {
    throw new Error(`Warehouse "${warehouse.name}" is missing Pathao city, zone, or area mapping.`);
  }

  const phone = normalizePhone(warehouse.phone || input.pickupLocation?.phone);
  if (!phone) {
    throw new Error(`Warehouse "${warehouse.name}" needs a valid 11-digit contact number for Pathao.`);
  }

  const storePayload = {
    name: warehouse.name,
    contact_name: warehouse.contactName || input.pickupLocation?.contactName || warehouse.name,
    contact_number: phone,
    secondary_contact: normalizePhone(warehouse.secondaryContact || input.pickupLocation?.secondaryContact) || undefined,
    otp_number: normalizePhone(warehouse.otpNumber || input.pickupLocation?.otpNumber) || undefined,
    address: warehouse.address,
    city_id: warehouse.pathaoCityId,
    zone_id: warehouse.pathaoZoneId,
    area_id: warehouse.pathaoAreaId,
  };

  const storeResponse = await createPathaoStore(storePayload);
  const listedStores = await listPathaoStores();

  const storeCandidates = Array.isArray((listedStores as any)?.data?.data) ? (listedStores as any).data.data : [];
  const matchedStore = [...storeCandidates]
    .reverse()
    .find((store: any) =>
      String(store?.store_name || '').trim().toLowerCase() === warehouse.name.trim().toLowerCase() &&
      Number(store?.city_id || 0) === warehouse.pathaoCityId,
    );

  const storeId = Number(matchedStore?.store_id || 0);
  if (!storeId) {
    throw new Error('Pathao store created but store ID could not be resolved from the merchant store list.');
  }

  await prisma.warehouse.update({
    where: { id: warehouse.id },
    data: {
      pathaoStoreId: storeId,
    },
  });

  return {
    storeId,
    warehouse,
    created: true,
    storePayload,
    storeResponse: storeResponse as Record<string, unknown>,
  };
}

export class PathaoApiAdapter implements CourierAdapter {
  constructor(private readonly provider: CourierProviderView) {}

  getProvider(): CourierProviderView {
    return this.provider;
  }

  async bookShipment(input: ShipmentBookingInput): Promise<ShipmentBookingResult> {
    const resolved = await resolvePathaoStoreId(input);
    const recipientPhone = normalizePhone(input.customer.phone);

    if (!recipientPhone) {
      throw new Error('Recipient phone number must be a valid 11-digit Bangladeshi mobile number for Pathao.');
    }

    if (!input.customer.address || input.customer.address.trim().length < 10) {
      throw new Error('Recipient address must be at least 10 characters for Pathao booking.');
    }

    const quantity = Math.max(1, Number(input.parcel?.quantity || 1));
    const weightKg = Math.min(10, Math.max(0.5, Number(input.parcel?.weightKg || 0.5)));
    const itemType = input.parcel?.itemType || 2;
    const deliveryType = input.parcel?.deliveryType || 48;

    const orderPayload: Record<string, unknown> = {
      store_id: resolved.storeId,
      merchant_order_id: input.merchantReference,
      recipient_name: input.customer.name,
      recipient_phone: recipientPhone,
      recipient_secondary_phone: normalizePhone(input.customer.secondaryPhone) || undefined,
      recipient_address: input.customer.address,
      delivery_type: deliveryType,
      item_type: itemType,
      special_instruction: input.parcel?.specialInstruction || `Shipment ${input.shipmentId || input.orderId} generated from LofiMart marketplace.`,
      item_quantity: quantity,
      item_weight: weightKg.toFixed(1),
      item_description: input.parcel?.description || `Marketplace shipment for order ${input.orderId}`,
      amount_to_collect: Math.max(0, Math.round(Number(input.codAmount || 0))),
    };

    if (Number.isFinite(Number(input.customer.cityId)) && Number(input.customer.cityId) > 0) {
      orderPayload.recipient_city = Number(input.customer.cityId);
    }
    if (Number.isFinite(Number(input.customer.zoneId)) && Number(input.customer.zoneId) > 0) {
      orderPayload.recipient_zone = Number(input.customer.zoneId);
    }
    if (Number.isFinite(Number(input.customer.areaId)) && Number(input.customer.areaId) > 0) {
      orderPayload.recipient_area = Number(input.customer.areaId);
    }

    const responsePayload = await createPathaoOrder(orderPayload);
    const trackingId = extractTrackingId(responsePayload);

    if (!trackingId) {
      throw new Error('Pathao booking response did not include a consignment ID.');
    }

    let orderInfo: Record<string, unknown> | null = null;
    try {
      orderInfo = (await getPathaoOrderInfo(trackingId)) as Record<string, unknown>;
    } catch {
      orderInfo = null;
    }

    const deliveryFee = Number((responsePayload as any)?.data?.delivery_fee ?? (orderInfo as any)?.data?.delivery_fee ?? 0);

    return {
      providerCode: this.provider.code,
      providerName: this.provider.name,
      trackingId,
      bookingMode: 'api',
      status: 'pickup_requested',
      deliveryFee: Number.isFinite(deliveryFee) ? deliveryFee : null,
      notes: resolved.created
        ? `Pathao store synced from warehouse ${resolved.warehouse.name} and shipment booked successfully.`
        : `Shipment booked successfully through Pathao store ${resolved.storeId}.`,
      metadata: {
        storeId: resolved.storeId,
        storeCreatedOnDemand: resolved.created,
        storePayload: resolved.storePayload,
        storeResponse: resolved.storeResponse,
        orderPayload,
        orderResponse: responsePayload,
        orderInfo,
      },
    };
  }
}
