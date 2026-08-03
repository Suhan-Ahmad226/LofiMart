import { NextResponse } from 'next/server';
import { getOrSetCache } from '../../../../../features/shared/services/cache/store';
import { privateNoStore } from '../../../../../server/httpCache';
import { inventoryModule } from '../../../../../modules/inventory';
import { enqueueInventoryAlertScan } from '../../../../../workers/queue';
import { getServerEnv } from '../../../../../lib/env';
import { secureApiRoute } from '../../../../../server/next/apiSecurity';
import { apiSuccess } from '../../../../../lib/api-response';
import { withTenantContext } from '../../../../../features/shared/services/database/tenantContext';

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
