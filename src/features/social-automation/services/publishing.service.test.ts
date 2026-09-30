import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  publishOneTimePost,
  SocialAutomationPublishError,
} from './publishing.service';
import { decryptSensitiveValue } from '@/features/shared/services/security/fieldEncryption';
import {
  describeFacebookError,
  getFacebookConfig,
  getPublicProductImageUrl,
  publishFacebookPagePost,
  validateFacebookPageToken,
} from './facebook.service';

const { prisma } = vi.hoisted(() => {
  const mock = {
    socialPost: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    socialPostTarget: {
      update: vi.fn(),
    },
    socialAccount: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { prisma: mock };
});

vi.mock('@/lib/server', () => ({ prisma }));
vi.mock('@/features/shared/services/security/fieldEncryption', () => ({
  decryptSensitiveValue: vi.fn(),
}));
vi.mock('./facebook.service', () => ({
  getFacebookConfig: vi.fn(),
  validateFacebookPageToken: vi.fn(),
  publishFacebookPagePost: vi.fn(),
  describeFacebookError: vi.fn(),
  getPublicProductImageUrl: vi.fn(),
}));

function makePost(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'post-1',
    sellerId: 'seller-1',
    productId: 'product-1',
    caption: 'Check out this product!',
    mediaUrl: 'https://img.test/a.jpg',
    status: 'PUBLISHING',
    idempotencyKey: 'idem-12345678',
    externalPostId: null,
    publishedAt: null,
    errorMessage: null,
    targets: [{ id: 'target-1' }],
    ...overrides,
  };
}

const options = {
  sellerId: 'seller-1',
  product: { id: 'product-1', slug: 'test-product', name: 'Test Product', image: 'https://img.test/a.jpg', stock: 5 },
  account: {
    id: 'account-1',
    accountId: 'page-1',
    accountName: 'Page One',
    encryptedAccessToken: 'enc-page-token',
    status: 'CONNECTED',
  },
  caption: 'Check out this product!',
  idempotencyKey: 'idem-12345678',
  skipOutOfStock: true,
  productUrl: 'https://shop.test/product/test-product',
};

describe('publishOneTimePost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never publishes when skipOutOfStock is enabled and stock is zero', async () => {
    await expect(
      publishOneTimePost({ ...options, product: { ...options.product, stock: 0 } }),
    ).rejects.toThrow(SocialAutomationPublishError);
    expect(prisma.socialPost.findUnique).not.toHaveBeenCalled();
    expect(prisma.socialPost.create).not.toHaveBeenCalled();
  });

  it('returns the existing record as a duplicate when the idempotency key matches', async () => {
    prisma.socialPost.findUnique.mockResolvedValue(makePost({ status: 'PUBLISHED', externalPostId: 'fb-1' }));

    const result = await publishOneTimePost(options);

    expect(result).toMatchObject({ duplicate: true, status: 'PUBLISHED', externalPostId: 'fb-1' });
    expect(prisma.socialPost.create).not.toHaveBeenCalled();
  });

  it('returns a duplicate when a concurrent create hits a unique violation on idempotencyKey', async () => {
    prisma.socialPost.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makePost({ id: 'post-2', status: 'PUBLISHING' }));
    prisma.socialPost.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`idempotencyKey`)', {
        code: 'P2002',
        clientVersion: '6.0.0',
        meta: { target: 'socialPost_idempotencyKey' },
      }),
    );

    const result = await publishOneTimePost(options);

    expect(result).toMatchObject({ duplicate: true, postId: 'post-2' });
  });

  it('publishes successfully and transitions PUBLISHING -> PUBLISHED with the real external id', async () => {
    prisma.socialPost.findUnique.mockResolvedValue(null);
    prisma.socialPost.create.mockResolvedValue(makePost());
    vi.mocked(getFacebookConfig).mockReturnValue({
      appId: 'app-id',
      appSecret: 'app-secret',
      redirectUri: 'https://shop.test/cb',
    });
    vi.mocked(decryptSensitiveValue).mockReturnValue('page-token');
    vi.mocked(validateFacebookPageToken).mockResolvedValue({ id: 'page-1', name: 'Page One' });
    vi.mocked(publishFacebookPagePost).mockResolvedValue({ externalPostId: 'fb_123456' });
    vi.mocked(getPublicProductImageUrl).mockReturnValue('https://img.test/a.jpg');
    prisma.$transaction.mockResolvedValue([]);

    const result = await publishOneTimePost(options);

    expect(publishFacebookPagePost).toHaveBeenCalled();
    expect(prisma.socialPost.update).toHaveBeenCalledTimes(1);
    expect(prisma.socialPost.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'post-1' },
      data: { status: 'PUBLISHED', externalPostId: 'fb_123456' },
    });
    expect(prisma.socialPostTarget.update.mock.calls[0][0].data).toMatchObject({
      status: 'PUBLISHED',
      externalPostId: 'fb_123456',
    });
    expect(prisma.socialAccount.update.mock.calls[0][0].data).toMatchObject({
      status: 'CONNECTED',
    });
    expect(result).toMatchObject({
      duplicate: false,
      status: 'PUBLISHED',
      externalPostId: 'fb_123456',
      publishedAt: expect.any(Date),
      errorMessage: null,
    });
  });

  it('fails the post and marks the account EXPIRED when the page token validation fails with a token error', async () => {
    prisma.socialPost.findUnique.mockResolvedValue(null);
    prisma.socialPost.create.mockResolvedValue(makePost());
    vi.mocked(getFacebookConfig).mockReturnValue({
      appId: 'app-id',
      appSecret: 'app-secret',
      redirectUri: 'https://shop.test/cb',
    });
    vi.mocked(decryptSensitiveValue).mockReturnValue('page-token');
    vi.mocked(validateFacebookPageToken).mockRejectedValue(new Error('Token expired'));
    vi.mocked(describeFacebookError).mockReturnValue({ kind: 'token', message: 'Facebook Page access expired or was revoked.' });
    prisma.socialPost.update.mockResolvedValue(makePost());
    prisma.socialPostTarget.update.mockResolvedValue({ id: 'target-1' });
    prisma.socialAccount.update.mockResolvedValue({});

    await expect(publishOneTimePost(options)).rejects.toThrow(SocialAutomationPublishError);

    expect(prisma.socialPost.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED', errorMessage: expect.any(String) } }),
    );
    expect(prisma.socialAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'EXPIRED' }) }),
    );
  });

  it('fails the post when Facebook publishing is not configured and never calls the Graph API', async () => {
    prisma.socialPost.findUnique.mockResolvedValue(null);
    prisma.socialPost.create.mockResolvedValue(makePost());
    vi.mocked(getFacebookConfig).mockReturnValue(null);
    prisma.socialPost.update.mockResolvedValue(makePost());

    await expect(publishOneTimePost(options)).rejects.toThrow('Facebook publishing is not configured.');
    expect(publishFacebookPagePost).not.toHaveBeenCalled();
  });

  it('fails the post when the account has no Facebook Page id', async () => {
    prisma.socialPost.findUnique.mockResolvedValue(null);
    prisma.socialPost.create.mockResolvedValue(makePost());
    vi.mocked(getFacebookConfig).mockReturnValue({
      appId: 'app-id',
      appSecret: 'app-secret',
      redirectUri: 'https://shop.test/cb',
    });
    prisma.socialPost.update.mockResolvedValue(makePost());

    await expect(publishOneTimePost({ ...options, account: { ...options.account, accountId: null } })).rejects.toThrow(
      'Facebook Page is not connected.',
    );
  });
});