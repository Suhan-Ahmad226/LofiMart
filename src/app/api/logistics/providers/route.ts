import { NextRequest, NextResponse } from 'next/server';

import { listCourierProviders } from '@/features/courier/registry/providerRegistry';
import { getCommerceChannelSettings } from '@/features/shared/services/platform/commerceChannels';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The registered courier providers, with their capabilities.
 *
 * This is the single endpoint a client uses to discover which couriers exist and
 * what each one can do. The UI reads `capabilities` to decide which actions to
 * render, so a courier that cannot cancel never shows a cancel button — and
 * adding a courier makes its actions appear with no UI change.
 *
 * Public: a shopper needs to know which courier will carry their parcel. Only
 * non-secret capability and lifecycle data is returned; credentials and tokens
 * are never part of a `CourierProviderView`.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeDisabled = searchParams.get('includeDisabled') === 'true';

    const settings = await getCommerceChannelSettings();
    // Widened to `string` because `courierProviders` is typed as the closed
    // `'pathao'` union while `provider.code` is a plain string. The set is built
    // from the union deliberately — the registry decides which codes exist, this
    // list only records which of them the operator switched on.
    const enabled = new Set<string>(settings.courierProviders);

    const providers = listCourierProviders().map((provider) => ({
      code: provider.code,
      name: provider.name,
      shortLabel: provider.shortLabel ?? provider.name,
      brandColor: provider.brandColor ?? null,
      lifecycle: provider.lifecycle,
      health: provider.health,
      capabilities: provider.capabilities,
      supportsCod: provider.supportsCod,
      supportsTrackingSync: provider.supportsTrackingSync,
      supportsPickupBooking: provider.supportsPickupBooking,
      setupStatus: provider.setupStatus,
      setupMessage: provider.setupMessage,
      // A provider that is not fully configured is reported, not hidden, so an
      // operator can see *why* the courier is unavailable.
      enabled: enabled.has(provider.code) && provider.setupStatus === 'api_ready',
    }));

    return NextResponse.json(
      includeDisabled ? providers : providers.filter((provider) => provider.enabled),
    );
  } catch (error) {
    logger.error('GET /api/logistics/providers failed.', {
      reason: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json([], { headers: { 'X-Data-Source': 'fallback' } });
  }
}
