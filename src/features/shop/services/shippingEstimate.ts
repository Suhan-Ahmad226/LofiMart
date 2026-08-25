import { prismaDirect } from '@/features/shared/services/database/prisma';

type EstimateShippingInput = {
  city?: string | null;
  subtotal: number;
  itemCount?: number;
  items?: Array<{ id?: string | number | null; productId?: string | number | null }>;
};

export type ShippingEstimate = {
  estimated_fee: number;
  estimated_fee_payable: number;
  estimated_eta: string;
  free_shipping_threshold: number;
  qualifies_for_free_shipping: boolean;
  checkout_note: string;
  zone: 'inside_dhaka' | 'outside_dhaka';
  cod_available: true;
  warehouse_rule_applied: boolean;
  warehouse_name: string | null;
  shipment_breakdown: Array<{
    warehouse_id: string | null;
    warehouse_name: string;
    item_count: number;
    estimated_fee: number;
    estimated_fee_payable: number;
    estimated_eta: string;
    warehouse_rule_applied: boolean;
  }>;
};

function toPlainNumber(value: unknown, fallback: number) {
  if (value === null || typeof value === 'undefined') return fallback;
  if (typeof value === 'number') return value;
  if (
    typeof value === 'object' &&
    value &&
    'toNumber' in value &&
    typeof (value as { toNumber?: unknown }).toNumber === 'function'
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isDhaka(city: string) {
  return /dhaka/i.test(city);
}

export function extractShippingCity(shippingAddress: unknown): string | null {
  if (!shippingAddress) return null;

  if (typeof shippingAddress === 'string') {
    return shippingAddress.trim() || null;
  }

  if (typeof shippingAddress !== 'object') {
    return null;
  }

  const address = shippingAddress as Record<string, unknown>;
  const city = address.city || address.district || address.division || address.zone;
  return typeof city === 'string' && city.trim() ? city.trim() : null;
}

export async function estimateShipping(input: EstimateShippingInput): Promise<ShippingEstimate> {
  const city = String(input.city || '').trim() || 'Dhaka';
  const subtotal = Math.max(Number(input.subtotal) || 0, 0);
  const itemCount = Math.max(Number(input.itemCount) || 1, 1);
  const productIds = Array.isArray(input.items)
    ? input.items
        .map((item) => String(item.productId || item.id || '').trim())
        .filter(Boolean)
    : [];

  const [tenantSetting, warehouses] = await Promise.all([
    prismaDirect.tenantSetting.findFirst({ orderBy: { createdAt: 'asc' } }),
    productIds.length
      ? prismaDirect.warehouse.findMany({
          where: {
            inventoryItems: {
              some: {
                productId: { in: productIds },
                quantity: { gt: 0 },
              },
            },
          },
          select: {
            id: true,
            name: true,
            insideDhakaFee: true,
            outsideDhakaFee: true,
            insideDhakaEta: true,
            outsideDhakaEta: true,
            freeShippingThresholdOverride: true,
            inventoryItems: {
              where: { productId: { in: productIds } },
              select: { productId: true },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const defaultThreshold = toPlainNumber(tenantSetting?.freeShippingThreshold, 2500);
  const insideDhaka = isDhaka(city);
  const defaultFee = insideDhaka ? 80 : 130;
  const defaultEta = insideDhaka ? '1-2 business days' : '2-4 business days';

  const shipment_breakdown =
    warehouses.length > 0
      ? warehouses.map((warehouse) => {
          const threshold = toPlainNumber(warehouse.freeShippingThresholdOverride, defaultThreshold);
          const fee = insideDhaka
            ? toPlainNumber(warehouse.insideDhakaFee, defaultFee)
            : toPlainNumber(warehouse.outsideDhakaFee, defaultFee);
          const qualifiesForFreeShipping = subtotal >= threshold;

          return {
            warehouse_id: warehouse.id,
            warehouse_name: warehouse.name,
            item_count: Math.max(warehouse.inventoryItems.length, 1),
            estimated_fee: fee,
            estimated_fee_payable: qualifiesForFreeShipping ? 0 : fee,
            estimated_eta: insideDhaka ? warehouse.insideDhakaEta || defaultEta : warehouse.outsideDhakaEta || defaultEta,
            warehouse_rule_applied: true,
          };
        })
      : [
          {
            warehouse_id: null,
            warehouse_name: 'LofiMart fulfillment',
            item_count: itemCount,
            estimated_fee: defaultFee,
            estimated_fee_payable: subtotal >= defaultThreshold ? 0 : defaultFee,
            estimated_eta: defaultEta,
            warehouse_rule_applied: false,
          },
        ];

  const estimatedFee = shipment_breakdown.reduce((sum, shipment) => sum + shipment.estimated_fee, 0);
  const estimatedFeePayable = shipment_breakdown.reduce((sum, shipment) => sum + shipment.estimated_fee_payable, 0);
  const qualifiesForFreeShipping = estimatedFeePayable === 0;

  return {
    estimated_fee: estimatedFee,
    estimated_fee_payable: estimatedFeePayable,
    estimated_eta: shipment_breakdown[0]?.estimated_eta || defaultEta,
    free_shipping_threshold: defaultThreshold,
    qualifies_for_free_shipping: qualifiesForFreeShipping,
    checkout_note: qualifiesForFreeShipping
      ? 'Free delivery is applied to this checkout.'
      : `Spend more to reach the free delivery threshold of BDT ${defaultThreshold}.`,
    zone: insideDhaka ? 'inside_dhaka' : 'outside_dhaka',
    cod_available: true,
    warehouse_rule_applied: shipment_breakdown.some((shipment) => shipment.warehouse_rule_applied),
    warehouse_name: shipment_breakdown.length === 1 ? shipment_breakdown[0]?.warehouse_name ?? null : null,
    shipment_breakdown,
  };
}
