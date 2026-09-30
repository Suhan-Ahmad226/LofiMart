import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireApiUser, requireSellerRole } from '../../_compat/shared';
import { getOrCreateSettings, updateSettings } from '@/features/social-automation/services/social-automation.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serializeSettings(settings: Awaited<ReturnType<typeof getOrCreateSettings>>) {
  return {
    id: settings.id,
    language: settings.language,
    tone: settings.tone,
    caption_length: settings.captionLength,
    hashtags: settings.hashtags,
    cta_enabled: settings.ctaEnabled,
    ai_caption_enabled: settings.aiCaptionEnabled,
    default_interval_days: settings.defaultIntervalDays,
    default_posting_time: settings.defaultPostingTime,
    default_duration_mode: settings.defaultDurationMode,
    default_max_posts: settings.defaultMaxPosts,
    default_end_at: settings.defaultEndAt?.toISOString() ?? null,
    generate_new_caption_every_time: settings.generateNewCaptionEveryTime,
    use_latest_product_data: settings.useLatestProductData,
    skip_out_of_stock: settings.skipOutOfStock,
  };
}

function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid settings', details: error.flatten() }, { status: 400 });
  }

  return NextResponse.json({ error: error instanceof Error ? error.message : 'Settings request failed' }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  try {
    return NextResponse.json(serializeSettings(await getOrCreateSettings(String(user.id))));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  try {
    const body = await request.json();
    return NextResponse.json(serializeSettings(await updateSettings(String(user.id), body)));
  } catch (error) {
    return apiError(error);
  }
}
