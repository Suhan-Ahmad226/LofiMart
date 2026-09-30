import { getCloudinaryClient, type MediaResourceType } from './cloudinary';
import { prisma } from '@/lib/server';
import { logger } from '@/lib/logger';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'application/pdf',
]);

export type UploadMediaInput = {
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
  folder: string;
  publicIdPrefix: string;
  resourceType?: MediaResourceType;
  ownerType: string;
  ownerId: string;
  entityType?: string | null;
  entityId?: string | null;
  fieldName?: string | null;
};

export function validateUploadInput(file: { dataUrl?: string; mimeType?: string; sizeBytes?: number }) {
  if (!file.dataUrl) {
    throw new Error('Missing file data');
  }

  if (!file.mimeType || !ALLOWED_MIME_TYPES.has(file.mimeType)) {
    throw new Error('Unsupported file type');
  }

  if (!file.sizeBytes || file.sizeBytes <= 0 || file.sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new Error('File exceeds allowed size limit');
  }
}

export async function uploadMedia(input: UploadMediaInput) {
  validateUploadInput({
    dataUrl: input.dataUrl,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });

  const cloudinary = getCloudinaryClient();
  const result = await cloudinary.uploader.upload(input.dataUrl, {
    folder: input.folder,
    public_id: `${input.publicIdPrefix}-${Date.now()}`,
    resource_type: input.resourceType ?? 'auto',
    overwrite: false,
    unique_filename: true,
    invalidate: false,
    transformation: input.mimeType.startsWith('image/')
      ? [{ quality: 'auto:good', fetch_format: 'auto' }]
      : undefined,
  });

  const asset = await prisma.mediaAsset.upsert({
    where: {
      publicId_resourceType: {
        publicId: result.public_id,
        resourceType: result.resource_type,
      },
    },
    create: {
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      fieldName: input.fieldName ?? null,
      status: 'active',
      bytes: result.bytes ?? null,
      format: result.format ?? null,
    },
    update: {
      url: result.secure_url,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      fieldName: input.fieldName ?? null,
      status: 'active',
      deletedAt: null,
      bytes: result.bytes ?? null,
      format: result.format ?? null,
    },
  });

  logger.info('MEDIA_UPLOAD_SUCCESS', {
    mediaAssetId: asset.id,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    resourceType: result.resource_type,
  });

  return {
    url: result.secure_url,
    secureUrl: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type,
    bytes: result.bytes,
    format: result.format,
    mediaAssetId: asset.id,
  };
}

