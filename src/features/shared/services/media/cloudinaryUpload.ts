import { uploadMedia, validateUploadInput, type MediaResourceType } from '@/lib/media';

export { validateUploadInput };

export async function uploadDataUrlToCloudinary(input: {
  dataUrl: string;
  folder: string;
  publicIdPrefix: string;
  resourceType?: MediaResourceType;
  ownerType?: string;
  ownerId?: string;
  entityType?: string | null;
  entityId?: string | null;
  fieldName?: string | null;
}) {
  return uploadMedia({
    dataUrl: input.dataUrl,
    mimeType: input.dataUrl.match(/^data:([^;]+);/)?.[1] || 'image/jpeg',
    sizeBytes: Math.max(1, Math.ceil(input.dataUrl.length * 0.75)),
    folder: input.folder,
    publicIdPrefix: input.publicIdPrefix,
    resourceType: input.resourceType,
    ownerType: input.ownerType || 'unknown',
    ownerId: input.ownerId || 'unknown',
    entityType: input.entityType,
    entityId: input.entityId,
    fieldName: input.fieldName,
  });
}
