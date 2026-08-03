import { NextResponse } from 'next/server';
import { prismaDirect } from '../../../../features/shared/services/database/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fallbackConfig = {
  free_shipping_threshold: 2500,
  low_stock_threshold: Number(process.env.LOW_STOCK_THRESHOLD || 5),
  cart_recovery_delay_mins: 120,
  enabled_checkout_payment_methods: ['cod'],
  enabled_manual_order_payment_methods: ['cod'],
  enabled_courier_providers: ['pathao'],
  exit_intent: {
    enabled: true,
    title: 'Keep your shortlist moving with a softer first order',
    message: 'Use code WELCOME10 for an extra conversion push on your next checkout.',
    code: 'WELCOME10',
    primary_cta: 'Review cart',
    secondary_cta: 'Keep browsing',
  },
};

function toPlainNumber(value: unknown, fallback: number) {
  if (value === null || typeof value === 'undefined') return fallback;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value && 'toNumber' in value && typeof (value as any).toNumber === 'function') {
    return (value as any).toNumber();
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export async function GET() {
  try {
    const [tenantSetting, rawSettings] = await Promise.all([
      prismaDirect.tenantSetting.findFirst({
        orderBy: { createdAt: 'asc' },
      }),
      prismaDirect.platformSetting.findMany({
        where: {
          key: {
            in: [
              'exit_intent_enabled',
              'exit_intent_title',
              'exit_intent_message',
              'exit_intent_code',
              'exit_intent_primary_cta',
              'exit_intent_secondary_cta',
            ],
          },
        },
      }),
    ]);

    const settingMap = rawSettings.reduce<Record<string, string>>((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    return NextResponse.json({
      ...fallbackConfig,
      free_shipping_threshold: toPlainNumber(tenantSetting?.freeShippingThreshold, 2500),
      cart_recovery_delay_mins: tenantSetting?.cartRecoveryDelayMins ?? 120,
      exit_intent: {
        enabled: settingMap.exit_intent_enabled !== 'false',
        title: settingMap.exit_intent_title || fallbackConfig.exit_intent.title,
        message: settingMap.exit_intent_message || fallbackConfig.exit_intent.message,
        code: settingMap.exit_intent_code || fallbackConfig.exit_intent.code,
        primary_cta: settingMap.exit_intent_primary_cta || fallbackConfig.exit_intent.primary_cta,
        secondary_cta: settingMap.exit_intent_secondary_cta || fallbackConfig.exit_intent.secondary_cta,
      },
    });
  } catch (error) {
    console.error('GET /api/public/commerce-config error:', error);
    return NextResponse.json(fallbackConfig, {
      headers: {
        'X-Data-Source': 'fallback',
      },
    });
  }
}
