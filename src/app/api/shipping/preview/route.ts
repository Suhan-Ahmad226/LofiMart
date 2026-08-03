import { NextRequest, NextResponse } from 'next/server';
import { prismaDirect } from '../../../../features/shared/services/database/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toPlainNumber(value: unknown, fallback: number) {
  if (value === null || typeof value === 'undefined') return fallback;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value && 'toNumber' in value && typeof (value as any).toNumber === 'function') {
    return (value as any).toNumber();
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isDhaka(city: string) {
  return /dhaka|ঢাকা/i.test(city);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const city = String(body.city || '').trim() || 'Dhaka';
    const subtotal = Math.max(Number(body.subtotal) || 0, 0);
    const itemCount = Math.max(Number(body.itemCount) || 1, 1);
    const productIds = Array.isArray(body.items)
      ? body.items.map((item: any) => String(item?.id || '').trim()).filter(Boolean)
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
              city: true,
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

    const shipmentBreakdown =
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

    const estimatedFee = shipmentBreakdown.reduce((sum, shipment) => sum + shipment.estimated_fee, 0);
    const estimatedFeePayable = shipmentBreakdown.reduce((sum, shipment) => sum + shipment.estimated_fee_payable, 0);
    const qualifiesForFreeShipping = estimatedFeePayable === 0;

    return NextResponse.json({
      estimated_fee: estimatedFee,
      estimated_fee_payable: estimatedFeePayable,
      estimated_eta: shipmentBreakdown[0]?.estimated_eta || defaultEta,
      free_shipping_threshold: defaultThreshold,
      qualifies_for_free_shipping: qualifiesForFreeShipping,
      checkout_note: qualifiesForFreeShipping
        ? 'Free delivery is applied to this checkout.'
        : `Spend more to reach the free delivery threshold of BDT ${defaultThreshold}.`,
      zone: insideDhaka ? 'inside_dhaka' : 'outside_dhaka',
      cod_available: true,
      warehouse_rule_applied: shipmentBreakdown.some((shipment) => shipment.warehouse_rule_applied),
      warehouse_name: shipmentBreakdown.length === 1 ? shipmentBreakdown[0]?.warehouse_name ?? null : null,
      shipment_breakdown: shipmentBreakdown,
    });
  } catch (error) {
    console.error('POST /api/shipping/preview error:', error);
    return NextResponse.json(
      {
        estimated_fee: 0,
        estimated_fee_payable: 0,
        estimated_eta: '2-4 business days',
        free_shipping_threshold: 2500,
        qualifies_for_free_shipping: true,
        checkout_note: 'Shipping preview is using the fallback delivery rule.',
        zone: 'standard',
        cod_available: true,
        warehouse_rule_applied: false,
        warehouse_name: null,
        shipment_breakdown: [],
      },
      { headers: { 'X-Data-Source': 'fallback' } },
    );
  }
}
