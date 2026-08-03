import { NextRequest, NextResponse } from 'next/server';
import { courierProviderRegistry } from '../../../../features/courier/services/providerRegistry';
import { getCommerceChannelSettings } from '../../../../features/shared/services/platform/commerceChannels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeDisabled = searchParams.get('includeDisabled') === 'true';
    const settings = await getCommerceChannelSettings();
    const enabled = new Set(settings.courierProviders);

    const providers = courierProviderRegistry.listProviders().map((provider) => ({
      ...provider,
      enabled: enabled.has(provider.code as any),
    }));

    return NextResponse.json(includeDisabled ? providers : providers.filter((provider) => provider.enabled));
  } catch (error) {
    console.error('GET /api/logistics/providers error:', error);
    return NextResponse.json([], { headers: { 'X-Data-Source': 'fallback' } });
  }
}
