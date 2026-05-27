import { NextResponse } from 'next/server';
import { z } from 'zod';
import { inventoryModule } from '@/src/modules/inventory';
import { deleteCache, getOrSetCache } from '@/src/services/cache/store';
import { privateNoStore } from '@/src/server/httpCache';
import { secureApiRoute } from '@/src/server/next/apiSecurity';
import { apiError, apiSuccess } from '@/src/lib/api-response';
import { invalidateInventoryCache } from '@/src/services/cache/invalidation';
import { withTenantContext } from '@/src/services/database/tenantContext';

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
  const user = await secureApiRoute(req, {
    keyPrefix: 'api:v2:admin:inventory:warehouses',
    requireAuth: true,
    roles: ['admin', 'seller'],
    limit: 120,
  });
  if (user instanceof NextResponse) return user;

  const warehouses = await withTenantContext(
    { tenantId: typeof user.tenantId === 'string' ? user.tenantId : undefined, bypass: user.role === 'admin' },
    () => getOrSetCache('inventory:warehouses', () => inventoryModule.listWarehouses(), 300),
  );

  return apiSuccess(warehouses, {
    headers: { 'cache-control': privateNoStore() },
  });
}

export async function POST(req: Request) {
  const user = await secureApiRoute(req, {
    keyPrefix: 'api:v2:admin:inventory:warehouses:mutate',
    requireAuth: true,
    roles: ['admin'],
    limit: 30,
  });
  if (user instanceof NextResponse) return user;

  const parsed = WarehouseInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return apiError('invalid_warehouse_payload', 'Invalid warehouse payload', 400, parsed.error.flatten());
  }

  const warehouse = await withTenantContext(
    { tenantId: typeof user.tenantId === 'string' ? user.tenantId : undefined, bypass: user.role === 'admin' },
    () => inventoryModule.createWarehouse(parsed.data),
  );
  await deleteCache('inventory:warehouses');
  await invalidateInventoryCache();

  return apiSuccess(warehouse, {
    status: 201,
    headers: { 'cache-control': privateNoStore() },
  });
}
