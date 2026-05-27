import { NextResponse } from 'next/server';
import { getOrSetCache } from '@/src/services/cache/store';
import { privateNoStore } from '@/src/server/httpCache';
import { inventoryModule } from '@/src/modules/inventory';
import { enqueueInventoryAlertScan } from '@/src/workers/queue';
import { getServerEnv } from '@/src/lib/env';
import { secureApiRoute } from '@/src/server/next/apiSecurity';
import { apiSuccess } from '@/src/lib/api-response';
import { withTenantContext } from '@/src/services/database/tenantContext';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const user = await secureApiRoute(req, {
    keyPrefix: 'api:v2:seller:inventory-alerts',
    requireAuth: true,
    roles: ['seller'],
    limit: 60,
  });
  if (user instanceof NextResponse) return user;

  const sellerId = String(user.id);
  const threshold = getServerEnv().LOW_STOCK_THRESHOLD;
  const items = await withTenantContext(
    { tenantId: typeof user.tenantId === 'string' ? user.tenantId : undefined },
    () => getOrSetCache(
      `seller:${sellerId}:inventory-alerts:${threshold}`,
      () => inventoryModule.listLowStockProducts(sellerId, threshold),
      30,
    ),
  );

  void enqueueInventoryAlertScan(sellerId);

  return apiSuccess(items, {
    headers: { 'cache-control': privateNoStore() },
  });
}
