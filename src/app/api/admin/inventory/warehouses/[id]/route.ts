import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { toPlainNumber } from '@/app/api/products/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;

  if (!['admin', 'seller'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id },
      select: { id: true, managerId: true },
    });

    if (!warehouse) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });
    }

    if (user.role === 'seller' && warehouse.managerId !== String(user.id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await prisma.warehouse.delete({ where: { id: warehouse.id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete warehouse' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;

  if (!['admin', 'seller'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id },
      select: { id: true, managerId: true },
    });

    if (!warehouse) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });
    }

    if (user.role === 'seller' && warehouse.managerId && warehouse.managerId !== String(user.id)) {
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
    const maxItems =
      body?.capacity?.maxItems === null || body?.capacity?.maxItems === ''
        ? null
        : Number.isFinite(Number(body?.capacity?.maxItems))
          ? Number(body.capacity.maxItems)
          : undefined;
    const maxWeightKg =
      body?.capacity?.maxWeightKg === null || body?.capacity?.maxWeightKg === ''
        ? null
        : Number.isFinite(Number(body?.capacity?.maxWeightKg))
          ? Number(body.capacity.maxWeightKg)
          : undefined;

    if (!name || !address || !city || !postalCode) {
      return NextResponse.json({ error: 'Warehouse name, address, city, and postal code are required' }, { status: 400 });
    }

    const updated = await prisma.warehouse.update({
      where: { id: warehouse.id },
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
        insideDhakaFee: insideDhakaFee === undefined ? undefined : insideDhakaFee,
        outsideDhakaFee: outsideDhakaFee === undefined ? undefined : outsideDhakaFee,
        insideDhakaEta: insideDhakaEta === undefined ? undefined : insideDhakaEta || null,
        outsideDhakaEta: outsideDhakaEta === undefined ? undefined : outsideDhakaEta || null,
        freeShippingThresholdOverride:
          freeShippingThresholdOverride === undefined ? undefined : freeShippingThresholdOverride,
        maxItems: maxItems === undefined ? undefined : maxItems,
        maxWeightKg: maxWeightKg === undefined ? undefined : maxWeightKg,
      },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      location: {
        address: updated.address,
        city: updated.city,
        state: updated.state ?? undefined,
        country: updated.country,
        postalCode: updated.postalCode,
      },
      contact: {
        name: updated.contactName ?? undefined,
        phone: updated.phone ?? undefined,
        email: updated.email ?? undefined,
        secondaryPhone: updated.secondaryContact ?? undefined,
        otpNumber: updated.otpNumber ?? undefined,
      },
      pathao: {
        storeId: updated.pathaoStoreId ?? undefined,
        cityId: updated.pathaoCityId ?? undefined,
        zoneId: updated.pathaoZoneId ?? undefined,
        areaId: updated.pathaoAreaId ?? undefined,
      },
      shipping: {
        insideDhakaFee: updated.insideDhakaFee == null ? undefined : toPlainNumber(updated.insideDhakaFee),
        outsideDhakaFee: updated.outsideDhakaFee == null ? undefined : toPlainNumber(updated.outsideDhakaFee),
        insideDhakaEta: updated.insideDhakaEta ?? undefined,
        outsideDhakaEta: updated.outsideDhakaEta ?? undefined,
        freeShippingThresholdOverride:
          updated.freeShippingThresholdOverride == null ? undefined : toPlainNumber(updated.freeShippingThresholdOverride),
      },
      capacity: {
        maxItems: updated.maxItems ?? undefined,
        maxWeightKg: updated.maxWeightKg ?? undefined,
      },
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to update warehouse' }, { status: 500 });
  }
}
