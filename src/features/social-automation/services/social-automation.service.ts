import { Prisma, SocialAutomationStatus, SocialPostStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/server';
import { getServerEnv } from '@/lib/env';
import { decryptSensitiveValue } from '@/features/shared/services/security/fieldEncryption';
import { toPlainNumber } from '@/app/api/products/shared';
import { calculateNextRun } from '../lib/calculate-next-run';
import { generateSocialCaption } from './caption.service';
import type { SocialCaptionProduct } from './ai/types';
import {
  describeFacebookError,
  getFacebookConfig,
  validateFacebookPageToken,
} from './facebook.service';
import {
  publishOneTimePost,
  SocialAutomationPublishError,
  type FacebookAccountRecord,
} from './publishing.service';

const intervalDaysSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
const durationModeSchema = z.enum(['forever', 'number_of_posts', 'until_date']);

export const settingsSchema = z.object({
  language: z.string().trim().min(1).max(80).default('Bangla + English'),
  tone: z.string().trim().min(1).max(80).default('Friendly'),
  captionLength: z.string().trim().min(1).max(40).default('Medium'),
  hashtags: z.string().trim().min(1).max(40).default('Automatic'),
  ctaEnabled: z.boolean().default(true),
  aiCaptionEnabled: z.boolean().default(true),
  defaultIntervalDays: intervalDaysSchema.default(3),
  defaultPostingTime: z.string().regex(/^\d{2}:\d{2}$/).default('20:00'),
  defaultDurationMode: durationModeSchema.default('forever'),
  defaultMaxPosts: z.number().int().min(1).max(365).nullable().optional(),
  defaultEndAt: z.string().datetime().nullable().optional(),
  generateNewCaptionEveryTime: z.boolean().default(true),
  useLatestProductData: z.boolean().default(true),
  skipOutOfStock: z.boolean().default(true),
});

export const createPostSchema = z.object({
  productId: z.string().min(1),
  postingType: z.enum(['one_time', 'recurring']),
  scheduleMode: z.enum(['now', 'scheduled']),
  scheduledAt: z.string().datetime().nullable().optional(),
  intervalDays: intervalDaysSchema.optional(),
  durationMode: durationModeSchema.default('forever'),
  maxPosts: z.number().int().min(1).max(365).nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  caption: z.string().trim().max(2200).nullable().optional(),
  generateCaption: z.boolean().default(false),
  generateNewCaption: z.boolean().default(true),
  useLatestProductData: z.boolean().default(true),
  skipOutOfStock: z.boolean().default(true),
  idempotencyKey: z.string().trim().min(8).max(160).optional(),
});

export const updateAutomationSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']).optional(),
  intervalDays: intervalDaysSchema.optional(),
  nextRunAt: z.string().datetime().optional(),
  endAt: z.string().datetime().nullable().optional(),
  maxPosts: z.number().int().min(1).max(365).nullable().optional(),
  generateNewCaption: z.boolean().optional(),
  useLatestProductData: z.boolean().optional(),
  skipOutOfStock: z.boolean().optional(),
});

type SocialProduct = Prisma.ProductGetPayload<{
  include: {
    socialPostAutomations: {
      where: { status: 'ACTIVE' };
      orderBy: { nextRunAt: 'asc' };
      take: 1;
    };
  };
}>;

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function serializeAccount(account: {
  id: string;
  platform: 'facebook';
  accountId: string | null;
  accountName: string | null;
  status: string;
  tokenExpiresAt: Date | null;
  updatedAt: Date;
} | null) {
  return {
    id: account?.id ?? null,
    platform: 'facebook',
    account_id: account?.accountId ?? null,
    account_name: account?.accountName ?? null,
    status: account?.status ?? 'DISCONNECTED',
    connected: account?.status === 'CONNECTED',
    token_expires_at: isoDate(account?.tokenExpiresAt),
    updated_at: isoDate(account?.updatedAt),
  };
}

function serializeSettings(settings: Awaited<ReturnType<typeof getOrCreateSettings>>) {
  return {
    id: settings.id,
    language: settings.language,
    tone: settings.tone,
    caption_length: settings.captionLength,
    hashtags: settings.hashtags,
    cta_enabled: settings.ctaEnabled,
    ai_caption_enabled: settings.aiCaptionEnabled,
    default_interval_days: settings.defaultIntervalDays,
    default_posting_time: settings.defaultPostingTime,
    default_duration_mode: settings.defaultDurationMode,
    default_max_posts: settings.defaultMaxPosts,
    default_end_at: isoDate(settings.defaultEndAt),
    generate_new_caption_every_time: settings.generateNewCaptionEveryTime,
    use_latest_product_data: settings.useLatestProductData,
    skip_out_of_stock: settings.skipOutOfStock,
  };
}

function serializeAutomation(automation: {
  id: string;
  productId: string;
  intervalDays: number;
  startAt: Date;
  nextRunAt: Date;
  endAt: Date | null;
  maxPosts: number | null;
  postsCreated: number;
  status: string;
  generateNewCaption: boolean;
  useLatestProductData: boolean;
  skipOutOfStock: boolean;
  product?: { name: string; image: string | null } | null;
}) {
  return {
    id: automation.id,
    product_id: automation.productId,
    product_name: automation.product?.name ?? null,
    product_image: automation.product?.image ?? null,
    interval_days: automation.intervalDays,
    schedule_label: `Every ${automation.intervalDays} day${automation.intervalDays === 1 ? '' : 's'}`,
    start_at: automation.startAt.toISOString(),
    next_run_at: automation.nextRunAt.toISOString(),
    end_at: isoDate(automation.endAt),
    max_posts: automation.maxPosts,
    posts_created: automation.postsCreated,
    status: automation.status,
    generate_new_caption: automation.generateNewCaption,
    use_latest_product_data: automation.useLatestProductData,
    skip_out_of_stock: automation.skipOutOfStock,
  };
}

function serializePost(post: {
  id: string;
  productId: string;
  status: string;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  externalPostId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  product?: { name: string } | null;
}) {
  return {
    id: post.id,
    product_id: post.productId,
    product_name: post.product?.name ?? null,
    status: post.status,
    scheduled_at: isoDate(post.scheduledAt),
    published_at: isoDate(post.publishedAt),
    external_post_id: post.externalPostId,
    error_message: post.errorMessage,
    created_at: post.createdAt.toISOString(),
  };
}

function serializeSocialProduct(product: SocialProduct) {
  const automation = product.socialPostAutomations[0] ?? null;

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    slug: product.slug,
    description: product.description ?? '',
    price: toPlainNumber(product.price),
    old_price: toPlainNumber(product.oldPrice ?? product.price),
    image: product.image,
    gallery_images: Array.isArray(product.galleryImages) ? product.galleryImages : [],
    category: product.category,
    stock: product.stock,
    product_status: product.productStatus,
    automation: automation ? serializeAutomation(automation) : null,
  };
}

export async function getOrCreateSettings(sellerId: string) {
  return prisma.socialAutomationSetting.upsert({
    where: { sellerId },
    update: {},
    create: { sellerId },
  });
}

export async function updateSettings(sellerId: string, rawInput: unknown) {
  const input = settingsSchema.parse(rawInput);

  return prisma.socialAutomationSetting.upsert({
    where: { sellerId },
    update: {
      language: input.language,
      tone: input.tone,
      captionLength: input.captionLength,
      hashtags: input.hashtags,
      ctaEnabled: input.ctaEnabled,
      aiCaptionEnabled: input.aiCaptionEnabled,
      defaultIntervalDays: input.defaultIntervalDays,
      defaultPostingTime: input.defaultPostingTime,
      defaultDurationMode: input.defaultDurationMode,
      defaultMaxPosts: input.defaultDurationMode === 'number_of_posts' ? input.defaultMaxPosts ?? 1 : null,
      defaultEndAt: input.defaultDurationMode === 'until_date' && input.defaultEndAt ? new Date(input.defaultEndAt) : null,
      generateNewCaptionEveryTime: input.generateNewCaptionEveryTime,
      useLatestProductData: input.useLatestProductData,
      skipOutOfStock: input.skipOutOfStock,
    },
    create: {
      sellerId,
      language: input.language,
      tone: input.tone,
      captionLength: input.captionLength,
      hashtags: input.hashtags,
      ctaEnabled: input.ctaEnabled,
      aiCaptionEnabled: input.aiCaptionEnabled,
      defaultIntervalDays: input.defaultIntervalDays,
      defaultPostingTime: input.defaultPostingTime,
      defaultDurationMode: input.defaultDurationMode,
      defaultMaxPosts: input.defaultDurationMode === 'number_of_posts' ? input.defaultMaxPosts ?? 1 : null,
      defaultEndAt: input.defaultDurationMode === 'until_date' && input.defaultEndAt ? new Date(input.defaultEndAt) : null,
      generateNewCaptionEveryTime: input.generateNewCaptionEveryTime,
      useLatestProductData: input.useLatestProductData,
      skipOutOfStock: input.skipOutOfStock,
    },
  });
}

export async function getDashboardPayload(sellerId: string) {
  const [settings, account, counts, automations, posts] = await Promise.all([
    getOrCreateSettings(sellerId),
    prisma.socialAccount.findFirst({
      where: { sellerId, platform: 'facebook' },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.socialPost.groupBy({
      by: ['status'],
      where: { sellerId },
      _count: { _all: true },
    }),
    prisma.socialPostAutomation.findMany({
      where: { sellerId, status: { in: [SocialAutomationStatus.ACTIVE, SocialAutomationStatus.PAUSED] } },
      include: { product: { select: { name: true, image: true } } },
      orderBy: [{ status: 'asc' }, { nextRunAt: 'asc' }],
      take: 10,
    }),
    prisma.socialPost.findMany({
      where: { sellerId },
      include: { product: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  const countMap = counts.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = item._count._all;
    return acc;
  }, {});

  const activeAutomations = automations.filter((automation) => automation.status === SocialAutomationStatus.ACTIVE).length;

  return {
    account: serializeAccount(account),
    settings: serializeSettings(settings),
    summary: {
      published: countMap.PUBLISHED ?? 0,
      scheduled: countMap.SCHEDULED ?? 0,
      active_automations: activeAutomations,
      failed: countMap.FAILED ?? 0,
    },
    active_automations: automations.map(serializeAutomation),
    recent_activity: posts.map(serializePost),
    facebook_publishing_configured: Boolean(getFacebookConfig()),
    ai_caption_configured: Boolean(process.env.GEMINI_API_KEY),
  };
}

export async function getProductsPayload(sellerId: string) {
  const products = await prisma.product.findMany({
    where: { sellerId },
    include: {
      socialPostAutomations: {
        where: { status: SocialAutomationStatus.ACTIVE },
        orderBy: { nextRunAt: 'asc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return products.map(serializeSocialProduct);
}

export async function createPostOrAutomation(sellerId: string, rawInput: unknown) {
  const input = createPostSchema.parse(rawInput);
  const [product, settings, account] = await Promise.all([
    prisma.product.findFirst({
      where: { id: input.productId, sellerId },
      include: { seller: { select: { storeName: true } } },
    }),
    getOrCreateSettings(sellerId),
    prisma.socialAccount.findFirst({ where: { sellerId, platform: 'facebook', status: 'CONNECTED' } }),
  ]);

  if (!product) {
    throw new Error('Product not found.');
  }

  if (!account) {
    throw new Error('Facebook Page is not connected.');
  }

  const captionProduct: SocialCaptionProduct = {
    name: product.name,
    description: product.description,
    price: Number(product.price),
    oldPrice: product.oldPrice == null ? null : Number(product.oldPrice),
    stock: product.stock,
    category: product.category,
    available: product.stock > 0 && product.productStatus === 'published',
    sellerStoreName: product.seller?.storeName ?? null,
  };

  const captionResult = input.generateCaption
    ? await generateSocialCaption(captionProduct, {
        language: settings.language,
        tone: settings.tone,
        captionLength: settings.captionLength,
        hashtags: settings.hashtags,
        ctaEnabled: settings.ctaEnabled,
        aiCaptionEnabled: settings.aiCaptionEnabled,
      })
    : null;

  if (captionResult && !captionResult.ok) {
    throw new Error(captionResult.message);
  }

  const caption = captionResult?.caption ?? input.caption ?? null;
  const scheduledAt =
    input.scheduleMode === 'now'
      ? null
      : input.scheduledAt
        ? new Date(input.scheduledAt)
        : null;

  if (input.scheduleMode === 'scheduled' && !scheduledAt) {
    throw new Error('Scheduled posts require a date and time.');
  }

  if (input.postingType === 'recurring') {
    const intervalDays = input.intervalDays ?? settings.defaultIntervalDays;
    const startAt = scheduledAt ?? new Date();
    // The selected schedule time is the first run. Subsequent runs advance by intervalDays.
    const nextRunAt = startAt;
    const automation = await prisma.socialPostAutomation.create({
      data: {
        sellerId,
        productId: product.id,
        intervalDays,
        startAt,
        nextRunAt,
        endAt: input.durationMode === 'until_date' && input.endAt ? new Date(input.endAt) : null,
        maxPosts: input.durationMode === 'number_of_posts' ? input.maxPosts ?? 1 : null,
        caption,
        generateNewCaption: input.generateNewCaption,
        useLatestProductData: input.useLatestProductData,
        skipOutOfStock: input.skipOutOfStock,
      },
      include: { product: { select: { name: true, image: true } } },
    });

    return { kind: 'automation' as const, automation: serializeAutomation(automation) };
  }

  if (input.scheduleMode === 'now') {
    const productUrl = `${getServerEnv().FRONTEND_URL}/product/${product.slug}`;
    const publishResult = await publishOneTimePost({
      sellerId,
      product: {
        id: product.id,
        slug: product.slug,
        name: product.name,
        image: product.image,
        stock: product.stock,
      },
      account: account as FacebookAccountRecord,
      caption: caption || `Check out ${product.name}!`,
      idempotencyKey: input.idempotencyKey ?? `sap-${randomUUID()}`,
      skipOutOfStock: input.skipOutOfStock,
      productUrl,
    });

    if (publishResult.status === SocialPostStatus.FAILED) {
      throw new SocialAutomationPublishError(
        publishResult.errorMessage || 'Facebook publishing failed. Please try again.',
      );
    }

    const post = await prisma.socialPost.findUnique({
      where: { id: publishResult.postId },
      include: { product: { select: { name: true } } },
    });

    if (!post) {
      return {
        kind: 'post' as const,
        post: {
          id: publishResult.postId,
          product_id: product.id,
          product_name: product.name,
          status: publishResult.status,
          scheduled_at: null,
          published_at: publishResult.publishedAt ? publishResult.publishedAt.toISOString() : null,
          external_post_id: publishResult.externalPostId,
          error_message: publishResult.errorMessage,
          created_at: new Date().toISOString(),
        },
        duplicate: publishResult.duplicate,
      };
    }

    return { kind: 'post' as const, post: serializePost(post), duplicate: publishResult.duplicate };
  }

  const post = await prisma.socialPost.create({
    data: {
      sellerId,
      productId: product.id,
      caption,
      mediaUrl: product.image,
      scheduledAt,
      status: SocialPostStatus.SCHEDULED,
      targets: {
        create: {
          socialAccountId: account.id,
          status: SocialPostStatus.SCHEDULED,
        },
      },
    },
    include: { product: { select: { name: true } } },
  });

  return { kind: 'post' as const, post: serializePost(post) };
}

export async function listAutomations(sellerId: string) {
  const automations = await prisma.socialPostAutomation.findMany({
    where: { sellerId },
    include: { product: { select: { name: true, image: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return automations.map(serializeAutomation);
}

export async function updateAutomation(sellerId: string, automationId: string, rawInput: unknown) {
  const input = updateAutomationSchema.parse(rawInput);
  const existing = await prisma.socialPostAutomation.findFirst({
    where: { id: automationId, sellerId },
  });

  if (!existing) {
    throw new Error('Automation not found.');
  }

  const next = await prisma.socialPostAutomation.update({
    where: { id: automationId },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.intervalDays ? { intervalDays: input.intervalDays } : {}),
      ...(input.nextRunAt ? { nextRunAt: new Date(input.nextRunAt) } : {}),
      ...(input.endAt !== undefined ? { endAt: input.endAt ? new Date(input.endAt) : null } : {}),
      ...(input.maxPosts !== undefined ? { maxPosts: input.maxPosts } : {}),
      ...(input.generateNewCaption !== undefined ? { generateNewCaption: input.generateNewCaption } : {}),
      ...(input.useLatestProductData !== undefined ? { useLatestProductData: input.useLatestProductData } : {}),
      ...(input.skipOutOfStock !== undefined ? { skipOutOfStock: input.skipOutOfStock } : {}),
    },
    include: { product: { select: { name: true, image: true } } },
  });

  return serializeAutomation(next);
}

export async function deleteAutomation(sellerId: string, automationId: string) {
  const result = await prisma.socialPostAutomation.deleteMany({
    where: { id: automationId, sellerId },
  });

  if (result.count === 0) {
    throw new Error('Automation not found.');
  }
}

/**
 * Server-side validation of a seller's stored Facebook credentials.
 * Ownership is enforced by loading the account through the authenticated seller.
 * The stored token is decrypted and verified against the Graph API.
 */
export async function validateSocialAccountConnection(sellerId: string, accountId: string) {
  const account = await prisma.socialAccount.findFirst({
    where: { id: accountId, sellerId, platform: 'facebook' },
  });

  if (!account) {
    throw new Error('Facebook Page not found.');
  }

  const config = getFacebookConfig();
  if (!config) {
    throw new Error('Facebook publishing is not configured.');
  }

  if (!account.encryptedAccessToken || !account.accountId) {
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { status: 'EXPIRED', updatedAt: new Date() },
    });
    return {
      id: account.id,
      account_id: account.accountId,
      account_name: account.accountName,
      status: 'EXPIRED',
      connected: false,
      valid: false,
      error_message: 'Facebook connection credentials are unavailable. Reconnect Facebook.',
    };
  }

  const pageAccessToken = decryptSensitiveValue(account.encryptedAccessToken);
  if (!pageAccessToken) {
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { status: 'EXPIRED', updatedAt: new Date() },
    });
    return {
      id: account.id,
      account_id: account.accountId,
      account_name: account.accountName,
      status: 'EXPIRED',
      connected: false,
      valid: false,
      error_message: 'Facebook connection credentials are unavailable. Reconnect Facebook.',
    };
  }

  try {
    const page = await validateFacebookPageToken(config, account.accountId, pageAccessToken);
    const now = new Date();
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        status: 'CONNECTED',
        accountName: page.name ?? account.accountName,
        updatedAt: now,
      },
    });
    return {
      id: account.id,
      account_id: account.accountId,
      account_name: page.name ?? account.accountName,
      status: 'CONNECTED',
      connected: true,
      valid: true,
      error_message: null,
    };
  } catch (error) {
    const { kind, message } = describeFacebookError(error);
    const status = kind === 'token' ? 'EXPIRED' : 'ERROR';
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { status, tokenExpiresAt: null, updatedAt: new Date() },
    });
    return {
      id: account.id,
      account_id: account.accountId,
      account_name: account.accountName,
      status,
      connected: false,
      valid: false,
      error_message: message,
    };
  }
}
