import { NextResponse } from 'next/server';
import { prismaDirect } from '@/src/services/database/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const settingKeys = [
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

function parseJson(value: string | undefined, fallback: unknown[] | Record<string, string>) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function GET() {
  try {
    const settings = await prismaDirect.platformSetting.findMany({
      where: { key: { in: [...settingKeys] } },
    });

    const map = settings.reduce<Record<string, string>>((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});

    return NextResponse.json({
      hero_title: map.about_hero_title,
      hero_highlight: map.about_hero_highlight,
      hero_description: map.about_hero_description,
      hero_image: map.about_hero_image,
      mission_title: map.about_mission_title,
      mission_body: map.about_mission_body,
      why_title: map.about_why_title,
      why_body: map.about_why_body,
      story_image: map.about_story_image,
      hero_title_bn: map.about_hero_title_bn,
      hero_highlight_bn: map.about_hero_highlight_bn,
      hero_description_bn: map.about_hero_description_bn,
      mission_title_bn: map.about_mission_title_bn,
      mission_body_bn: map.about_mission_body_bn,
      why_title_bn: map.about_why_title_bn,
      why_body_bn: map.about_why_body_bn,
      stats: parseJson(map.about_stats_json, []),
      team: parseJson(map.about_team_json, []),
      cta_en: parseJson(map.about_cta_en_json, {}),
      cta_bn: parseJson(map.about_cta_bn_json, {}),
      trust_cards: parseJson(map.about_trust_cards_json, []),
    });
  } catch (error) {
    console.error('GET /api/public/about-page error:', error);
    return NextResponse.json({}, { headers: { 'X-Data-Source': 'fallback' } });
  }
}
