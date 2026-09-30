import { Prisma, SocialAccountStatus, SocialAutomationRunStatus, SocialAutomationStatus, SocialPostStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/server';
import { getServerEnv } from '@/lib/env';
import { describeFacebookError, getFacebookConfig } from './facebook.service';
import { publishOneTimePost, type FacebookAccountRecord } from './publishing.service';
import { generateSocialCaption } from './caption.service';
import type { SocialCaptionProduct } from './ai/types';
import { getOrCreateSettings } from './social-automation.service';
import { getNextScheduleRun } from '../lib/calculate-next-run';

export const SOCIAL_AUTOMATION_LEASE_SECONDS_DEFAULT = 5 * 60;
export const SOCIAL_AUTOMATION_MAX_ATTEMPTS = 3;

type AutomationWithProduct = Prisma.SocialPostAutomationGetPayload<{
  include: { product: { include: { seller: { select: { storeName: true } } } } };
}>;

function leaseSeconds() {
  const raw = Number(process.env.SOCIAL_AUTOMATION_LEASE_SECONDS);
  return Number.isFinite(raw) && raw >= 10 ? raw : SOCIAL_AUTOMATION_LEASE_SECONDS_DEFAULT;
}

function claimLeaseMs() {
  return leaseSeconds() * 1000;
}

function isUniqueViolationForRun(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    typeof error.meta?.target === 'string' &&
    (error.meta.target.includes('SocialAutomationRun') || error.meta.target.includes('automationId'))
  );
}

export type AutomationRunOutcome =
  | { status: 'published' }
  | { status: 'skipped_out_of_stock' }
  | { status: 'failed'; retryable: boolean; message: string }
  | { status: 'skipped_not_claimed' };

/**
 * Atomically claims a due automation using a lease so exactly one worker/request
 * executes a given cycle. A claim is released on completion/failure; expired
 * leases (crashed workers) are reclaimed by the next sweep.
 */
async function claimAutomation(automationId: string, now: Date): Promise<boolean> {
  const nonce = randomUUID();
  const claimExpiresAt = new Date(now.getTime() + claimLeaseMs());
  const result = await prisma.socialPostAutomation.updateMany({
    where: {
      id: automationId,
      status: SocialAutomationStatus.ACTIVE,
      nextRunAt: { lte: now },
      OR: [{ claimedAt: null }, { claimExpiresAt: { lt: now } }],
    },
    data: { claimedAt: now, claimExpiresAt, claimNonce: nonce },
  });
  return result.count === 1;
}

async function releaseClaim(automationId: string) {
  await prisma.socialPostAutomation.updateMany({
    where: { id: automationId },
    data: { claimedAt: null, claimExpiresAt: null, claimNonce: null },
  });
}

async function pauseAutomation(automationId: string, reason: string, sellerId: string) {
  await prisma.socialPostAutomation.update({
    where: { id: automationId },
    data: { status: SocialAutomationStatus.PAUSED, pauseReason: reason },
  });
  const { enqueueNotification } = await import('@/workers/queue');
  await enqueueNotification({
    userId: sellerId,
    channel: 'in_app',
    message: `Social automation paused: ${reason}`,
  }).catch(() => undefined);
}

async function completeAutomation(automationId: string, lastStatus: string) {
  await prisma.socialPostAutomation.update({
    where: { id: automationId },
    data: { status: SocialAutomationStatus.COMPLETED, lastStatus },
  });
}

/**
 * Executes one recurring automation cycle that was already claimed.
 *
 * The cycle is protected by:
 * - an atomic lease claim (only one worker may run the current cycle)
 * - a SocialAutomationRun row with a unique (automationId, cycleNumber) and a
 *   deterministic idempotencyKey, so a crashed/retried job never double-posts
 */
async function runAutomationCycle(automation: AutomationWithProduct, now: Date): Promise<AutomationRunOutcome> {
  const { sellerId } = automation;

  const [product, settings, account] = await Promise.all([
    automation.useLatestProductData
      ? prisma.product.findFirst({
          where: { id: automation.productId, sellerId },
          include: { seller: { select: { storeName: true } } },
        })
      : Promise.resolve(automation.product),
    getOrCreateSettings(sellerId),
    prisma.socialAccount.findFirst({ where: { sellerId, platform: 'facebook', status: 'CONNECTED' } }),
  ]);

  if (!product) {
    await releaseClaim(automation.id);
    return { status: 'failed', retryable: true, message: 'Product no longer exists.' };
  }

  if (automation.skipOutOfStock && product.stock <= 0) {
    const nextRunAt = getNextScheduleRun({
      lastRunAt: now,
      intervalDays: automation.intervalDays,
      endAt: automation.endAt,
      maxPosts: automation.maxPosts,
      postsCreated: automation.postsCreated,
    }).nextRunAt;
    await prisma.socialPostAutomation.update({
      where: { id: automation.id },
      data: {
        ...(nextRunAt ? { nextRunAt } : {}),
        lastRunAt: now,
        lastStatus: 'SKIPPED_OUT_OF_STOCK',
        lastError: 'Product is out of stock. This cycle was skipped.',
      },
    });
    if (!nextRunAt) {
      await completeAutomation(automation.id, 'SKIPPED_OUT_OF_STOCK');
    }
    return { status: 'skipped_out_of_stock' };
  }

  if (!account) {
    await pauseAutomation(automation.id, 'Facebook Page is not connected or its token expired.', sellerId);
    await releaseClaim(automation.id);
    return { status: 'failed', retryable: false, message: 'Facebook Page is not connected.' };
  }

  const cycleNumber = automation.postsCreated + 1;
  const idempotencyKey = `cycle-${automation.id}-${cycleNumber}`;

  let runId: string;
  const existingRun = await prisma.socialAutomationRun.findFirst({
    where: { automationId: automation.id, cycleNumber },
    select: { id: true, status: true },
  });

  if (existingRun) {
    if (existingRun.status === SocialAutomationRunStatus.PUBLISHED) {
      await releaseClaim(automation.id);
      return { status: 'published' };
    }
    const refreshed = await prisma.socialAutomationRun.updateMany({
      where: { id: existingRun.id, status: { in: [SocialAutomationRunStatus.FAILED, SocialAutomationRunStatus.CANCELLED] } },
      data: { status: SocialAutomationRunStatus.CLAIMED, attempts: { increment: 1 } },
    });
    if (refreshed.count === 0) {
      return { status: 'skipped_not_claimed' };
    }
    runId = existingRun.id;
  } else {
    try {
      const run = await prisma.socialAutomationRun.create({
        data: {
          automationId: automation.id,
          sellerId,
          productId: automation.productId,
          idempotencyKey,
          status: SocialAutomationRunStatus.CLAIMED,
          startedAt: now,
          cycleNumber,
          attempts: 1,
        },
        select: { id: true },
      });
      runId = run.id;
    } catch (error) {
      if (isUniqueViolationForRun(error)) {
        // Another worker already created this cycle. Release our claim and skip.
        await releaseClaim(automation.id);
        return { status: 'skipped_not_claimed' };
      }
      throw error;
    }
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

  let caption = automation.caption ?? '';
  if (automation.generateNewCaption) {
    const result = await generateSocialCaption(captionProduct, {
      language: settings.language,
      tone: settings.tone,
      captionLength: settings.captionLength,
      hashtags: settings.hashtags,
      ctaEnabled: settings.ctaEnabled,
      aiCaptionEnabled: settings.aiCaptionEnabled,
    });
    if (result.ok) caption = result.caption;
  }

  if (!caption.trim()) {
    await prisma.socialAutomationRun.update({
      where: { id: runId },
      data: { status: SocialAutomationRunStatus.FAILED, errorCode: 'NO_CAPTION', errorMessage: 'No caption is available for this cycle.', completedAt: now },
    });
    const nextAttempt = automation.attempts + 1;
    await prisma.socialPostAutomation.update({
      where: { id: automation.id },
      data: { lastRunAt: now, lastStatus: 'FAILED', lastError: 'No caption is available for this cycle.', attempts: nextAttempt },
    });
    await releaseClaim(automation.id);
    if (nextAttempt >= SOCIAL_AUTOMATION_MAX_ATTEMPTS) {
      await pauseAutomation(automation.id, 'Publishing failed repeatedly. Check the automation and reconnect Facebook if needed.', sellerId);
    }
    return { status: 'failed', retryable: false, message: 'No caption is available for this cycle.' };
  }

  const config = getFacebookConfig();
  const productUrl = config ? `${getServerEnv().FRONTEND_URL}/product/${product.slug}` : '';

  try {
    const publishResult = await publishOneTimePost({
      sellerId,
      product: { id: product.id, slug: product.slug, name: product.name, image: product.image, stock: product.stock },
      account: account as FacebookAccountRecord,
      caption,
      idempotencyKey: `post-${runId}`,
      skipOutOfStock: automation.skipOutOfStock,
      productUrl,
    });

    if (publishResult.status === SocialPostStatus.FAILED) {
      await prisma.socialAutomationRun.update({
        where: { id: runId },
        data: { status: SocialAutomationRunStatus.FAILED, errorCode: 'PUBLISH_FAILED', errorMessage: publishResult.errorMessage, completedAt: now },
      });
      return { status: 'failed', retryable: true, message: publishResult.errorMessage ?? 'Facebook publishing failed.' };
    }

    const postsCreated = automation.postsCreated + 1;
    const runRecord = await prisma.socialAutomationRun.update({
      where: { id: runId },
      data: {
        status: SocialAutomationRunStatus.PUBLISHED,
        socialPostId: publishResult.postId,
        externalPostId: publishResult.externalPostId,
        completedAt: now,
      },
      select: { socialPostId: true },
    });

    await prisma.socialPost.updateMany({
      where: { id: runRecord.socialPostId ?? publishResult.postId, sellerId },
      data: { automationId: automation.id },
    });

    const nextRunAt = getNextScheduleRun({
      lastRunAt: now,
      intervalDays: automation.intervalDays,
      endAt: automation.endAt,
      maxPosts: automation.maxPosts,
      postsCreated,
    }).nextRunAt;

    await prisma.socialPostAutomation.update({
      where: { id: automation.id },
      data: {
        postsCreated,
        lastRunAt: now,
        lastStatus: 'PUBLISHED',
        lastError: null,
        attempts: 0,
        ...(nextRunAt ? { nextRunAt } : {}),
      },
    });

    await releaseClaim(automation.id);

    if (!nextRunAt) {
      await completeAutomation(automation.id, 'PUBLISHED');
    }

    return { status: 'published' };
  } catch (error) {
    const { kind, message } = describeFacebookError(error);
    const retryable = kind !== 'token';
    const accountStatus = kind === 'token' ? SocialAccountStatus.EXPIRED : SocialAccountStatus.ERROR;
    await prisma.socialAccount.updateMany({
      where: { id: account.id },
      data: { status: accountStatus, updatedAt: now },
    });

    await prisma.socialAutomationRun.update({
      where: { id: runId },
      data: { status: SocialAutomationRunStatus.FAILED, errorCode: kind === 'token' ? 'TOKEN_EXPIRED' : 'PUBLISH_FAILED', errorMessage: message, completedAt: now },
    });

    const nextAttempt = automation.attempts + 1;
    await prisma.socialPostAutomation.update({
      where: { id: automation.id },
      data: { lastRunAt: now, lastStatus: 'FAILED', lastError: message, attempts: nextAttempt },
    });

    if (kind === 'token') {
      await pauseAutomation(automation.id, 'Facebook access expired or was revoked. Reconnect Facebook to resume.', sellerId);
    } else if (nextAttempt >= SOCIAL_AUTOMATION_MAX_ATTEMPTS) {
      await pauseAutomation(automation.id, 'Publishing failed repeatedly. Reconnect Facebook to resume.', sellerId);
    }

    await releaseClaim(automation.id);
    return { status: 'failed', retryable, message };
  }
}

/**
 * Finds all ACTIVE due automations and executes their next cycle. Returns one
 * outcome per automation processed. Safe to call concurrently (RPC, n8n, or a
 * worker): the atomic lease + per-cycle unique run row prevent double-posting.
 */
export async function processDueAutomations(now = new Date()): Promise<AutomationRunOutcome[]> {
  const due = await prisma.socialPostAutomation.findMany({
    where: {
      status: SocialAutomationStatus.ACTIVE,
      nextRunAt: { lte: now },
      OR: [{ claimedAt: null }, { claimExpiresAt: { lt: now } }],
    },
    include: { product: { include: { seller: { select: { storeName: true } } } } },
    orderBy: { nextRunAt: 'asc' },
    take: 50,
  });

  const outcomes: AutomationRunOutcome[] = [];
  for (const automation of due) {
    const claimed = await claimAutomation(automation.id, now);
    if (!claimed) {
      outcomes.push({ status: 'skipped_not_claimed' });
      continue;
    }
    outcomes.push(await runAutomationCycle(automation, now));
  }
  return outcomes;
}

export type ScheduledPostOutcome =
  | { status: 'published' }
  | { status: 'skipped' }
  | { status: 'failed'; message: string };

/**
 * Executes one-time posts whose scheduledAt time has arrived.
 * Each post is guarded by a deterministic idempotencyKey so retried sweeps
 * cannot publish the same scheduled post twice.
 */
export async function processDueScheduledPosts(now = new Date()): Promise<ScheduledPostOutcome[]> {
  const due = await prisma.socialPost.findMany({
    where: { status: SocialPostStatus.SCHEDULED, scheduledAt: { lte: now }, automationId: null },
    orderBy: { scheduledAt: 'asc' },
    take: 50,
  });

  const outcomes: ScheduledPostOutcome[] = [];

  for (const post of due) {
    const [product, account] = await Promise.all([
      prisma.product.findFirst({ where: { id: post.productId, sellerId: post.sellerId } }),
      prisma.socialAccount.findFirst({ where: { sellerId: post.sellerId, platform: 'facebook', status: 'CONNECTED' } }),
    ]);

    if (!product || !account) {
      const message = 'Product no longer exists or Facebook Page is not connected.';
      await prisma.socialPost.update({ where: { id: post.id }, data: { status: SocialPostStatus.FAILED, errorMessage: message } });
      outcomes.push({ status: 'failed', message });
      continue;
    }

    let caption = post.caption ?? '';
    if (!caption.trim()) {
      caption = `Check out ${product.name}!`;
    }

    const config = getFacebookConfig();
    const productUrl = config ? `${getServerEnv().FRONTEND_URL}/product/${product.slug}` : '';

    try {
      const publishResult = await publishOneTimePost({
        sellerId: post.sellerId,
        product: { id: product.id, slug: product.slug, name: product.name, image: product.image, stock: product.stock },
        account: account as FacebookAccountRecord,
        caption,
        idempotencyKey: `scheduled-${post.id}`,
        skipOutOfStock: true,
        productUrl,
        existingPostId: post.id,
      });

      outcomes.push(
        publishResult.status === SocialPostStatus.PUBLISHED
          ? { status: 'published' }
          : { status: 'failed', message: publishResult.errorMessage ?? 'Facebook publishing failed.' },
      );
    } catch {
      outcomes.push({ status: 'failed', message: 'Facebook publishing failed.' });
    }
  }

  return outcomes;
}

/**
 * Single entry point used by the scheduler trigger (internal API / n8n / worker).
 */
export async function runDueSocialWork(now = new Date()) {
  const automations = await processDueAutomations(now);
  const scheduledPosts = await processDueScheduledPosts(now);
  return {
    automations,
    scheduledPosts,
    publishedAutomations: automations.filter((outcome) => outcome.status === 'published').length,
    skippedAutomations: automations.filter((outcome) => outcome.status === 'skipped_out_of_stock').length,
    failedAutomations: automations.filter((outcome) => outcome.status === 'failed').length,
    publishedScheduled: scheduledPosts.filter((outcome) => outcome.status === 'published').length,
  };
}

/**
 * Read-only health/status summary for operators and the internal API.
 */
export async function getSocialAutomationStatus(now = new Date()) {
  const [active, due, running, scheduledDue, failedPosts] = await Promise.all([
    prisma.socialPostAutomation.count({ where: { status: SocialAutomationStatus.ACTIVE } }),
    prisma.socialPostAutomation.count({
      where: {
        status: SocialAutomationStatus.ACTIVE,
        nextRunAt: { lte: now },
        OR: [{ claimedAt: null }, { claimExpiresAt: { lt: now } }],
      },
    }),
    prisma.socialPostAutomation.count({
      where: {
        status: SocialAutomationStatus.ACTIVE,
        claimedAt: { not: null },
        claimExpiresAt: { gt: now },
      },
    }),
    prisma.socialPost.count({ where: { status: SocialPostStatus.SCHEDULED, scheduledAt: { lte: now } } }),
    prisma.socialPost.count({ where: { status: SocialPostStatus.FAILED } }),
  ]);

  return {
    ok: true,
    activeAutomations: active,
    dueAutomations: due,
    runningAutomations: running,
    dueScheduledPosts: scheduledDue,
    failedPosts,
  };
}