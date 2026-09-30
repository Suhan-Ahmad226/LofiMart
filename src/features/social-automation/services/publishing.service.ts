import { Prisma, SocialAccountStatus, SocialPostStatus } from '@prisma/client';
import { prisma } from '@/lib/server';
import { decryptSensitiveValue } from '@/features/shared/services/security/fieldEncryption';
import {
  describeFacebookError,
  getFacebookConfig,
  getPublicProductImageUrl,
  publishFacebookPagePost,
  validateFacebookPageToken,
} from './facebook.service';

export type FacebookAccountRecord = {
  id: string;
  accountId: string | null;
  accountName: string | null;
  encryptedAccessToken: string | null;
  status: string;
};

type PostWithTargets = Prisma.SocialPostGetPayload<{ include: { targets: true } }>;

export type OneTimePublishResult = {
  postId: string;
  duplicate: boolean;
  status: SocialPostStatus | string;
  externalPostId: string | null;
  publishedAt: Date | null;
  errorMessage: string | null;
};

export class SocialAutomationPublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SocialAutomationPublishError';
  }
}

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    typeof error.meta?.target === 'string' &&
    error.meta.target.includes('idempotencyKey')
  );
}

function toResult(
  post: { id: string; status: string; externalPostId: string | null; publishedAt: Date | null; errorMessage: string | null },
  duplicate: boolean,
): OneTimePublishResult {
  return {
    postId: post.id,
    duplicate,
    status: post.status,
    externalPostId: post.externalPostId,
    publishedAt: post.publishedAt,
    errorMessage: post.errorMessage,
  };
}

/**
 * Publishes a single Facebook post.
 *
 * When `existingPostId` is provided the publish runs against that existing
 * scheduled post record (SCHEDULED -> PUBLISHING -> PUBLISHED/FAILED), which is
 * what the scheduled-post executor and recurring runner use. Without it a new
 * one-time post row is created.
 *
 * Guarantees:
 * - stock gate: never publishes when the configured behavior is to skip out-of-stock products
 * - currency/latest product data: the caller passes DB-fresh product, never stale client data
 * - idempotent: a repeated request with the same idempotencyKey returns the existing record
 * - status transitions: PUBLISHING -> PUBLISHED only after Facebook confirms, otherwise FAILED
 * - never fabricates externalPostId or publishedAt; both come from the successful Graph API call
 */
export async function publishOneTimePost(opts: {
  sellerId: string;
  product: { id: string; slug: string; name: string; image: string | null; stock: number };
  account: FacebookAccountRecord;
  caption: string;
  idempotencyKey: string;
  skipOutOfStock: boolean;
  productUrl: string;
  existingPostId?: string | null;
}): Promise<OneTimePublishResult> {
  const { sellerId, product, account, idempotencyKey, skipOutOfStock } = opts;

  if (skipOutOfStock && product.stock <= 0) {
    throw new SocialAutomationPublishError(
      'Product is out of stock so the post will not be published.',
    );
  }

  const existing = await prisma.socialPost.findUnique({ where: { idempotencyKey } });
  if (existing && existing.sellerId === sellerId) {
    return toResult(existing, true);
  }

  let post: PostWithTargets;

  if (opts.existingPostId) {
    const scheduled = await prisma.socialPost.findFirst({
      where: { id: opts.existingPostId, sellerId },
      include: { targets: true },
    });
    if (!scheduled) {
      throw new SocialAutomationPublishError('The scheduled post no longer exists.');
    }
    if (
      scheduled.status === SocialPostStatus.PUBLISHED ||
      scheduled.status === SocialPostStatus.CANCELLED
    ) {
      return toResult(scheduled, true);
    }
    // Guarded transition: only one executor may move this post out of SCHEDULED,
    // so concurrent sweeps never both publish the same scheduled post.
    const claimed = await prisma.socialPost.updateMany({
      where: { id: scheduled.id, status: SocialPostStatus.SCHEDULED },
      data: { status: SocialPostStatus.PUBLISHING, idempotencyKey },
    });
    if (claimed.count === 0) {
      const winner = await prisma.socialPost.findFirst({
        where: { id: scheduled.id, sellerId },
      });
      if (winner && winner.status === SocialPostStatus.PUBLISHED) {
        return toResult(winner, true);
      }
      throw new SocialAutomationPublishError('The scheduled post is already being processed.');
    }
    if (scheduled.targets[0]) {
      await prisma.socialPostTarget.update({
        where: { id: scheduled.targets[0].id },
        data: { status: SocialPostStatus.PUBLISHING },
      });
    }
    post = { ...scheduled, status: SocialPostStatus.PUBLISHING };
  } else {
    try {
      post = await prisma.socialPost.create({
        data: {
          sellerId,
          productId: product.id,
          caption: opts.caption,
          mediaUrl: product.image,
          status: SocialPostStatus.PUBLISHING,
          idempotencyKey,
          targets: {
            create: {
              socialAccountId: account.id,
              status: SocialPostStatus.PUBLISHING,
            },
          },
        },
        include: { targets: true },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await prisma.socialPost.findUnique({ where: { idempotencyKey } });
        if (raced && raced.sellerId === sellerId) {
          return toResult(raced, true);
        }
        throw new SocialAutomationPublishError('The post request has already been processed.');
      }
      throw error;
    }
  }

  const target = post.targets[0];

  if (!target) {
    const message = 'Facebook publishing failed. Please try again.';
    await prisma.socialPost.update({
      where: { id: post.id },
      data: { status: SocialPostStatus.FAILED, errorMessage: message },
    });
    throw new SocialAutomationPublishError(message);
  }

  const failPost = async (message: string, accountStatus?: SocialAccountStatus) => {
    await prisma.socialPost.update({
      where: { id: post.id },
      data: { status: SocialPostStatus.FAILED, errorMessage: message },
    });
    if (target) {
      await prisma.socialPostTarget.update({
        where: { id: target.id },
        data: { status: SocialPostStatus.FAILED, errorMessage: message },
      });
    }
    if (accountStatus) {
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: { status: accountStatus, updatedAt: new Date() },
      });
    }
    return message;
  };

  const config = getFacebookConfig();
  if (!config) {
    const message = 'Facebook publishing is not configured.';
    await failPost(message);
    throw new SocialAutomationPublishError(message);
  }

  if (!account.accountId) {
    const message = 'Facebook Page is not connected.';
    await failPost(message);
    throw new SocialAutomationPublishError(message);
  }

  const pageAccessToken = decryptSensitiveValue(account.encryptedAccessToken);
  if (!pageAccessToken) {
    const message = 'Facebook connection credentials are unavailable. Reconnect Facebook.';
    await failPost(message, SocialAccountStatus.EXPIRED);
    throw new SocialAutomationPublishError(message);
  }

  try {
    await validateFacebookPageToken(config, account.accountId, pageAccessToken);
  } catch (error) {
    const { kind, message } = describeFacebookError(error);
    const accountStatus =
      kind === 'token' ? SocialAccountStatus.EXPIRED : SocialAccountStatus.ERROR;
    await failPost(message, accountStatus);
    throw new SocialAutomationPublishError(message);
  }

  let externalPostId: string;

  try {
    const result = await publishFacebookPagePost(config, account.accountId, pageAccessToken, {
      caption: opts.caption,
      imageUrl: getPublicProductImageUrl(product.image),
      productUrl: opts.productUrl,
    });
    externalPostId = result.externalPostId;
  } catch (error) {
    const { kind, message } = describeFacebookError(error);
    const accountStatus =
      kind === 'token' ? SocialAccountStatus.EXPIRED : SocialAccountStatus.ERROR;
    await failPost(message, accountStatus);
    throw new SocialAutomationPublishError(message);
  }

  const publishedAt = new Date();

  await prisma.$transaction([
    prisma.socialPost.update({
      where: { id: post.id },
      data: {
        status: SocialPostStatus.PUBLISHED,
        externalPostId,
        publishedAt,
      },
    }),
    prisma.socialPostTarget.update({
      where: { id: target.id },
      data: {
        status: SocialPostStatus.PUBLISHED,
        externalPostId,
        publishedAt,
      },
    }),
    prisma.socialAccount.update({
      where: { id: account.id },
      data: { status: SocialAccountStatus.CONNECTED, updatedAt: publishedAt },
    }),
  ]);

  return toResult(
    { ...post, status: SocialPostStatus.PUBLISHED, externalPostId, publishedAt, errorMessage: null },
    false,
  );
}