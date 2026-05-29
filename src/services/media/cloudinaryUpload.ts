import { v2 as cloudinary } from 'cloudinary';
import { getServerEnv } from '../../lib/env';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'application/pdf',
]);

let configured = false;

function ensureConfigured() {
  if (configured) return;

  const env = getServerEnv();
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary is not configured');
  }

  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  configured = true;
}

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

export async function uploadDataUrlToCloudinary(input: {
  dataUrl: string;
  folder: string;
  publicIdPrefix: string;
  resourceType?: 'image' | 'raw' | 'auto';
}) {
  ensureConfigured();

  const result = await cloudinary.uploader.upload(input.dataUrl, {
    folder: input.folder,
    public_id: `${input.publicIdPrefix}-${Date.now()}`,
    resource_type: input.resourceType ?? 'auto',
    overwrite: false,
    unique_filename: true,
    invalidate: false,
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    bytes: result.bytes,
    resourceType: result.resource_type,
    format: result.format,
  };
}
