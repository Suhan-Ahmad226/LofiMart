import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  cancelPendingOAuthState,
  confirmFacebookPageConnection,
  createOAuthState,
  getPendingOAuthState,
  getPendingPages,
  invalidateOAuthState,
  isOAuthStateUsable,
  storePendingOAuthPages,
} from './oauth.service';
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
} from '@/features/shared/services/security/fieldEncryption';
import { fetchFacebookPages, validateFacebookPageToken } from './facebook.service';

const { prisma } = vi.hoisted(() => {
  const mock = {
    oAuthState: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    socialAccount: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { prisma: mock };
});

vi.mock('@/lib/server', () => ({ prisma }));
vi.mock('@/features/shared/services/security/fieldEncryption', () => ({
  decryptSensitiveValue: vi.fn(),
  encryptSensitiveValue: vi.fn(),
}));
vi.mock('./facebook.service', () => ({
  fetchFacebookPages: vi.fn(),
  validateFacebookPageToken: vi.fn(),
  requireFacebookConfig: vi.fn(() => ({
    appId: 'app-id',
    appSecret: 'app-secret',
    redirectUri: 'https://shop.test/cb',
  })),
}));

type OAuthStateLike = {
  id: string;
  sellerId: string;
  provider: 'facebook';
  state: string;
  expiresAt: Date;
  usedAt: Date | null;
  encryptedAccessToken: string | null;
  metadata: Prisma.JsonValue | null;
};

function makeRecord(overrides: Partial<Record<string, unknown>> = {}): OAuthStateLike {
  return {
    id: 'oauth-1',
    sellerId: 'seller-1',
    provider: 'facebook',
    state: 'state-hex',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    encryptedAccessToken: 'enc-user-token',
    metadata: null,
    ...overrides,
  } as unknown as OAuthStateLike;
}

describe('oauth.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  });

  describe('createOAuthState', () => {
    it('cleans up expired states and creates a fresh one with a 64-char state', async () => {
      prisma.oAuthState.create.mockResolvedValue({ id: 'oauth-1', state: 'x'.repeat(64) });

      const result = await createOAuthState('seller-1');

      expect(prisma.oAuthState.deleteMany).toHaveBeenCalledWith({
        where: { sellerId: 'seller-1', provider: 'facebook', expiresAt: { lt: expect.any(Date) } },
      });
      expect(result.state).toHaveLength(64);
    });
  });

  describe('getPendingOAuthState', () => {
    it('filters by seller, provider, state, expiry and single use', async () => {
      prisma.oAuthState.findFirst.mockResolvedValue(makeRecord());

      await getPendingOAuthState('seller-1', 'state-hex');

      expect(prisma.oAuthState.findFirst).toHaveBeenCalledWith({
        where: {
          sellerId: 'seller-1',
          provider: 'facebook',
          state: 'state-hex',
          expiresAt: { gt: expect.any(Date) },
          usedAt: null,
        },
      });
    });
  });

  describe('cancelPendingOAuthState', () => {
    it('matches states by the raw state value (not id)', async () => {
      prisma.oAuthState.updateMany.mockResolvedValue({ count: 1 });

      await cancelPendingOAuthState('state-hex', 'seller-1');

      const args = prisma.oAuthState.updateMany.mock.calls[0][0];
      expect(args.where).toMatchObject({ state: 'state-hex', sellerId: 'seller-1', provider: 'facebook' });
      expect(args.data.usedAt).toBeInstanceOf(Date);
      expect(args.data.encryptedAccessToken).toBeNull();
    });
  });

  describe('storePendingOAuthPages / getPendingPages', () => {
    it('stores only id and name for each page', async () => {
      prisma.oAuthState.update.mockResolvedValue(makeRecord());

      await storePendingOAuthPages(
        'oauth-1',
        'enc-user-token',
        [{ id: 'p1', name: 'Page One', accessToken: 'secret-token' }],
      );

      const data = prisma.oAuthState.update.mock.calls[0][0].data;
      expect(data.metadata).toEqual({ pages: [{ id: 'p1', name: 'Page One' }] });
      expect(JSON.stringify(data.metadata)).not.toContain('secret-token');
    });

    it('records the user token expiry when provided', async () => {
      prisma.oAuthState.update.mockResolvedValue(makeRecord());
      const expiry = new Date('2030-01-01T00:00:00Z');

      await storePendingOAuthPages('oauth-1', 'enc-token', [], expiry);

      const data = prisma.oAuthState.update.mock.calls[0][0].data;
      expect(data.metadata.userTokenExpiresAt).toBe(expiry.toISOString());
    });

    it('reads pages back from metadata', () => {
      const record = makeRecord({ metadata: { pages: [{ id: 'p1', name: 'Page One' }] } });
      expect(getPendingPages(record)).toEqual([{ id: 'p1', name: 'Page One' }]);
      expect(getPendingPages({ ...record, metadata: null })).toEqual([]);
    });
  });

  describe('invalidateOAuthState', () => {
    it('marks the state used and clears the token', async () => {
      prisma.oAuthState.update.mockResolvedValue(makeRecord());

      await invalidateOAuthState('oauth-1');

      const args = prisma.oAuthState.update.mock.calls[0][0];
      expect(args.where).toEqual({ id: 'oauth-1' });
      expect(args.data.usedAt).toBeInstanceOf(Date);
      expect(args.data.encryptedAccessToken).toBeNull();
    });
  });

  describe('isOAuthStateUsable', () => {
    it('accepts unexpired, unused states', () => {
      expect(isOAuthStateUsable(makeRecord(), new Date(Date.now() + 30_000))).toBe(true);
    });

    it('rejects used, expired, or absent states', () => {
      expect(isOAuthStateUsable(makeRecord({ usedAt: new Date() }), new Date())).toBe(false);
      expect(isOAuthStateUsable(makeRecord({ expiresAt: new Date(Date.now() - 60_000) }), new Date())).toBe(false);
      expect(isOAuthStateUsable(null)).toBe(false);
    });
  });

  describe('confirmFacebookPageConnection', () => {
    it('validates and persists the selected page as a connected account', async () => {
      prisma.oAuthState.findFirst.mockResolvedValue(makeRecord());
      vi.mocked(decryptSensitiveValue).mockReturnValue('user-token');
      vi.mocked(fetchFacebookPages).mockResolvedValue([
        { id: 'p1', name: 'Page One', accessToken: 'page-token' },
      ]);
      vi.mocked(validateFacebookPageToken).mockResolvedValue({ id: 'p1', name: 'Page One' });
      vi.mocked(encryptSensitiveValue).mockReturnValue('enc-page-token');
      prisma.oAuthState.updateMany.mockResolvedValue({ count: 1 });
      prisma.socialAccount.upsert.mockResolvedValue({
        id: 'account-1',
        accountId: 'p1',
        accountName: 'Page One',
        status: 'CONNECTED',
      });

      const result = await confirmFacebookPageConnection('seller-1', 'state-hex', 'p1');

      expect(validateFacebookPageToken).toHaveBeenCalledWith(
        { appId: 'app-id', appSecret: 'app-secret', redirectUri: 'https://shop.test/cb' },
        'p1',
        'page-token',
      );

      const upsertArgs = prisma.socialAccount.upsert.mock.calls[0][0];
      expect(upsertArgs.where).toEqual({
        sellerId_platform_accountId: { sellerId: 'seller-1', platform: 'facebook', accountId: 'p1' },
      });
      expect(upsertArgs.update).toMatchObject({
        accountId: 'p1',
        accountName: 'Page One',
        encryptedAccessToken: 'enc-page-token',
        status: 'CONNECTED',
      });
      expect(upsertArgs.create).toMatchObject({
        sellerId: 'seller-1',
        platform: 'facebook',
        accountId: 'p1',
        accountName: 'Page One',
        encryptedAccessToken: 'enc-page-token',
        status: 'CONNECTED',
      });

      expect(result).toEqual({
        id: 'account-1',
        account_id: 'p1',
        account_name: 'Page One',
        status: 'CONNECTED',
        connected: true,
      });
    });

    it('throws when the OAuth state is invalid or expired', async () => {
      prisma.oAuthState.findFirst.mockResolvedValue(null);

      await expect(confirmFacebookPageConnection('seller-1', 'bad-state', 'p1')).rejects.toThrow(
        'OAuth state is invalid or expired.',
      );
    });

    it('throws and invalidates the state when the selected page is unavailable', async () => {
      prisma.oAuthState.findFirst.mockResolvedValue(makeRecord());
      vi.mocked(decryptSensitiveValue).mockReturnValue('user-token');
      vi.mocked(fetchFacebookPages).mockResolvedValue([{ id: 'p1', name: 'Page One', accessToken: 'page-token' }]);
      prisma.oAuthState.update.mockResolvedValue(makeRecord());

      await expect(confirmFacebookPageConnection('seller-1', 'state-hex', 'missing')).rejects.toThrow(
        'The selected Facebook Page is no longer available.',
      );
      expect(prisma.oAuthState.update).toHaveBeenCalledWith({
        where: { id: 'oauth-1' },
        data: { usedAt: expect.any(Date), encryptedAccessToken: null },
      });
    });
  });
});