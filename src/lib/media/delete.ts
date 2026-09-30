import { prisma } from '@/lib/server';
import { logger } from '@/lib/logger';
import { getCloudinaryClient, parseCloudinaryAssetUrl, type CloudinaryAssetRef } from './cloudinary';

export type DeleteMediaResult = {
  publicId: string;
  resourceType: string;
  deleted: boolean;
  alreadyMissing: boolean;
};

type DeleteMediaInput = {
  publicId?: string | null;
  url?: string | null;
  resourceType?: string | null;
};

export function resolveAssetRef(input: DeleteMediaInput): CloudinaryAssetRef | null {
  if (input.publicId) {
    return {
      publicId: input.publicId,
      resourceType:
        input.resourceType === 'video' || input.resourceType === 'raw' ? input.resourceType : 'image',
    };
  }

  return parseCloudinaryAssetUrl(input.url);
}

export async function deleteMedia(input: DeleteMediaInput): Promise<DeleteMediaResult | null> {
  const ref = resolveAssetRef(input);
  if (!ref) return null;

  const cloudinary = getCloudinaryClient();
  const result = await cloudinary.uploader.destroy(ref.publicId, {
    resource_type: ref.resourceType,
    invalidate: true,
  });

  const alreadyMissing = result.result === 'not found';
  const deleted = result.result === 'ok' || alreadyMissing;

  if (!deleted) {
    throw new Error(`Cloudinary delete failed for ${ref.resourceType}:${ref.publicId}`);
  }

  await prisma.mediaAsset
    .updateMany({
      where: { publicId: ref.publicId, resourceType: ref.resourceType },
      data: { status: 'deleted', deletedAt: new Date() },
    })
    .catch(() => undefined);

  logger.info('MEDIA_DELETE_SUCCESS', {
    publicId: ref.publicId,
    resourceType: ref.resourceType,
    alreadyMissing,
  });

  return {
    publicId: ref.publicId,
    resourceType: ref.resourceType,
    deleted,
    alreadyMissing,
  };
}

export async function deleteManyMedia(items: DeleteMediaInput[]) {
  const results: Array<DeleteMediaResult | null> = [];
  const errors: Array<{ item: DeleteMediaInput; error: string }> = [];

  for (const item of items) {
    try {
      results.push(await deleteMedia(item));
    } catch (error) {
      errors.push({
        item,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (errors.length > 0) {
    logger.warn('MEDIA_CLEANUP_FAILED', { errors });
  }

  return { results, errors };
}

