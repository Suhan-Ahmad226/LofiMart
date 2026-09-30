import { NextRequest, NextResponse } from 'next/server';

import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import {
  listCourierStoreMappings,
  listCourierStores,
  registerCourierStore,
} from '@/features/courier/services/courierAdminService';
import type { CourierLocationRef } from '@/features/courier/core/contracts';
import { logger } from '@/lib/logger';
import {
  courierErrorResponse,
  normalizeProviderCode,
  requireProviderViewOr404,
} from '../_shared/routeHelpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Courier pickup points.
 *
 * GET lists what the courier has registered (admin only — it is another
 * merchant's account-wide view) plus every LofiMart store mapping, including
 * mappings still awaiting courier approval.
 *
 * POST registers one of our warehouses as a pickup point. Idempotent by
 * construction; see `registerCourierStore` for why that matters.
 */
export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireRole(['admin', 'seller'])(user);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const providerCode = normalizeProviderCode(searchParams.get('provider'));
  const warehouseId = searchParams.get('warehouseId')?.trim() || null;

  const { response: guard } = requireProviderViewOr404(providerCode);
  if (guard) return guard;

  try {
    const mappings = await listCourierStoreMappings(warehouseId);

    // The remote list is the merchant's whole account, so it is admin-only even
    // though the endpoint is shared with sellers.
    const remote =
      user.role === 'admin' ? await listCourierStores(providerCode).catch(() => null) : null;

    // A seller only ever sees their own warehouses' mappings. Filtering in the
    // query rather than after the fact keeps the response itself free of
    // another seller's store ids.
    const scoped =
      user.role === 'admin'
        ? mappings
        : await prisma.courierStoreMapping.findMany({
            where: {
              provider: providerCode,
              warehouse: { managerId: String(user.id) },
              ...(warehouseId ? { warehouseId } : {}),
            },
            orderBy: { createdAt: 'desc' },
          });

    return NextResponse.json({
      provider: providerCode,
      remoteStores: remote?.map((store) => ({
        externalStoreId: store.externalStoreId,
        externalStoreName: store.externalStoreName ?? null,
        active: store.active === true,
        // Provider-specific detail (address, hub) travels as opaque metadata, so
        // this route stays courier-agnostic and the UI can still label a store
        // without knowing which courier issued it.
        metadata: store.metadata ?? null,
      })),
      mappings: scoped.map((mapping) => ({
        id: mapping.id,
        warehouseId: mapping.warehouseId,
        externalStoreId: mapping.externalStoreId,
        externalStoreName: mapping.externalStoreName,
        status: mapping.status,
        isActive: mapping.isActive,
        // True once the courier has approved the pickup point and it can be
        // booked against.
        bookable: mapping.isActive && mapping.status === 'active',
        cityId: mapping.cityId,
        zoneId: mapping.zoneId,
        areaId: mapping.areaId,
        lastError: mapping.lastError,
        updatedAt: mapping.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return courierErrorResponse(error, { operation: 'listCourierStores', provider: providerCode });
  }
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireRole(['admin', 'seller'])(user);
  if (roleError) return roleError;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const providerCode = normalizeProviderCode(
    body.provider ?? new URL(request.url).searchParams.get('provider'),
  );
  const warehouseId = typeof body.warehouseId === 'string' ? body.warehouseId.trim() : '';

  if (!warehouseId) {
    return NextResponse.json({ error: 'warehouseId is required.' }, { status: 400 });
  }

  const { response: guard } = requireProviderViewOr404(providerCode);
  if (guard) return guard;

  // Ownership is checked before any courier call, so a seller cannot register a
  // stranger's warehouse and learn anything about the courier account.
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
      managerId: true,
    },
  });

  if (!warehouse) {
    return NextResponse.json({ error: 'Warehouse not found.' }, { status: 404 });
  }

  if (user.role !== 'admin' && warehouse.managerId !== String(user.id)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // A pickup point must be placed by mapped ids, never by a free-text city name.
  // Falling back to a guessed default here would register the store against the
  // wrong hub and misroute every parcel collected from it.
  const cityId = toPositiveInt(body.cityId);
  const zoneId = toPositiveInt(body.zoneId);
  const areaId = toPositiveInt(body.areaId);

  if (cityId === null || zoneId === null || areaId === null) {
    return NextResponse.json(
      {
        error:
          'The pickup point needs a mapped city, zone and area. Pick them from the courier location list rather than typing a city name.',
      },
      { status: 400 },
    );
  }

  const location: CourierLocationRef = {
    provider: providerCode,
    cityId,
    zoneId,
    areaId,
    label: warehouse.city,
  };

  try {
    const result = await registerCourierStore({
      providerCode,
      warehouseId,
      store: {
        name: warehouse.name,
        contactName: warehouse.contactName || warehouse.name,
        contactPhone: warehouse.phone ?? '',
        secondaryPhone: warehouse.secondaryContact ?? null,
        otpNumber: warehouse.otpNumber ?? null,
        address: warehouse.address,
        location,
      },
    });

    // A newly created store is under courier review, which is a success state
    // with a different message — not a failure, and not "ready to book".
    return NextResponse.json(
      {
        success: true,
        created: result.created,
        provider: result.provider,
        externalStoreId: result.externalStoreId,
        externalStoreName: result.externalStoreName,
        // 201 only when a store was actually created; a recovered or existing
        // mapping is a 200 because nothing new was made.
        message: result.message,
        bookable: result.approved,
        mapping: {
          id: result.mapping.id,
          warehouseId: result.mapping.warehouseId,
          externalStoreId: result.mapping.externalStoreId,
          status: result.mapping.status,
          isActive: result.mapping.isActive,
          bookable: result.mapping.isActive && result.mapping.status === 'active',
          cityId: result.mapping.cityId,
          zoneId: result.mapping.zoneId,
          areaId: result.mapping.areaId,
        },
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    logger.warn('Courier store registration failed.', {
      providerCode,
      warehouseId,
      reason: error instanceof Error ? error.message : 'Unknown error',
    });
    return courierErrorResponse(error, { operation: 'registerCourierStore', provider: providerCode });
  }
}

function toPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}
