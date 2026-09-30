import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { toPlainNumber } from '@/app/api/products/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  if (!['admin', 'seller'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const warehouses = await prisma.warehouse.findMany({
    where: user.role === 'seller' ? { managerId: String(user.id) } : undefined,
    orderBy: { createdAt: 'desc' },
  });

  // Read through `CourierStoreMapping` rather than the `Warehouse.pathao*` columns.
  // The mapping is keyed by provider, so this returns the courier link for a
  // warehouse whatever courier is registered, and the response shape does not
  // change when one is added. The legacy columns are still mirrored on write; they
  // are no longer read here.
  const mappings = await prisma.courierStoreMapping.findMany({
    where: { warehouseId: { in: warehouses.map((warehouse) => warehouse.id) } },
    orderBy: { updatedAt: 'desc' },
  });

  const mappingByWarehouse = new Map<string, (typeof mappings)[number]>();
  for (const mapping of mappings) {
    // First write wins, so the ordering above makes this deterministic: the most
    // recently touched mapping is the one an operator is working on.
    if (!mappingByWarehouse.has(mapping.warehouseId)) {
      mappingByWarehouse.set(mapping.warehouseId, mapping);
    }
  }

  return NextResponse.json(warehouses.map((warehouse) => {
    const mapping = mappingByWarehouse.get(warehouse.id);

    return {
    id: warehouse.id,
    name: warehouse.name,
    location: {
      address: warehouse.address,
      city: warehouse.city,
      state: warehouse.state ?? undefined,
      country: warehouse.country,
      postalCode: warehouse.postalCode,
    },
    contact: {
      name: warehouse.contactName ?? undefined,
      phone: warehouse.phone ?? undefined,
      email: warehouse.email ?? undefined,
      secondaryPhone: warehouse.secondaryContact ?? undefined,
      otpNumber: warehouse.otpNumber ?? undefined,
    },
    courier: mapping
      ? {
          provider: mapping.provider,
          storeId: mapping.externalStoreId,
          storeName: mapping.externalStoreName ?? undefined,
          storeStatus: mapping.status,
          storeActive: mapping.isActive,
          cityId: mapping.cityId ?? undefined,
          zoneId: mapping.zoneId ?? undefined,
          areaId: mapping.areaId ?? undefined,
        }
      : undefined,
    shipping: {
      insideDhakaFee: warehouse.insideDhakaFee == null ? undefined : toPlainNumber(warehouse.insideDhakaFee),
      outsideDhakaFee: warehouse.outsideDhakaFee == null ? undefined : toPlainNumber(warehouse.outsideDhakaFee),
      insideDhakaEta: warehouse.insideDhakaEta ?? undefined,
      outsideDhakaEta: warehouse.outsideDhakaEta ?? undefined,
      freeShippingThresholdOverride:
        warehouse.freeShippingThresholdOverride == null ? undefined : toPlainNumber(warehouse.freeShippingThresholdOverride),
    },
    capacity: {
      maxItems: warehouse.maxItems ?? undefined,
      maxWeightKg: warehouse.maxWeightKg ?? undefined,
    },
    createdAt: warehouse.createdAt.toISOString(),
    updatedAt: warehouse.updatedAt.toISOString(),
  };
  }));
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  if (!['admin', 'seller'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) || {};
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const address = typeof body?.location?.address === 'string' ? body.location.address.trim() : '';
  const city = typeof body?.location?.city === 'string' ? body.location.city.trim() : '';
  const country = typeof body?.location?.country === 'string' ? body.location.country.trim() : 'Bangladesh';
  const postalCode = typeof body?.location?.postalCode === 'string' ? body.location.postalCode.trim() : '';
  const state = typeof body?.location?.state === 'string' ? body.location.state.trim() : undefined;
  const phone = typeof body?.contact?.phone === 'string' ? body.contact.phone.trim() : undefined;
  const email = typeof body?.contact?.email === 'string' ? body.contact.email.trim() : undefined;
  const contactName = typeof body?.contact?.name === 'string' ? body.contact.name.trim() : undefined;
  const secondaryContact = typeof body?.contact?.secondaryPhone === 'string' ? body.contact.secondaryPhone.trim() : undefined;
  const otpNumber = typeof body?.contact?.otpNumber === 'string' ? body.contact.otpNumber.trim() : undefined;
  const insideDhakaFee =
    body?.shipping?.insideDhakaFee === null || body?.shipping?.insideDhakaFee === ''
      ? null
      : Number.isFinite(Number(body?.shipping?.insideDhakaFee))
        ? Number(body.shipping.insideDhakaFee)
        : undefined;
  const outsideDhakaFee =
    body?.shipping?.outsideDhakaFee === null || body?.shipping?.outsideDhakaFee === ''
      ? null
      : Number.isFinite(Number(body?.shipping?.outsideDhakaFee))
        ? Number(body.shipping.outsideDhakaFee)
        : undefined;
  const freeShippingThresholdOverride =
    body?.shipping?.freeShippingThresholdOverride === null || body?.shipping?.freeShippingThresholdOverride === ''
      ? null
      : Number.isFinite(Number(body?.shipping?.freeShippingThresholdOverride))
        ? Number(body.shipping.freeShippingThresholdOverride)
        : undefined;
  const insideDhakaEta = typeof body?.shipping?.insideDhakaEta === 'string' ? body.shipping.insideDhakaEta.trim() : undefined;
  const outsideDhakaEta = typeof body?.shipping?.outsideDhakaEta === 'string' ? body.shipping.outsideDhakaEta.trim() : undefined;

  if (!name || !address || !city || !postalCode) {
    return NextResponse.json({ error: 'Warehouse name, address, city, and postal code are required' }, { status: 400 });
  }

  try {
    const warehouse = await prisma.warehouse.create({
      data: {
        name,
        address,
        city,
        country,
        postalCode,
        state: state || null,
        phone: phone || null,
        email: email || null,
        contactName: contactName || null,
        secondaryContact: secondaryContact || null,
        otpNumber: otpNumber || null,
        insideDhakaFee: insideDhakaFee === undefined ? null : insideDhakaFee,
        outsideDhakaFee: outsideDhakaFee === undefined ? null : outsideDhakaFee,
        insideDhakaEta: insideDhakaEta || null,
        outsideDhakaEta: outsideDhakaEta || null,
        freeShippingThresholdOverride: freeShippingThresholdOverride === undefined ? null : freeShippingThresholdOverride,
        managerId: user.role === 'seller' ? String(user.id) : null,
      },
    });

    return NextResponse.json({
      id: warehouse.id,
      name: warehouse.name,
      location: {
        address: warehouse.address,
        city: warehouse.city,
        state: warehouse.state ?? undefined,
        country: warehouse.country,
        postalCode: warehouse.postalCode,
      },
      contact: {
        name: warehouse.contactName ?? undefined,
        phone: warehouse.phone ?? undefined,
        email: warehouse.email ?? undefined,
        secondaryPhone: warehouse.secondaryContact ?? undefined,
        otpNumber: warehouse.otpNumber ?? undefined,
      },
      // A brand-new warehouse has no courier link yet; the UI creates one from the
      // location mapping step.
      courier: undefined,
      shipping: {
        insideDhakaFee: warehouse.insideDhakaFee == null ? undefined : toPlainNumber(warehouse.insideDhakaFee),
        outsideDhakaFee: warehouse.outsideDhakaFee == null ? undefined : toPlainNumber(warehouse.outsideDhakaFee),
        insideDhakaEta: warehouse.insideDhakaEta ?? undefined,
        outsideDhakaEta: warehouse.outsideDhakaEta ?? undefined,
        freeShippingThresholdOverride:
          warehouse.freeShippingThresholdOverride == null ? undefined : toPlainNumber(warehouse.freeShippingThresholdOverride),
      },
      capacity: {
        maxItems: warehouse.maxItems ?? undefined,
        maxWeightKg: warehouse.maxWeightKg ?? undefined,
      },
      createdAt: warehouse.createdAt.toISOString(),
      updatedAt: warehouse.updatedAt.toISOString(),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to create warehouse' }, { status: 500 });
  }
}
