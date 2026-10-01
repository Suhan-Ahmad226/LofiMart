import { NextRequest, NextResponse } from 'next/server';

import { getShippingQuote } from '../../../../features/courier/services/quoteService';
import { isCourierError } from '../../../../features/courier/core/errors';
import { takeRateLimit } from '../../../../features/auth/services/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PreviewBody = {
  city?: unknown;
  zone?: unknown;
  area?: unknown;
  items?: unknown;
  /**
   * Merchandise amount the customer will pay by COD after checkout discounts.
   * The final order always recalculates this value from database prices.
   */
  codAmount?: unknown;
  deliverySpeed?: unknown;
  applyFreeShipping?: unknown;
};

function readItems(value: unknown): Array<{ productId: string; quantity: number }> {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const item = entry as { id?: unknown; productId?: unknown; quantity?: unknown };
      const productId = String(item?.productId ?? item?.id ?? '').trim();
      const quantity = Math.max(1, Math.floor(Number(item?.quantity ?? 1)));
      return productId && Number.isFinite(quantity) ? { productId, quantity } : null;
    })
    .filter((item): item is { productId: string; quantity: number } => item !== null);
}

/**
 * Shipping preview for the checkout screen.
 *
 * The browser sends product ids and a destination. It never sends a price, a
 * weight or a fee: those are read from the database and the courier, so a
 * tampered request cannot change what a shopper is charged. The response is
 * therefore safe to display, and the order that follows re-quotes server-side
 * rather than trusting these figures.
 */
export async function POST(request: NextRequest) {
  try {
    // Each preview can fan out to one courier call per warehouse, so the limit
    // protects the courier quota as much as it protects the endpoint.
    const decision = await takeRateLimit('shipping-preview', {
      limit: 60,
      windowMs: 60_000,
    });

    if (!decision.allowed) {
      return NextResponse.json(
        { error: 'Too many delivery estimates requested. Please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(decision.resetAfterMs / 1000)) } },
      );
    }

    const body = (await request.json().catch(() => ({}))) as PreviewBody;
    const city = String(body.city ?? '').trim();
    const items = readItems(body.items);

    if (!city) {
      return NextResponse.json(
        { error: 'A delivery city is required before shipping can be quoted.' },
        { status: 400 },
      );
    }

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'Add an item to the cart before requesting a delivery estimate.' },
        { status: 400 },
      );
    }

    const quote = await getShippingQuote({
      items,
      destination: {
        city,
        zone: body.zone ? String(body.zone) : null,
        area: body.area ? String(body.area) : null,
      },
      deliverySpeed: body.deliverySpeed === 'express' ? 'express' : 'standard',
      codAmount: Number.isFinite(Number(body.codAmount)) ? Math.max(0, Number(body.codAmount)) : 0,
      applyFreeShipping: body.applyFreeShipping !== false,
    });

    return NextResponse.json({
      provider: quote.provider,
      estimated_fee: quote.totalCourierCharge,
      estimated_fee_payable: quote.totalCustomerDeliveryFee,
      free_shipping_threshold: quote.freeShippingThreshold,
      qualifies_for_free_shipping: quote.freeShippingApplied,
      currency: quote.currency,
      /**
       * False when a flat fallback was used. The checkout surfaces this rather
       * than presenting an estimate as a courier-confirmed price.
       */
      courier_price_verified: quote.verified,
      checkout_note: quote.freeShippingApplied
        ? 'Free delivery is applied to this checkout.'
        : `Delivery is charged at BDT ${quote.totalCustomerDeliveryFee}.`,
      shipment_breakdown: quote.shipments.map((shipment) => ({
        warehouse_id: shipment.warehouseId,
        warehouse_name: shipment.warehouseName,
        item_count: shipment.itemCount,
        weight_kg: shipment.weightKg,
        estimated_fee: shipment.courierCharge,
        estimated_fee_payable: shipment.customerDeliveryFee,
        estimated_eta_days: shipment.estimatedDays,
        courier_price_verified: shipment.verified,
      })),
      // Operator-facing, not customer-facing. Safe to show: no PII, no secrets.
      warnings: quote.warnings,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      /requires at least one item|delivery city|no longer available|not have enough stock in a single warehouse/.test(
        error.message,
      )
    ) {
      const status = /not have enough stock in a single warehouse/.test(error.message) ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    console.error('POST /api/shipping/preview error:', isCourierError(error) ? error.code : error);
    return NextResponse.json(
      { error: 'Shipping quote is temporarily unavailable. Please try again.' },
      { status: 503 },
    );
  }
}
