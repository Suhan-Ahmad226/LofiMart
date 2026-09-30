import { prisma } from '@/lib/server';
import { logger } from '@/lib/logger';
import { deleteManyMedia } from './delete';
import { parseCloudinaryAssetUrl } from './cloudinary';
import type { MediaDeleteJob } from './queue';

type MediaRef = {
  url?: string | null;
  publicId?: string | null;
  resourceType?: string | null;
};

function refsFromUrls(urls: Array<string | null | undefined>): MediaRef[] {
  const refs: Array<MediaRef | null> = urls.map((url) => {
    const parsed = parseCloudinaryAssetUrl(url);
    return parsed ? { url, publicId: parsed.publicId, resourceType: parsed.resourceType } : null;
  });

  return refs.filter((item): item is MediaRef => item !== null);
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

export async function collectProductMedia(productId: string): Promise<MediaRef[]> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { image: true, galleryImages: true, videoUrl: true, model3d: true },
  });

  if (!product) return [];

  const registry = await prisma.mediaAsset.findMany({
    where: { entityType: 'Product', entityId: productId, status: { not: 'deleted' } },
    select: { url: true, publicId: true, resourceType: true },
  });

  return [
    ...refsFromUrls([product.image, product.videoUrl, product.model3d, ...jsonStringArray(product.galleryImages)]),
    ...registry,
  ];
}

export async function associateProductMedia(productId: string, ownerId: string, urls: string[]) {
  for (const url of urls) {
    const parsed = parseCloudinaryAssetUrl(url);
    if (!parsed) continue;

    await prisma.mediaAsset.upsert({
      where: {
        publicId_resourceType: {
          publicId: parsed.publicId,
          resourceType: parsed.resourceType,
        },
      },
      create: {
        url,
        publicId: parsed.publicId,
        resourceType: parsed.resourceType,
        ownerType: 'User',
        ownerId,
        entityType: 'Product',
        entityId: productId,
        fieldName: 'media',
        status: 'active',
      },
      update: {
        url,
        ownerType: 'User',
        ownerId,
        entityType: 'Product',
        entityId: productId,
        fieldName: 'media',
        status: 'active',
        deletedAt: null,
      },
    });
  }
}

export async function associateEntityMedia(input: {
  ownerId: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  urls: Array<string | null | undefined>;
}) {
  for (const url of input.urls) {
    const parsed = parseCloudinaryAssetUrl(url);
    if (!parsed || !url) continue;

    await prisma.mediaAsset.upsert({
      where: { publicId_resourceType: { publicId: parsed.publicId, resourceType: parsed.resourceType } },
      create: {
        url,
        publicId: parsed.publicId,
        resourceType: parsed.resourceType,
        ownerType: 'User',
        ownerId: input.ownerId,
        entityType: input.entityType,
        entityId: input.entityId,
        fieldName: input.fieldName,
      },
      update: {
        url,
        ownerType: 'User',
        ownerId: input.ownerId,
        entityType: input.entityType,
        entityId: input.entityId,
        fieldName: input.fieldName,
        status: 'active',
        deletedAt: null,
      },
    });
  }
}

export async function collectEntityMedia(entityType: string, entityId: string, urls: Array<string | null | undefined>) {
  const registry = await prisma.mediaAsset.findMany({
    where: { entityType, entityId, status: { not: 'deleted' } },
    select: { url: true, publicId: true, resourceType: true },
  });
  return [...refsFromUrls(urls), ...registry];
}

export async function cleanupProductMedia(productId: string) {
  const refs = await collectProductMedia(productId);
  const result = await deleteManyMedia(refs);
  logger.info('PRODUCT_MEDIA_CLEANUP_COMPLETED', {
    productId,
    attempted: refs.length,
    failed: result.errors.length,
  });
  if (result.errors.length > 0) {
    throw new Error(`Failed to delete ${result.errors.length} product media assets`);
  }
  return result;
}

const ORPHAN_UPLOAD_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

/** Deletes only registry assets never attached to an entity after a grace period. */
export async function cleanupUnassociatedMediaUploads(now = new Date()) {
  const cutoff = new Date(now.getTime() - ORPHAN_UPLOAD_GRACE_PERIOD_MS);
  const candidates = await prisma.mediaAsset.findMany({
    where: {
      status: 'active',
      entityType: null,
      entityId: null,
      createdAt: { lte: cutoff },
    },
    select: { url: true, publicId: true, resourceType: true },
  });
  const result = await deleteManyMedia(candidates);

  logger.info('ORPHAN_MEDIA_CLEANUP_COMPLETED', {
    candidates: candidates.length,
    failed: result.errors.length,
    gracePeriodHours: ORPHAN_UPLOAD_GRACE_PERIOD_MS / (60 * 60 * 1000),
  });

  if (result.errors.length > 0) {
    throw new Error(`Failed to delete ${result.errors.length} unassociated media assets`);
  }

  return result;
}

export async function collectUserMedia(userId: string): Promise<MediaRef[]> {
  const [user, products, communityPosts, verificationDocuments, registry] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true, storefrontBannerUrl: true },
    }),
    prisma.product.findMany({
      where: { sellerId: userId },
      select: { image: true, galleryImages: true, videoUrl: true, model3d: true },
    }),
    prisma.communityPost.findMany({
      where: { userId },
      select: { imageUrl: true },
    }),
    prisma.verificationDocument.findMany({
      where: { verification: { userId } },
      select: { url: true, publicId: true, mimeType: true },
    }),
    prisma.mediaAsset.findMany({
      where: { ownerType: 'User', ownerId: userId, status: { not: 'deleted' } },
      select: { url: true, publicId: true, resourceType: true },
    }),
  ]);

  return [
    ...refsFromUrls([user?.avatarUrl, user?.storefrontBannerUrl]),
    ...products.flatMap((product) =>
      refsFromUrls([product.image, product.videoUrl, product.model3d, ...jsonStringArray(product.galleryImages)]),
    ),
    ...refsFromUrls(communityPosts.map((post) => post.imageUrl)),
    ...verificationDocuments.map((document) => ({
      url: document.url,
      publicId: document.publicId,
      resourceType: document.mimeType === 'application/pdf' ? 'raw' : 'image',
    })),
    ...registry,
  ];
}

export async function cleanupUserMedia(userId: string) {
  logger.info('USER_MEDIA_CLEANUP_STARTED', { userId });
  const refs = await collectUserMedia(userId);
  const result = await deleteManyMedia(refs);
  logger.info('USER_MEDIA_CLEANUP_COMPLETED', {
    userId,
    attempted: refs.length,
    failed: result.errors.length,
  });
  if (result.errors.length > 0) {
    throw new Error(`Failed to delete ${result.errors.length} user media assets`);
  }
  return result;
}

export async function handleMediaDeleteJob(data: MediaDeleteJob) {
  const result = await deleteManyMedia([data]);
  if (result.errors.length > 0) {
    throw new Error(result.errors[0]?.error || 'Media delete failed');
  }
  return result.results[0] ?? null;
}

export async function cleanupUserByIdentifiers(input: {
  userId?: string | null;
  supabaseAuthId?: string | null;
  email?: string | null;
}) {
  const { cleanupApplicationUser } = await import('./user-cleanup');
  return cleanupApplicationUser({
    ...input,
    reason: 'queued-user-cleanup',
    deleteSupabaseUser: false,
  });
}
