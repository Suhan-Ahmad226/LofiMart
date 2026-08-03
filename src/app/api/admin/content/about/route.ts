import { NextRequest, NextResponse } from 'next/server';
import { prismaDirect } from '../../../../../features/shared/services/database/prisma';
import { requireAdminRole, requireApiUser } from '../../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const aboutSettingKeys = [
  'about_hero_title',
  'about_hero_highlight',
  'about_hero_description',
  'about_hero_image',
  'about_mission_title',
  'about_mission_body',
  'about_why_title',
  'about_why_body',
  'about_story_image',
  'about_hero_title_bn',
  'about_hero_highlight_bn',
  'about_hero_description_bn',
  'about_mission_title_bn',
  'about_mission_body_bn',
  'about_why_title_bn',
  'about_why_body_bn',
  'about_stats_json',
  'about_team_json',
  'about_cta_en_json',
  'about_cta_bn_json',
  'about_trust_cards_json',
] as const;

type AboutSettingKey = (typeof aboutSettingKeys)[number];

const aboutSettingKeySet = new Set<string>(aboutSettingKeys);

async function requireAdmin(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  return requireAdminRole(user) || user;
}

function normalizeSettingValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (value === null || typeof value === 'undefined') return '';
  return JSON.stringify(value);
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const rows = await prismaDirect.platformSetting.findMany({
      where: { key: { in: [...aboutSettingKeys] } },
    });

    const payload = rows.reduce<Record<AboutSettingKey, string>>((acc, row) => {
      if (aboutSettingKeySet.has(row.key)) {
        acc[row.key as AboutSettingKey] = row.value;
      }
      return acc;
    }, {} as Record<AboutSettingKey, string>);

    return NextResponse.json(payload);
  } catch (error) {
    console.error('GET /api/admin/content/about error:', error);
    return NextResponse.json({ error: 'Failed to load about content' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json().catch(() => ({}));
    const updates = Object.entries(body)
      .filter(([key]) => aboutSettingKeySet.has(key))
      .map(([key, value]) => ({
        key,
        value: normalizeSettingValue(value),
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

    return NextResponse.json({ success: true, updated: updates.length });
  } catch (error) {
    console.error('PATCH /api/admin/content/about error:', error);
    return NextResponse.json({ error: 'Failed to save about content' }, { status: 500 });
  }
}

export const PUT = PATCH;
