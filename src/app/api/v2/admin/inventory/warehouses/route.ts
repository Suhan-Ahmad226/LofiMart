import { NextResponse } from 'next/server';
import { z } from 'zod';
import { inventoryModule } from '../../../../../../modules/inventory';
import { deleteCache, getOrSetCache } from '../../../../../../features/shared/services/cache/store';
import { privateNoStore } from '../../../../../../server/httpCache';
import { secureApiRoute } from '../../../../../../server/next/apiSecurity';
import { apiError, apiSuccess } from '../../../../../../lib/api-response';
import { invalidateInventoryCache } from '../../../../../../features/shared/services/cache/invalidation';
import { withTenantContext } from '../../../../../../features/shared/services/database/tenantContext';

export const runtime = 'nodejs';

const WarehouseInputSchema = z.object({
  name: z.string().trim().min(1),
  location: z.object({
    address: z.string().trim().min(1),
    city: z.string().trim().min(1),
    state: z.string().trim().optional(),
    country: z.string().trim().min(1),
    postalCode: z.string().trim().min(1),
  }),
  contact: z
    .object({
      phone: z.string().trim().optional(),
      email: z.string().trim().email().optional(),
    })
    .optional(),
  capacity: z
    .object({
      maxItems: z.number().int().positive().optional(),
      maxWeightKg: z.number().positive().optional(),
    })
    .optional(),
});

export async function GET(req: Request) {
  const result = await secureApiRoute(req, {
    keyPrefix: 'api:v2:admin:inventory:warehouses',
    requireAuth: true,
    roles: ['admin', 'seller'],
    limit: 120,
  });
  if (result instanceof NextResponse) return result;
  if (!result.authorized || !result.user) return apiError('unauthorized', 'Unauthorized', 401);

  const user = result.user;
  const warehouses = await withTenantContext(
    { tenantId: typeof user.tenantId === 'string' ? user.tenantId : undefined, bypass: user.role === 'admin' },
    () => getOrSetCache(`inventory:warehouses:${user.role === 'admin' ? 'global' : String(user.tenantId || 'none')}`, () => inventoryModule.listWarehouses(), 300),
  );

  return apiSuccess(warehouses, {
    headers: { 'cache-control': privateNoStore() },
  });
}

export async function POST(req: Request) {
  const result = await secureApiRoute(req, {
    keyPrefix: 'api:v2:admin:inventory:warehouses:mutate',
    requireAuth: true,
    roles: ['admin'],
    limit: 30,
  });
  if (result instanceof NextResponse) return result;
  if (!result.authorized || !result.user) return apiError('unauthorized', 'Unauthorized', 401);

  const user = result.user;

  const parsed = WarehouseInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return apiError('invalid_warehouse_payload', 'Invalid warehouse payload', 400, parsed.error.flatten());
  }

  const warehouse = await withTenantContext(
    { tenantId: typeof user.tenantId === 'string' ? user.tenantId : undefined, bypass: user.role === 'admin' },
    () => inventoryModule.createWarehouse(parsed.data),
  );
  await deleteCache('inventory:warehouses:global');
  if (user.role !== 'admin') await deleteCache(`inventory:warehouses:${String(user.tenantId || 'none')}`);
  await invalidateInventoryCache();

  return apiSuccess(warehouse, {
    status: 201,
    headers: { 'cache-control': privateNoStore() },
  });
}
