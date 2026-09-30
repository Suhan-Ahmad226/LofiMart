import { createSupabaseServerClient } from '@/app/api/auth/supabase/shared';
import { prisma } from '@/lib/server';
import { logger } from '@/lib/logger';
import { cleanupUserMedia } from './cleanup';

export type CleanupUserInput = {
  userId?: string | null;
  supabaseAuthId?: string | null;
  email?: string | null;
  reason: string;
  deleteSupabaseUser?: boolean;
};

function anonymizedEmail(userId: string) {
  return `deleted-${userId}@deleted.lofimart.local`;
}

export async function cleanupApplicationUser(input: CleanupUserInput) {
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        ...(input.userId ? [{ id: input.userId }] : []),
        ...(input.supabaseAuthId ? [{ supabaseAuthId: input.supabaseAuthId }] : []),
        ...(input.email ? [{ email: input.email.toLowerCase() }] : []),
      ],
    },
    select: {
      id: true,
      email: true,
      supabaseAuthId: true,
      role: true,
      deactivatedAt: true,
    },
  });

  if (!user) {
    logger.info('USER_MEDIA_CLEANUP_COMPLETED', {
      reason: input.reason,
      result: 'user_not_found',
    });
    return { cleaned: false, reason: 'user_not_found' };
  }

  logger.info('USER_MEDIA_CLEANUP_STARTED', {
    userId: user.id,
    reason: input.reason,
  });

  await cleanupUserMedia(user.id);

  await prisma.$transaction(async (tx) => {
    await Promise.all([
      tx.wishlistItem.deleteMany({ where: { userId: user.id } }),
      tx.pushSubscription.deleteMany({ where: { userId: user.id } }),
      tx.loginActivity.deleteMany({ where: { userId: user.id } }),
      tx.providerAccount.deleteMany({ where: { userId: user.id } }),
      tx.emailVerificationToken.deleteMany({ where: { userId: user.id } }),
      tx.phoneVerificationToken.deleteMany({ where: { userId: user.id } }),
      tx.notificationPreference.deleteMany({ where: { userId: user.id } }),
      tx.userNotification.deleteMany({ where: { userId: user.id } }),
      tx.address.deleteMany({ where: { userId: user.id } }),
      tx.communityPost.deleteMany({ where: { userId: user.id } }),
      tx.mediaAsset.updateMany({
        where: { ownerType: 'User', ownerId: user.id },
        data: { status: 'deleted', deletedAt: new Date() },
      }),
    ]);

    await tx.order.updateMany({
      where: { userId: user.id },
      data: { userId: null },
    });

    await tx.user.update({
      where: { id: user.id },
      data: {
        email: anonymizedEmail(user.id),
        supabaseAuthId: null,
        name: 'Deleted user',
        phone: null,
        alternatePhone: null,
        avatarUrl: null,
        bio: null,
        storeName: null,
        storefrontBannerUrl: null,
        storefrontHeadline: null,
        storefrontCustomDomain: null,
        storefrontDomainVerificationToken: null,
        telegramChatId: null,
        deactivatedAt: user.deactivatedAt || new Date(),
        isBlocked: true,
        blockedAt: new Date(),
        blockedReason: 'Account deleted',
      },
    });
  });

  if (input.deleteSupabaseUser && user.supabaseAuthId && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = createSupabaseServerClient(true);
    const { error } = await supabase.auth.admin.deleteUser(user.supabaseAuthId);
    if (error && !/not found/i.test(error.message)) {
      logger.warn('USER_MEDIA_CLEANUP_FAILED', {
        userId: user.id,
        phase: 'supabase_delete',
        error: error.message,
      });
      throw error;
    }
  } else if (input.deleteSupabaseUser && user.supabaseAuthId) {
    logger.warn('USER_MEDIA_CLEANUP_FAILED', {
      userId: user.id,
      phase: 'supabase_delete_skipped',
      error: 'SUPABASE_SERVICE_ROLE_KEY is not configured',
    });
  }

  logger.info('USER_MEDIA_CLEANUP_COMPLETED', {
    userId: user.id,
    reason: input.reason,
  });

  return { cleaned: true, userId: user.id };
}
