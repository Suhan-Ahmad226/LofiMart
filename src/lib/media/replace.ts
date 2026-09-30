import { logger } from '@/lib/logger';
import { uploadMedia, type UploadMediaInput } from './upload';
import { deleteMedia } from './delete';
import { enqueueMediaDelete } from './queue';

export async function replaceMedia<T>(input: {
  upload: UploadMediaInput;
  oldUrl?: string | null;
  updateDatabase: (nextUrl: string) => Promise<T>;
}) {
  const uploaded = await uploadMedia(input.upload);

  try {
    const updated = await input.updateDatabase(uploaded.url);

    if (input.oldUrl && input.oldUrl !== uploaded.url) {
      try {
        await deleteMedia({ url: input.oldUrl });
      } catch (error) {
        await enqueueMediaDelete({
          url: input.oldUrl,
          reason: 'replace-old-asset',
        });
        logger.warn('MEDIA_DELETE_RETRY', {
          reason: 'replace-old-asset',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('MEDIA_REPLACE_SUCCESS', {
      ownerType: input.upload.ownerType,
      ownerId: input.upload.ownerId,
      entityType: input.upload.entityType ?? null,
      entityId: input.upload.entityId ?? null,
    });

    return { uploaded, updated };
  } catch (error) {
    await deleteMedia({ publicId: uploaded.publicId, resourceType: uploaded.resourceType }).catch(async () => {
      await enqueueMediaDelete({
        publicId: uploaded.publicId,
        resourceType: uploaded.resourceType,
        reason: 'replace-db-failed-new-asset',
      });
    });
    throw error;
  }
}

