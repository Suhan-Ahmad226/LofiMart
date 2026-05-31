import { NextRequest, NextResponse } from 'next/server';
import { prismaDirect } from '@/src/services/database/prisma';
import { deleteCache } from '@/src/services/cache/store';
import {
  AVAILABLE_CHECKOUT_PAYMENT_METHODS,
  AVAILABLE_COURIER_PROVIDERS,
  AVAILABLE_MANUAL_ORDER_PAYMENT_METHODS,
} from '@/src/lib/commerce-channels';
import { requireAdminRole, requireApiUser } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const defaultSettings = {
  platform_name: 'LofiMart',
  support_email: 'support@lofimart.com',
  commission_rate: '12',
  currency: 'BDT',
  require2fa: 'true',
  autoApproveSellers: 'false',
  exit_intent_enabled: 'true',
  exit_intent_title: 'Keep your shortlist moving with a softer first order',
  exit_intent_message: 'Use code',
  exit_intent_code: 'WELCOME10',
  exit_intent_primary_cta: 'Review cart',
  exit_intent_secondary_cta: 'Keep browsing',
  enabled_checkout_payment_methods: 'cod',
  enabled_manual_order_payment_methods: 'cod',
  enabled_courier_providers: 'pathao',
} as const;

const settingKeys = Object.keys(defaultSettings);
const settingKeySet = new Set(settingKeys);

async function requireAdmin(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  return requireAdminRole(user) || user;
}

function normalizeCsv(value: unknown, allowed: readonly string[], fallback: string) {
  const next = String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .filter((item) => allowed.includes(item));

  return next.length > 0 ? next.join(',') : fallback;
}

function normalizeValue(key: string, value: unknown) {
  if (key === 'enabled_checkout_payment_methods') {
    return normalizeCsv(value, AVAILABLE_CHECKOUT_PAYMENT_METHODS, defaultSettings.enabled_checkout_payment_methods);
  }

  if (key === 'enabled_manual_order_payment_methods') {
    return normalizeCsv(value, AVAILABLE_MANUAL_ORDER_PAYMENT_METHODS, defaultSettings.enabled_manual_order_payment_methods);
  }

  if (key === 'enabled_courier_providers') {
    return normalizeCsv(value, AVAILABLE_COURIER_PROVIDERS, defaultSettings.enabled_courier_providers);
  }

  if (key === 'commission_rate') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? String(Math.max(0, Math.min(numeric, 100))) : defaultSettings.commission_rate;
  }

  if (key === 'require2fa' || key === 'autoApproveSellers' || key === 'exit_intent_enabled') {
    return String(value) === 'true' ? 'true' : 'false';
  }

  return String(value ?? defaultSettings[key as keyof typeof defaultSettings] ?? '').trim();
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const rows = await prismaDirect.platformSetting.findMany({
      where: { key: { in: settingKeys } },
    });

    const savedSettings = rows.reduce<Record<string, string>>((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    return NextResponse.json({
      ...defaultSettings,
      ...savedSettings,
    });
  } catch (error) {
    console.error('GET /api/admin/settings error:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json().catch(() => ({}));
    const updates = Object.entries(body)
      .filter(([key]) => settingKeySet.has(key))
      .map(([key, value]) => ({
        key,
        value: normalizeValue(key, value),
      }));

    await prismaDirect.$transaction(
      updates.map((setting) =>
        prismaDirect.platformSetting.upsert({
          where: { key: setting.key },
          create: setting,
          update: { value: setting.value },
        }),
      ),
    );

    await deleteCache('platform:commerce-channel-settings');

    return NextResponse.json({ success: true, updated: updates.length });
  } catch (error) {
    console.error('PATCH /api/admin/settings error:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}

export const PUT = PATCH;
