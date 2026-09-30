import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '../../products/shared';
import { uploadMedia, validateUploadInput } from '@/lib/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  if (!['admin', 'seller'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
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
