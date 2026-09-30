import { v2 as cloudinary } from 'cloudinary';
import { getServerEnv } from '@/lib/env';

let configured = false;

export type MediaResourceType = 'image' | 'video' | 'raw' | 'auto';

export type CloudinaryAssetRef = {
  publicId: string;
  resourceType: Exclude<MediaResourceType, 'auto'>;
};

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

export function getCloudinaryClient() {
  ensureConfigured();
  return cloudinary;
}

export function parseCloudinaryAssetUrl(url: string | null | undefined): CloudinaryAssetRef | null {
  if (!url || typeof url !== 'string') return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!/res\.cloudinary\.com$/i.test(parsed.hostname)) return null;

  const parts = parsed.pathname.split('/').filter(Boolean);
  const resourceType = parts[1];
  const uploadIndex = parts.indexOf('upload');

  if (
    uploadIndex < 0 ||
    (resourceType !== 'image' && resourceType !== 'video' && resourceType !== 'raw')
  ) {
    return null;
  }

  const afterUpload = parts.slice(uploadIndex + 1);
  const versionIndex = afterUpload.findIndex((part) => /^v\d+$/.test(part));
  const publicPathParts = versionIndex >= 0 ? afterUpload.slice(versionIndex + 1) : afterUpload.slice(1);
  const publicPath = publicPathParts.join('/');

  if (!publicPath) return null;

  const withoutExtension =
    resourceType === 'raw' ? publicPath : publicPath.replace(/\.[a-z0-9]+$/i, '');

  return {
    publicId: decodeURIComponent(withoutExtension),
    resourceType,
  };
}

