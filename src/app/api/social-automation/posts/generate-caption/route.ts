import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { prisma } from '@/lib/server';
import { requireApiUser, requireSellerRole } from '../../../_compat/shared';
import { generateSocialCaption } from '@/features/social-automation/services/caption.service';
import { getOrCreateSettings } from '@/features/social-automation/services/social-automation.service';
import { toPlainNumber } from '@/app/api/products/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid request', details: error.flatten() }, { status: 400 });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Caption generation failed' },
    { status: 400 },
  );
}

function captionStatus(code: string | undefined) {
  if (code === 'AI_DISABLED') return 403;
  if (code === 'AI_NOT_CONFIGURED') return 503;
  return 502;
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  try {
    const body = (await request.json()) as { productId?: unknown };
    if (typeof body.productId !== 'string' || !body.productId) {
      return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 });
    }

    const sellerId = String(user.id);
    const [product, seller] = await Promise.all([
      prisma.product.findFirst({ where: { id: body.productId, sellerId } }),
      prisma.user.findUnique({ where: { id: sellerId }, select: { storeName: true } }),
    ]);

    if (!product) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }

    const [settings] = await Promise.all([getOrCreateSettings(sellerId)]);
    const result = await generateSocialCaption(
      {
        name: product.name,
        description: product.description,
        price: toPlainNumber(product.price) ?? 0,
        oldPrice: toPlainNumber(product.oldPrice),
        stock: product.stock,
        category: product.category,
        available: product.stock > 0,
        sellerStoreName: seller?.storeName ?? null,
      },
      {
        language: settings.language,
        tone: settings.tone,
        captionLength: settings.captionLength,
        hashtags: settings.hashtags,
        ctaEnabled: settings.ctaEnabled,
        aiCaptionEnabled: settings.aiCaptionEnabled,
      },
    );

    if (!result.ok) {
      return NextResponse.json(result, { status: captionStatus(result.code) });
    }

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
