import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { getCourierProviderView } from '@/features/courier/registry/providerRegistry';
import { listCourierStores } from '@/features/courier/services/courierAdminService';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Links a warehouse to a courier: its pickup contact and its place in the
 * courier's location hierarchy.
 *
 * Replaces `PATCH /api/admin/inventory/warehouses/{id}/pathao`, which wrote four
 * `Warehouse.pathao*` columns. Those columns are the reason a second courier would
 * have needed a migration and a UI branch; the location mapping now lives in
 * `CourierStoreMapping`, which is keyed by provider and so already supports any
 * number of couriers per warehouse.
 *
 * The legacy columns are still written for the duration of the transition. The
 * schema keeps them and code outside the courier feature still reads them, so
 * dropping them is a separate, deliberate migration rather than something this
 * route does behind anyone's back.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  if (!['admin', 'seller'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const provider = String(body?.provider ?? body?.providerCode ?? '').trim().toLowerCase();

  if (!getCourierProviderView(provider)) {
    return NextResponse.json(
      { error: `Courier provider "${provider || 'unknown'}" is not available.` },
      { status: 400 },
    );
  }

  try {
    if (user.role === 'seller') {
      const warehouse = await prisma.warehouse.findUnique({
        where: { id },
        select: { id: true, managerId: true },
      });

      if (!warehouse) {
        return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });
      }

      if (warehouse.managerId !== String(user.id)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    }

    const contactName = optionalString(body?.contactName);
    const secondaryContact = optionalString(body?.secondaryContact);
    const otpNumber = optionalString(body?.otpNumber);

    const cityId = optionalId(body?.cityId);
    const zoneId = optionalId(body?.zoneId);
    const areaId = optionalId(body?.areaId);
    const storeId = optionalString(body?.storeId);

    // Never promote an unapproved/deactivated remote store to an active local
    // mapping. A local status flag is not proof that Pathao currently allows
    // bookings against that Store ID.
    if (storeId) {
      let remoteStores;
      try {
        remoteStores = await listCourierStores(provider);
      } catch (error) {
        logger.warn('Could not verify the courier pickup store before linking it.', {
          warehouseId: id,
          provider,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
        return NextResponse.json(
          { error: 'Could not verify this pickup point with the courier. Please retry before saving the link.' },
          { status: 503 },
        );
      }

      const selectedStore = remoteStores.find((store) => store.externalStoreId === storeId);
      if (!selectedStore || !selectedStore.active) {
        return NextResponse.json(
          { error: 'Only a pickup point currently listed as active by the courier can be linked for live booking.' },
          { status: 409 },
        );
      }
    }

    // The contact details belong to the warehouse and are courier-agnostic; the
    // ids belong to the courier and live on the mapping. Splitting them here means
    // changing courier contact fields never touches courier location state.
    const updated = await prisma.warehouse.update({
      where: { id },
      data: {
        ...(contactName ? { contactName } : {}),
        ...(secondaryContact ? { secondaryContact } : {}),
        ...(otpNumber ? { otpNumber } : {}),
        // Transition mirror, see the note above.
        ...(cityId !== undefined ? { pathaoCityId: cityId } : {}),
        ...(zoneId !== undefined ? { pathaoZoneId: zoneId } : {}),
        ...(areaId !== undefined ? { pathaoAreaId: areaId } : {}),
        ...(storeId !== undefined ? { pathaoStoreId: numericOrNull(storeId) } : {}),
      },
      select: {
        id: true,
        name: true,
        contactName: true,
        secondaryContact: true,
        otpNumber: true,
        pathaoStoreId: true,
        pathaoCityId: true,
        pathaoZoneId: true,
        pathaoAreaId: true,
      },
    });

    // A mapping row always exists for a linked warehouse, even before the pickup
    // point is registered, so the seller UI can show "location chosen, pickup
    // point not created yet" rather than an empty state.
    const mapping = await prisma.courierStoreMapping.upsert({
      where: { provider_warehouseId: { provider, warehouseId: id } },
      create: {
        provider,
        warehouseId: id,
        externalStoreId: storeId ?? `pending:${id}`,
        externalStoreName: null,
        status: storeId ? 'active' : 'pending',
        isActive: Boolean(storeId),
        cityId: cityId ?? null,
        zoneId: zoneId ?? null,
        areaId: areaId ?? null,
      },
      update: {
        // `externalStoreId` is non-nullable, so clearing the link stores the
        // sentinel rather than null. It is filtered out before any booking, and
        // `registerCourierStore` treats it as "recover this by name".
        ...(storeId !== undefined
          ? {
              externalStoreId: storeId || `pending:${id}`,
              isActive: Boolean(storeId),
              status: storeId ? 'active' : 'pending',
            }
          : {}),
        ...(cityId !== undefined ? { cityId } : {}),
        ...(zoneId !== undefined ? { zoneId } : {}),
        ...(areaId !== undefined ? { areaId } : {}),
      },
      select: {
        id: true,
        provider: true,
        externalStoreId: true,
        externalStoreName: true,
        status: true,
        isActive: true,
        cityId: true,
        zoneId: true,
        areaId: true,
      },
    });

    return NextResponse.json({
      success: true,
      warehouse: {
        id: updated.id,
        name: updated.name,
        courier: {
          provider: mapping.provider,
          storeId: mapping.externalStoreId,
          cityId: mapping.cityId,
          zoneId: mapping.zoneId,
          areaId: mapping.areaId,
          status: mapping.status,
          isActive: mapping.isActive,
        },
        contact: {
          name: updated.contactName,
          secondaryPhone: updated.secondaryContact,
          otpNumber: updated.otpNumber,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to update warehouse courier link.', {
      warehouseId: id,
      provider,
      reason: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to update the courier link' }, { status: 500 });
  }
}

function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/**
 * Distinguishes "not supplied" (`undefined`, leave alone) from "cleared" (`null`).
 * Collapsing the two would make it impossible to clear a mapping, and would let an
 * unrelated save wipe a pickup point link.
 */
function optionalId(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function numericOrNull(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
