import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '../../products/shared';
import { uploadMedia, validateUploadInput } from '@/lib/media';
import { takeRateLimit } from '@/features/auth/services/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  if (!['admin', 'seller', 'reseller', 'customer'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { allowed, resetAfterMs } = await takeRateLimit(`media-upload:${user.id}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many image uploads. Please wait a moment and try again.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(resetAfterMs / 1000)) },
      },
    );
  }

  try {
    const body = (await request.json()) as {
      dataUrl?: string;
      mimeType?: string;
      sizeBytes?: number;
      entityType?: string;
      entityId?: string;
      fieldName?: string;
    };

    validateUploadInput(body);

    const result = await uploadMedia({
      dataUrl: body.dataUrl!,
      mimeType: body.mimeType!,
      sizeBytes: body.sizeBytes!,
      folder: 'lofimart/media',
      publicIdPrefix: String(user.id),
      resourceType: 'auto',
      ownerType: 'User',
      ownerId: String(user.id),
      entityType: body.entityType ?? null,
      entityId: body.entityId ?? null,
      fieldName: body.fieldName ?? null,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
