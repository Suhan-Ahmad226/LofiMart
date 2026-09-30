/**
 * Server-authoritative shipping quote.
 *
 * This is the only place a delivery fee is calculated. It exists because the
 * browser must never be able to influence a price:
 *
 *  - the subtotal is read from `Product.price`, never from the request;
 *  - the weight is read from `Product.weightKg`, never from the request;
 *  - the pickup point is derived from where the stock actually sits;
 *  - the courier price comes from the provider, not from a table in the UI.
 *
 * Every quote carries a `verified` flag. `false` means the fee did not come
 * from a live provider quote and fell back to a configured flat rate, which is
 * recorded on the order as `deliveryFeeVerified = false` so the figure can be
 * reconciled against the courier invoice later.
 */

import { prismaDirect } from '../../shared/services/database/prisma';
import type { CourierDeliverySpeed, CourierItemType } from '../core/contracts';
import type { CourierStoreRef } from '../core/contracts';
import { isCourierError } from '../core/errors';
import { requireCourierProvider } from '../registry/providerRegistry';
import { PATHAO_PROVIDER_CODE } from '../providers/pathao/pathaoConstants';

export type QuoteItem = {
  productId: string;
  quantity: number;
};

export type QuoteDestination = {
  city: string;
  zone?: string | null;
  area?: string | null;
};

export type ShippingQuoteRequest = {
  items: QuoteItem[];
  destination: QuoteDestination;
  deliverySpeed?: CourierDeliverySpeed;
  /** Collectible amount, which drives the courier's COD fee. */
  codAmount?: number;
  providerCode?: string;
  /**
   * Apply the free-shipping threshold. Checkout applies it; a previews screen
   * may want the un-discounted courier cost to explain the difference.
   */
  applyFreeShipping?: boolean;
};

export type ShipmentQuote = {
  warehouseId: string;
  warehouseName: string;
  courierStoreId: string | null;
  itemCount: number;
  weightKg: number;
  /** Live courier cost for this parcel. Null when no quote was obtainable. */
  courierCharge: number | null;
  codFee: number;
  /** What the customer pays for delivery on this parcel. */
  customerDeliveryFee: number;
  estimatedDays: number | null;
  /** False when the fee is a flat fallback rather than a courier quote. */
  verified: boolean;
  source: 'provider' | 'fallback';
  /** Why the fallback was used, for admin diagnostics. Never user-facing. */
  reason: string | null;
};

export type ShippingQuote = {
  provider: string;
  currency: string;
  /** True only when every parcel was priced by the courier. */
  verified: boolean;
  freeShippingApplied: boolean;
  freeShippingThreshold: number;
  /** What the rider collects: goods, plus platform fee, minus discounts. */
  amountToCollect: number;
  totalCustomerDeliveryFee: number;
  totalCourierCharge: number;
  shipments: ShipmentQuote[];
  /** Operator-facing warnings: unmapped locations, assumed weights, fallbacks. */
  warnings: string[];
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    const candidate = (value as { toNumber(): number }).toNumber();
    return Number.isFinite(candidate) ? candidate : fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Resolves a warehouse's courier pickup point.
 *
 * Prefers the generic `CourierStoreMapping` row and falls back to the legacy
 * `Warehouse.pathao*` columns only while a warehouse has no mapping yet, so
 * existing warehouses keep working after the backfill.
 */
async function resolveStoreForWarehouse(
  warehouse: {
    id: string;
    courierStores: Array<{
      provider: string;
      externalStoreId: string;
      externalStoreName: string | null;
      isActive: boolean;
      status: string;
    }>;
    pathaoStoreId: number | null;
  },
  providerCode: string,
): Promise<CourierStoreRef | null> {
  const mapping = warehouse.courierStores.find(
    (entry) => entry.provider === providerCode && entry.isActive && entry.status === 'active',
  );

  if (mapping) {
    return {
      provider: providerCode,
      externalStoreId: mapping.externalStoreId,
      externalStoreName: mapping.externalStoreName,
      active: true,
    };
  }

  const legacyId = warehouse.pathaoStoreId;
  if (legacyId !== null && providerCode === PATHAO_PROVIDER_CODE) {
    return { provider: providerCode, externalStoreId: String(legacyId), active: true };
  }

  return null;
}

/**
 * Calculates a shipping quote.
 *
 * Never throws for a pricing problem the caller can act on: an unmapped
 * destination or a missing pickup store produces `verified: false` and a
 * fallback fee, with the reason recorded. Throwing here would block checkout
 * entirely over a delivery-fee lookup, which is a worse outcome than charging a
 * flagged flat rate.
 */
export async function getShippingQuote(request: ShippingQuoteRequest): Promise<ShippingQuote> {
  const providerCode = (request.providerCode || PATHAO_PROVIDER_CODE).toLowerCase();
  const warnings: string[] = [];
  const applyFreeShipping = request.applyFreeShipping !== false;
  const deliverySpeed: CourierDeliverySpeed = request.deliverySpeed ?? 'standard';

  const normalizedItems = Array.from(
    (request.items || [])
      .map((item) => ({
        productId: String(item?.productId || '').trim(),
        quantity: Math.max(1, Math.floor(Number(item?.quantity ?? 1))),
      }))
      .filter((item) => item.productId),
      (item) => ({ productId: item.productId, quantity: item.quantity }),
  );

  if (normalizedItems.length === 0) {
    throw new Error('A shipping quote needs at least one item.');
  }

  if (!request.destination?.city?.trim()) {
    throw new Error('A delivery city is required before shipping can be quoted.');
  }

  const [products, tenantSetting] = await Promise.all([
    prismaDirect.product.findMany({
      where: {
        id: { in: normalizedItems.map((item) => item.productId) },
        productStatus: 'published',
      },
      select: {
        id: true,
        price: true,
        weightKg: true,
        inventoryItems: {
          where: { quantity: { gt: 0 } },
          select: {
            quantity: true,
            warehouse: {
              select: {
                id: true,
                name: true,
                city: true,
                insideDhakaFee: true,
                outsideDhakaFee: true,
                freeShippingThresholdOverride: true,
                courierStores: {
                  where: { isActive: true, status: 'active' },
                  select: {
                    provider: true,
                    externalStoreId: true,
                    externalStoreName: true,
                    isActive: true,
                    status: true,
                  },
                },
                pathaoStoreId: true,
              },
            },
          },
        },
      },
    }),
    prismaDirect.tenantSetting.findFirst({ orderBy: { createdAt: 'asc' } }),
  ]);

  const productById = new Map(products.map((product) => [product.id, product]));

  const missingProducts = normalizedItems
    .filter((item) => !productById.has(item.productId))
    .map((item) => item.productId);

  if (missingProducts.length > 0) {
    throw new Error('One or more items are no longer available for shipping.');
  }

  const defaultWeightKg = toNumber(tenantSetting?.defaultProductWeightKg, 0.5) || 0.5;
  const fallbackFee = toNumber(tenantSetting?.fallbackDeliveryFee, 130);
  const freeShippingThreshold = toNumber(tenantSetting?.freeShippingThreshold, 2500);

  // Subtotal from database prices. The request never contributes a price.
  const subtotal = normalizedItems.reduce((sum, item) => {
    const product = productById.get(item.productId)!;
    return sum + toNumber(product.price) * item.quantity;
  }, 0);

  const requestedCodAmount = Math.max(0, toNumber(request.codAmount, 0));
  let assumedWeight = false;

  type WarehouseGroup = {
    warehouseId: string;
    name: string;
    itemCount: number;
    weightKg: number;
    subtotal: number;
    store: CourierStoreRef | null;
    flatFee: number;
    threshold: number;
  };

  const byWarehouse = new Map<string, WarehouseGroup>();

  const insideDhaka = /dhaka|ঢাকা/i.test(request.destination.city);

  for (const item of normalizedItems) {
    const product = productById.get(item.productId)!;
    const productWeight =
      product.weightKg && product.weightKg > 0 ? product.weightKg : defaultWeightKg;
    if (!product.weightKg || product.weightKg <= 0) assumedWeight = true;

    const lineWeight = productWeight * item.quantity;
    const lineSubtotal = toNumber(product.price) * item.quantity;

    // Prefer the warehouse holding the most units, which is where the parcel
    // will realistically ship from.
    const source =
      [...product.inventoryItems].sort((a, b) => b.quantity - a.quantity)[0]?.warehouse ?? null;

    if (!source) {
      warnings.push(
        'A cart item has no warehouse stock, so part of the delivery fee is a flat fallback.',
      );
      continue;
    }

    const existing = byWarehouse.get(source.id);
    if (existing) {
      existing.itemCount += item.quantity;
      existing.weightKg += lineWeight;
      existing.subtotal += lineSubtotal;
      continue;
    }

    byWarehouse.set(source.id, {
      warehouseId: source.id,
      name: source.name,
      itemCount: item.quantity,
      weightKg: lineWeight,
      subtotal: lineSubtotal,
      store: await resolveStoreForWarehouse(source, providerCode),
      flatFee: toNumber(
        insideDhaka ? source.insideDhakaFee : source.outsideDhakaFee,
        fallbackFee,
      ),
      threshold: toNumber(source.freeShippingThresholdOverride, freeShippingThreshold),
    });
  }

  if (assumedWeight) {
    warnings.push(
      'Some products have no shipping weight on file, so the courier was quoted using the store default weight.',
    );
  }

  if (byWarehouse.size === 0) {
    throw new Error('No warehouse stock is available for one or more cart items.');
  }

  const recipientLocation = await resolveRecipientLocation(providerCode, request.destination, warnings);

  const shipments: ShipmentQuote[] = [];

  for (const entry of byWarehouse.values()) {
    let courierCharge: number | null = null;
    let codFee = 0;
    let estimatedDays: number | null = null;
    let reason: string | null = null;

    if (!entry.store) {
      reason = 'No courier pickup store is mapped for this warehouse.';
    } else if (!recipientLocation) {
      reason = 'The destination is not mapped to a courier area.';
    } else if (entry.weightKg <= 0) {
      reason = 'Parcel weight could not be determined.';
    }

    if (!reason) {
      try {
        const provider = requireCourierProvider(providerCode);
        const quote = await provider.getQuote({
          provider: providerCode,
          pickupStore: entry.store,
          pickupWarehouseId: null,
          recipientLocation,
          weightKg: round2(entry.weightKg),
          itemType: 'parcel' as CourierItemType,
          deliverySpeed,
          // COD is per parcel. Passing the full order amount to every warehouse
          // would multiply the COD fee on multi-warehouse orders.
          codAmount: subtotal > 0 ? round2(requestedCodAmount * (entry.subtotal / subtotal)) : 0,
        });

        courierCharge = quote.courierCharge;
        codFee = quote.codFee;
        estimatedDays = quote.estimatedDeliveryDays;
      } catch (error) {
        // A courier outage must not block checkout, but the fee must be marked
        // as unverified so it can be reconciled against the courier invoice.
        reason = isCourierError(error)
          ? `${error.code}: the courier did not return a price.`
          : 'The courier did not return a price.';
      }
    }

    const usesFallback = courierCharge === null;
    const fee = usesFallback ? entry.flatFee : (courierCharge ?? 0) + codFee;

    shipments.push({
      warehouseId: entry.warehouseId,
      warehouseName: entry.name,
      courierStoreId: entry.store?.externalStoreId ?? null,
      itemCount: entry.itemCount,
      weightKg: round2(entry.weightKg),
      courierCharge,
      codFee,
      customerDeliveryFee: round2(fee),
      estimatedDays,
      verified: !usesFallback,
      source: usesFallback ? 'fallback' : 'provider',
      reason,
    });
  }

  const grossDeliveryFee = shipments.reduce((sum, shipment) => sum + shipment.customerDeliveryFee, 0);
  const totalCourierCharge = shipments.reduce(
    (sum, shipment) => sum + (shipment.courierCharge ?? 0),
    0,
  );

  const qualifiesForFreeShipping = applyFreeShipping && subtotal >= freeShippingThreshold;
  const totalCustomerDeliveryFee = qualifiesForFreeShipping ? 0 : round2(grossDeliveryFee);

  return {
    provider: providerCode,
    currency: 'BDT',
    verified: shipments.length > 0 && shipments.every((shipment) => shipment.verified),
    freeShippingApplied: qualifiesForFreeShipping,
    freeShippingThreshold,
    amountToCollect: round2(requestedCodAmount),
    totalCustomerDeliveryFee,
    totalCourierCharge: round2(totalCourierCharge),
    shipments,
    warnings,
  };
}

/**
 * Maps the destination to the courier's area hierarchy.
 *
 * Returns `null` when the courier does not serve the city. The caller then falls
 * back to a flat fee; it never substitutes a default city.
 */
async function resolveRecipientLocation(
  providerCode: string,
  destination: QuoteDestination,
  warnings: string[],
) {
  try {
    const provider = requireCourierProvider(providerCode);
    const location = await provider.resolveLocation({
      city: destination.city,
      zone: destination.zone ?? null,
      area: destination.area ?? null,
    });

    if (!location) {
      warnings.push(`"${destination.city}" is not served by ${providerCode}, so a flat delivery fee was used.`);
    }

    return location;
  } catch (error) {
    warnings.push(
      isCourierError(error)
        ? `Courier location lookup failed (${error.code}); a flat delivery fee was used.`
        : 'Courier location lookup failed; a flat delivery fee was used.',
    );
    return null;
  }
}
