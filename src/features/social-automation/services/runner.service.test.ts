import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  processDueAutomations,
  processDueScheduledPosts,
  runDueSocialWork,
} from './runner.service';

const { prisma } = vi.hoisted(() => {
  const mock = {
    socialPostAutomation: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    socialAutomationRun: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    socialPost: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    socialAccount: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    product: {
      findFirst: vi.fn(),
    },
  };
  return { prisma: mock };
});

const enqueueNotification = vi.hoisted(() => vi.fn(async () => undefined));
const getOrCreateSettings = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'settings-1',
    language: 'Bangla + English',
    tone: 'Friendly',
    captionLength: 'Medium',
    hashtags: 'Automatic',
    ctaEnabled: true,
    aiCaptionEnabled: true,
    generateNewCaptionEveryTime: true,
    useLatestProductData: true,
    skipOutOfStock: true,
  })),
);

vi.mock('@/lib/server', () => ({ prisma }));
vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({ FRONTEND_URL: 'https://shop.test' }),
}));
vi.mock('@/workers/queue', () => ({ enqueueNotification }));
vi.mock('./social-automation.service', () => ({ getOrCreateSettings }));
vi.mock('./facebook.service', () => ({
  getFacebookConfig: vi.fn(() => ({ appId: 'app-id', appSecret: 'app-secret' })),
  describeFacebookError: vi.fn(() => ({ kind: 'token', message: 'Facebook access expired.' })),
}));
vi.mock('./publishing.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('./publishing.service')>();
  return {
    ...original,
    publishOneTimePost: vi.fn(),
  };
});
vi.mock('./caption.service', () => ({
  generateSocialCaption: vi.fn(async () => ({ ok: true, caption: 'AI caption' })),
}));

import { publishOneTimePost } from './publishing.service';
import { describeFacebookError } from './facebook.service';
import { generateSocialCaption } from './caption.service';

function makeAutomation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'automation-1',
    sellerId: 'seller-1',
    productId: 'product-1',
    intervalDays: 3,
    startAt: new Date('2026-09-01T00:00:00.000Z'),
    nextRunAt: new Date('2026-09-12T00:00:00.000Z'),
    endAt: null,
    maxPosts: null,
    postsCreated: 0,
    status: 'ACTIVE',
    caption: 'Stored caption',
    generateNewCaption: true,
    useLatestProductData: true,
    skipOutOfStock: true,
    claimedAt: null,
    claimExpiresAt: null,
    claimNonce: null,
    attempts: 0,
    product: {
      id: 'product-1',
      name: 'Test Product',
      slug: 'test-product',
      image: 'https://img.test/a.jpg',
      stock: 5,
      productStatus: 'published',
      price: 1000,
      oldPrice: 1200,
      category: 'electronics',
      description: 'A test product',
      seller: { storeName: 'Test Store' },
    },
    ...overrides,
  };
}

function makeScheduledPost(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'post-1',
    sellerId: 'seller-1',
    productId: 'product-1',
    caption: 'Scheduled caption',
    status: 'SCHEDULED',
    scheduledAt: new Date('2026-09-12T00:00:00.000Z'),
    automationId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('processDueAutomations', () => {
  it('publishes a due automation and advances nextRunAt + postsCreated', async () => {
    const automation = makeAutomation();
    prisma.socialPostAutomation.findMany.mockResolvedValue([automation]);
    prisma.socialPostAutomation.updateMany
      .mockResolvedValueOnce({ count: 1 }) // claim
      .mockResolvedValueOnce({ count: 1 }); // release
    prisma.socialPostAutomation.update.mockResolvedValue(automation);
    prisma.socialAutomationRun.findFirst.mockResolvedValue(null);
    prisma.socialAutomationRun.create.mockResolvedValue({ id: 'run-1' });
    prisma.socialAutomationRun.update.mockResolvedValue({ id: 'run-1', socialPostId: 'post-1' });
    prisma.product.findFirst.mockResolvedValue(automation.product);
    prisma.socialAccount.findFirst.mockResolvedValue({ id: 'account-1', accountId: 'page-1' });
    vi.mocked(publishOneTimePost).mockResolvedValue({
      postId: 'post-1',
      duplicate: false,
      status: 'PUBLISHED',
      externalPostId: 'fb_123',
      publishedAt: new Date('2026-09-12T00:05:00.000Z'),
      errorMessage: null,
    });

    const outcomes = await processDueAutomations(new Date('2026-09-12T00:00:00.000Z'));

    expect(outcomes).toEqual([{ status: 'published' }]);
    expect(vi.mocked(publishOneTimePost)).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'post-run-1', sellerId: 'seller-1' }),
    );
    // releaseClaim resets the lease fields after success
    expect(prisma.socialPostAutomation.updateMany).toHaveBeenCalledWith({
      where: { id: 'automation-1' },
      data: { claimedAt: null, claimExpiresAt: null, claimNonce: null },
    });
  });

  it('generates a fresh caption before publishing when generateNewCaption is enabled', async () => {
    const automation = makeAutomation();
    prisma.socialPostAutomation.findMany.mockResolvedValue([automation]);
    prisma.socialPostAutomation.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.socialAutomationRun.findFirst.mockResolvedValue(null);
    prisma.socialAutomationRun.create.mockResolvedValue({ id: 'run-1' });
    prisma.socialAutomationRun.update.mockResolvedValue({ id: 'run-1', socialPostId: 'post-1' });
    prisma.product.findFirst.mockResolvedValue(automation.product);
    prisma.socialAccount.findFirst.mockResolvedValue({ id: 'account-1', accountId: 'page-1' });
    vi.mocked(publishOneTimePost).mockResolvedValue({
      postId: 'post-1',
      duplicate: false,
      status: 'PUBLISHED',
      externalPostId: 'fb_123',
      publishedAt: new Date('2026-09-12T00:05:00.000Z'),
      errorMessage: null,
    });

    await processDueAutomations(new Date('2026-09-12T00:00:00.000Z'));

    expect(vi.mocked(generateSocialCaption)).toHaveBeenCalled();
    expect(vi.mocked(publishOneTimePost).mock.calls[0][0].caption).toBe('AI caption');
  });

  it('skips out-of-stock cycles without publishing or counting them', async () => {
    const automation = makeAutomation({ product: { ...makeAutomation().product, stock: 0 } });
    prisma.socialPostAutomation.findMany.mockResolvedValue([automation]);
    prisma.socialPostAutomation.updateMany
      .mockResolvedValueOnce({ count: 1 }) // claim
      .mockResolvedValueOnce({ count: 1 }); // release
    prisma.socialPostAutomation.update.mockResolvedValue(automation);
    prisma.product.findFirst.mockResolvedValue(automation.product);

    const outcomes = await processDueAutomations(new Date('2026-09-12T00:00:00.000Z'));

    expect(outcomes).toEqual([{ status: 'skipped_out_of_stock' }]);
    expect(vi.mocked(publishOneTimePost)).not.toHaveBeenCalled();
    expect(prisma.socialAutomationRun.create).not.toHaveBeenCalled();
    expect(prisma.socialPostAutomation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'automation-1' },
        data: expect.objectContaining({ lastStatus: 'SKIPPED_OUT_OF_STOCK' }),
      }),
    );
  });

  it('does not publish when another worker holds the claim', async () => {
    prisma.socialPostAutomation.findMany.mockResolvedValue([makeAutomation()]);
    prisma.socialPostAutomation.updateMany.mockResolvedValue({ count: 0 });

    const outcomes = await processDueAutomations(new Date('2026-09-12T00:00:00.000Z'));

    expect(outcomes).toEqual([{ status: 'skipped_not_claimed' }]);
    expect(vi.mocked(publishOneTimePost)).not.toHaveBeenCalled();
  });

  it('releases the claim when an existing failed post result is returned', async () => {
    const automation = makeAutomation();
    prisma.socialPostAutomation.findMany.mockResolvedValue([automation]);
    prisma.socialPostAutomation.updateMany
      .mockResolvedValueOnce({ count: 1 }) // claim
      .mockResolvedValueOnce({ count: 1 }); // release
    prisma.socialAutomationRun.findFirst.mockResolvedValue(null);
    prisma.socialAutomationRun.create.mockResolvedValue({ id: 'run-1' });
    prisma.socialAutomationRun.update.mockResolvedValue({ id: 'run-1' });
    prisma.product.findFirst.mockResolvedValue(automation.product);
    prisma.socialAccount.findFirst.mockResolvedValue({ id: 'account-1', accountId: 'page-1' });
    vi.mocked(publishOneTimePost).mockResolvedValue({
      postId: 'post-1',
      duplicate: true,
      status: 'FAILED',
      externalPostId: null,
      publishedAt: null,
      errorMessage: 'Facebook publishing failed.',
    });
    prisma.socialPostAutomation.update.mockResolvedValue(automation);

    const outcomes = await processDueAutomations(new Date('2026-09-12T00:00:00.000Z'));

    expect(outcomes).toEqual([
      { status: 'failed', retryable: true, message: 'Facebook publishing failed.' },
    ]);
    expect(prisma.socialPostAutomation.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'automation-1' },
      data: { claimedAt: null, claimExpiresAt: null, claimNonce: null },
    });
  });

  it('pauses the automation and notifies the seller when the token is expired', async () => {
    const automation = makeAutomation();
    prisma.socialPostAutomation.findMany.mockResolvedValue([automation]);
    prisma.socialPostAutomation.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.socialAutomationRun.findFirst.mockResolvedValue(null);
    prisma.socialAutomationRun.create.mockResolvedValue({ id: 'run-1' });
    prisma.socialAutomationRun.update.mockResolvedValue({ id: 'run-1' });
    prisma.product.findFirst.mockResolvedValue(automation.product);
    prisma.socialAccount.findFirst.mockResolvedValue({ id: 'account-1', accountId: 'page-1' });
    vi.mocked(publishOneTimePost).mockRejectedValue(new Error('Facebook access expired or was revoked. Reconnect Facebook.'));
    vi.mocked(describeFacebookError).mockReturnValue({ kind: 'token', message: 'Facebook access expired.' });
    prisma.socialPostAutomation.update.mockResolvedValue(automation);
    prisma.socialAccount.updateMany.mockResolvedValue({ count: 1 });

    const outcomes = await processDueAutomations(new Date('2026-09-12T00:00:00.000Z'));

    expect(outcomes[0]).toMatchObject({ status: 'failed', retryable: false });
    expect(prisma.socialAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'EXPIRED' }) }),
    );
    expect(prisma.socialPostAutomation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'automation-1' },
        data: expect.objectContaining({ status: 'PAUSED', pauseReason: expect.stringContaining('expired') }),
      }),
    );
    expect(enqueueNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'seller-1', channel: 'in_app' }),
    );
  });

  it('completes the automation when maxPosts is reached', async () => {
    const automation = makeAutomation({ maxPosts: 1, postsCreated: 0 });
    prisma.socialPostAutomation.findMany.mockResolvedValue([automation]);
    prisma.socialPostAutomation.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.socialAutomationRun.findFirst.mockResolvedValue(null);
    prisma.socialAutomationRun.create.mockResolvedValue({ id: 'run-1' });
    prisma.socialAutomationRun.update.mockResolvedValue({ id: 'run-1', socialPostId: 'post-1' });
    prisma.product.findFirst.mockResolvedValue(automation.product);
    prisma.socialAccount.findFirst.mockResolvedValue({ id: 'account-1', accountId: 'page-1' });
    vi.mocked(publishOneTimePost).mockResolvedValue({
      postId: 'post-1',
      duplicate: false,
      status: 'PUBLISHED',
      externalPostId: 'fb_123',
      publishedAt: new Date('2026-09-12T00:05:00.000Z'),
      errorMessage: null,
    });

    await processDueAutomations(new Date('2026-09-12T00:00:00.000Z'));

    expect(prisma.socialPostAutomation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'automation-1' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });
});

describe('processDueScheduledPosts', () => {
  it('publishes a due scheduled post using the existing post row', async () => {
    const post = makeScheduledPost();
    prisma.socialPost.findMany.mockResolvedValue([post]);
    prisma.product.findFirst.mockResolvedValue(makeAutomation().product);
    prisma.socialAccount.findFirst.mockResolvedValue({ id: 'account-1', accountId: 'page-1' });
    vi.mocked(publishOneTimePost).mockResolvedValue({
      postId: 'post-1',
      duplicate: false,
      status: 'PUBLISHED',
      externalPostId: 'fb_123',
      publishedAt: new Date('2026-09-12T00:05:00.000Z'),
      errorMessage: null,
    });

    const outcomes = await processDueScheduledPosts(new Date('2026-09-12T00:00:00.000Z'));

    expect(outcomes).toEqual([{ status: 'published' }]);
    expect(vi.mocked(publishOneTimePost)).toHaveBeenCalledWith(
      expect.objectContaining({ existingPostId: 'post-1', idempotencyKey: 'scheduled-post-1' }),
    );
  });

  it('fails the scheduled post when the account is disconnected', async () => {
    prisma.socialPost.findMany.mockResolvedValue([makeScheduledPost()]);
    prisma.product.findFirst.mockResolvedValue(makeAutomation().product);
    prisma.socialAccount.findFirst.mockResolvedValue(null);
    prisma.socialPost.update.mockResolvedValue({});

    const outcomes = await processDueScheduledPosts(new Date('2026-09-12T00:00:00.000Z'));

    expect(outcomes).toEqual([{ status: 'failed', message: expect.stringContaining('not connected') }]);
    expect(prisma.socialPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'post-1' },
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });
});

describe('runDueSocialWork', () => {
  it('aggregates automation and scheduled post outcomes', async () => {
    prisma.socialPostAutomation.findMany.mockResolvedValue([]);
    prisma.socialPost.findMany.mockResolvedValue([]);

    const result = await runDueSocialWork(new Date('2026-09-12T00:00:00.000Z'));

    expect(result).toMatchObject({
      publishedAutomations: 0,
      skippedAutomations: 0,
      failedAutomations: 0,
      publishedScheduled: 0,
    });
  });
});