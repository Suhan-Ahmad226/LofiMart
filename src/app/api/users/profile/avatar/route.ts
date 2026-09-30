import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { getProfilePayload, requireApiUser } from '@/app/api/_compat/shared';
import { deleteMedia, enqueueMediaDelete, replaceMedia, validateUploadInput } from '@/lib/media';
import { takeRateLimit } from '@/features/auth/services/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { allowed, resetAfterMs } = await takeRateLimit(`profile-avatar:${user.id}`, {
    limit: 10,
    windowMs: 60_000,
  });

  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many avatar uploads. Please wait a moment and try again.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(resetAfterMs / 1000)) },
      },
    );
  }

  const body = await request.json().catch(() => ({}));
  const file = {
    dataUrl: typeof body?.data_url === 'string' ? body.data_url : undefined,
    mimeType: typeof body?.mime_type === 'string' ? body.mime_type : undefined,
    sizeBytes: typeof body?.size_bytes === 'number' ? body.size_bytes : undefined,
  };

  try {
    validateUploadInput(file);

    if (!file.mimeType?.startsWith('image/')) {
      return NextResponse.json({ error: 'Upload an image file.' }, { status: 400 });
    }

    const current = await prisma.user.findUnique({
      where: { id: String(user.id) },
      select: { avatarUrl: true },
    });

    const { uploaded } = await replaceMedia({
      oldUrl: current?.avatarUrl,
      upload: {
        dataUrl: file.dataUrl!,
        mimeType: file.mimeType!,
        sizeBytes: file.sizeBytes!,
        folder: 'lofimart/avatars',
        publicIdPrefix: String(user.id),
        resourceType: 'image',
        ownerType: 'User',
        ownerId: String(user.id),
        entityType: 'User',
        entityId: String(user.id),
        fieldName: 'avatarUrl',
      },
      updateDatabase: (nextUrl) =>
        prisma.user.update({
          where: { id: String(user.id) },
          data: { avatarUrl: nextUrl },
        }),
    });

    const payload = await getProfilePayload(String(user.id));
    if (!payload) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ ...payload, success: true, avatar_url: uploaded.url });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload avatar.' },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const current = await prisma.user.findUnique({
    where: { id: String(user.id) },
    select: { avatarUrl: true },
  });

  if (!current?.avatarUrl) {
    const payload = await getProfilePayload(String(user.id));
    return NextResponse.json({ ...payload, success: true, avatar_url: null });
  }

  try {
    await deleteMedia({ url: current.avatarUrl });
  } catch (error) {
    await enqueueMediaDelete({
      url: current.avatarUrl,
      reason: 'profile-avatar-delete',
      entityType: 'User',
      entityId: String(user.id),
    });
  }

  await prisma.user.update({
    where: { id: String(user.id) },
    data: { avatarUrl: null },
  });

  const payload = await getProfilePayload(String(user.id));
  return NextResponse.json({ ...payload, success: true, avatar_url: null });
}
