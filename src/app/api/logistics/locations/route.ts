import { NextRequest, NextResponse } from 'next/server';

import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { listCourierLocations } from '@/features/courier/services/courierAdminService';
import type { CourierLocationNode } from '@/features/courier/core/contracts';
import {
  courierErrorResponse,
  normalizeProviderCode,
  requireProviderViewOr404,
} from '../_shared/routeHelpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_LEVELS: ReadonlySet<CourierLocationNode['level']> = new Set([
  'city',
  'zone',
  'area',
  'district',
  'postcode',
  'other',
]);

/**
 * A courier's serviceable location directory.
 *
 * Generic by design: `?provider=pathao&level=city` today, `?provider=<new>&...`
 * tomorrow, with no new route. Admin and seller location pickers read this rather
 * than a courier-specific city/zone/area endpoint tree.
 *
 * Restricted to admin and sellers because the directory reveals the courier's
 * full coverage, which is a commercial detail rather than public information. It
 * is not a secret — a shopper can infer it from a quote — but there is no reason
 * to hand out the whole tree to anyone.
 */
export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireRole(['admin', 'seller'])(user);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const providerCode = normalizeProviderCode(searchParams.get('provider'));
  const level = String(searchParams.get('level') ?? 'city').trim().toLowerCase();
  const parentId = searchParams.get('parentId');

  const { response: guard } = requireProviderViewOr404(providerCode);
  if (guard) return guard;

  if (!VALID_LEVELS.has(level as CourierLocationNode['level'])) {
    return NextResponse.json(
      { error: 'level must be one of city, zone, area, district, postcode or other.' },
      { status: 400 },
    );
  }

  try {
    const nodes = await listCourierLocations(providerCode, {
      level: level as CourierLocationNode['level'],
      parentId: parentId ? parentId.trim() : null,
    });

    return NextResponse.json({ provider: providerCode, level, parentId: parentId ?? null, nodes });
  } catch (error) {
    return courierErrorResponse(error, { operation: 'listCourierLocations', provider: providerCode });
  }
}
