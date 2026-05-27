import { NextResponse } from 'next/server';
import { getOrSetCache } from '@/src/services/cache/store';
import { privateNoStore } from '@/src/server/httpCache';
import { inventoryModule } from '@/src/modules/inventory';
import { secureApiRoute } from '@/src/server/next/apiSecurity';
import { apiSuccess } from '@/src/lib/api-response';
import { withTenantContext } from '@/src/services/database/tenantContext';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const user = await secureApiRoute(req, {
    keyPrefix: 'api:v2:inventory',
    requireAuth: true,
    roles: ['admin', 'seller'],
    limit: 120,
  });
  if (user instanceof NextResponse) return user;

  const sellerId = String(user.id);
  const inventory = await withTenantContext(
    { tenantId: typeof user.tenantId === 'string' ? user.tenantId : undefined, bypass: user.role === 'admin' },
    () => getOrSetCache(`seller:${sellerId}:inventory`, () => inventoryModule.listSellerInventory(sellerId), 30),
  );

  return apiSuccess(inventory, {
    headers: { 'cache-control': privateNoStore() },
  });
}
