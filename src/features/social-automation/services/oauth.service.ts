import { randomBytes } from 'crypto';
import { Prisma, SocialPlatform } from '@prisma/client';
import { prisma } from '@/lib/server';
import { decryptSensitiveValue, encryptSensitiveValue } from '@/features/shared/services/security/fieldEncryption';
import {
  FacebookPage,
  fetchFacebookPages,
  requireFacebookConfig,
  validateFacebookPageToken,
} from './facebook.service';

type OAuthStateRecord = {
  id: string;
  sellerId: string;
  provider: SocialPlatform;
  state: string;
  expiresAt: Date;
  usedAt: Date | null;
  encryptedAccessToken: string | null;
  metadata: Prisma.JsonValue | null;
};

type PendingPage = {
  id: string;
  name: string;
};

function getPagesFromMetadata(metadata: Prisma.JsonValue | null): PendingPage[] {
  if (!metadata || typeof metadata !== 'object' || !Array.isArray((metadata as { pages?: unknown }).pages)) {
    return [];
  }

  return (metadata as { pages: unknown[] }).pages
    .filter((page): page is Record<string, unknown> => Boolean(page && typeof page === 'object'))
    .map((page) => ({
      id: typeof page.id === 'string' ? page.id : '',
      name: typeof page.name === 'string' ? page.name : '',
    }))
    .filter((page) => Boolean(page.id && page.name));
}

export async function createOAuthState(sellerId: string) {
  const now = new Date();
  await prisma.oAuthState.deleteMany({
    where: { sellerId, provider: 'facebook', expiresAt: { lt: now } },
  });

  const state = randomBytes(32).toString('hex');
  return prisma.oAuthState.create({
    data: {
      sellerId,
      provider: 'facebook',
      state,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    },
  });
}

export async function getPendingOAuthState(
  sellerId: string,
  state: string,
): Promise<OAuthStateRecord | null> {
  return prisma.oAuthState.findFirst({
    where: {
      sellerId,
      provider: 'facebook',
      state,
      expiresAt: { gt: new Date() },
      usedAt: null,
    },
  }) as Promise<OAuthStateRecord | null>;
}

export async function storePendingOAuthPages(
  oauthStateId: string,
  encryptedUserAccessToken: string,
  pages: FacebookPage[],
  userTokenExpiresAt?: Date,
) {
  return prisma.oAuthState.update({
    where: { id: oauthStateId },
    data: {
      encryptedAccessToken: encryptedUserAccessToken,
      metadata: {
        pages: pages.map((page) => ({ id: page.id, name: page.name })),
        ...(userTokenExpiresAt ? { userTokenExpiresAt: userTokenExpiresAt.toISOString() } : {}),
      },
    },
  });
}

export async function cancelPendingOAuthState(state: string, sellerId: string) {
  return prisma.oAuthState.updateMany({
    where: {
      state,
      sellerId,
      provider: 'facebook',
      expiresAt: { gt: new Date() },
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
      encryptedAccessToken: null,
    },
  });
}

export async function invalidateOAuthState(oauthStateId: string) {
  return prisma.oAuthState.update({
    where: { id: oauthStateId },
    data: {
      usedAt: new Date(),
      encryptedAccessToken: null,
    },
  });
}

export async function confirmFacebookPageConnection(
  sellerId: string,
  state: string,
  pageId: string,
) {
  const oauthState = await getPendingOAuthState(sellerId, state);
  if (!oauthState) throw new Error('OAuth state is invalid or expired.');

  const userAccessToken = decryptSensitiveValue(oauthState.encryptedAccessToken);
  if (!userAccessToken) throw new Error('Facebook OAuth session is unavailable.');

  const tokenExpiresAt = getPendingTokenExpiry(oauthState.metadata, oauthState.expiresAt);
  const config = requireFacebookConfig();
  let selectedPage: FacebookPage | null = null;

  try {
    const pages = await fetchFacebookPages(config, userAccessToken);
    selectedPage = pages.find((page) => page.id === pageId) ?? null;
    if (!selectedPage) throw new Error('The selected Facebook Page is no longer available.');

    await validateFacebookPageToken(config, selectedPage.id, selectedPage.accessToken);
  } catch (error) {
    await invalidateOAuthState(oauthState.id);
    throw error;
  }

  if (!selectedPage) throw new Error('The selected Facebook Page is no longer available.');
  const encryptedPageAccessToken = encryptSensitiveValue(selectedPage.accessToken);
  if (!encryptedPageAccessToken) throw new Error('Facebook Page access token could not be stored securely.');

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const consumed = await tx.oAuthState.updateMany({
      where: {
        id: oauthState.id,
        sellerId,
        provider: 'facebook',
        expiresAt: { gt: now },
        usedAt: null,
      },
      data: {
        usedAt: now,
        encryptedAccessToken: null,
      },
    });

    if (consumed.count === 0) throw new Error('OAuth state has already been used.');

    const account = await tx.socialAccount.upsert({
      where: {
        sellerId_platform_accountId: {
          sellerId,
          platform: 'facebook',
          accountId: selectedPage.id,
        },
      },
      update: {
        accountId: selectedPage.id,
        accountName: selectedPage.name,
        encryptedAccessToken: encryptedPageAccessToken,
        tokenExpiresAt,
        status: 'CONNECTED',
        updatedAt: now,
      },
      create: {
        sellerId,
        platform: 'facebook',
        accountId: selectedPage.id,
        accountName: selectedPage.name,
        encryptedAccessToken: encryptedPageAccessToken,
        tokenExpiresAt,
        status: 'CONNECTED',
      },
    });

    return {
      id: account.id,
      account_id: account.accountId,
      account_name: account.accountName,
      status: account.status,
      connected: account.status === 'CONNECTED',
    };
  });
}

export function getPendingPages(oauthState: OAuthStateRecord | null) {
  return getPagesFromMetadata(oauthState?.metadata ?? null);
}

function getPendingTokenExpiry(metadata: Prisma.JsonValue | null, expiresAt: Date) {
  if (!metadata || typeof metadata !== 'object') return null;

  const stored = (metadata as { userTokenExpiresAt?: unknown }).userTokenExpiresAt;
  if (typeof stored !== 'string' || !stored) return null;

  const parsed = new Date(stored);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.getTime() > expiresAt.getTime() ? parsed : null;
}

export function isOAuthStateUsable(oauthState: OAuthStateRecord | null, now = new Date()) {
  return Boolean(
    oauthState &&
      oauthState.usedAt === null &&
      oauthState.expiresAt.getTime() > now.getTime(),
  );
}
