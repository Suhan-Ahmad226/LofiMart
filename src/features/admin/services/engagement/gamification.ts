import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/services/database/prisma';

type RewardGrantInput = {
  userId: string;
  tenantId?: string | null;
  eventType: string;
  description: string;
  source: string;
  coins?: number;
  walletAmount?: number;
  discountAmount?: number;
  referenceId?: string | null;
  metadata?: Record<string, unknown> | null;
};

function toDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function ensureTenantSetting(tenantId?: string | null) {
  if (!tenantId) {
    return null;
  }

  return prisma.tenantSetting.upsert({
    where: { tenantId },
    update: {},
    create: { tenantId },
  });
}

export async function ensureReferralCodeForUser(userId: string, tenantId?: string | null) {
  const existing = await prisma.referralCode.findFirst({
    where: { userId, tenantId: tenantId ?? null },
  });

  if (existing) {
    return existing;
  }

  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  return prisma.referralCode.create({
    data: {
      userId,
      tenantId: tenantId ?? null,
      code,
    },
  });
}

export async function createNotification(input: {
  userId: string;
  tenantId?: string | null;
  createdById?: string | null;
  type: string;
  title: string;
  message: string;
  actionUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const metadata = input.metadata ?? Prisma.JsonNull;
  return prisma.userNotification.create({
    data: {
      userId: input.userId,
      tenantId: input.tenantId ?? null,
      createdById: input.createdById ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
      actionUrl: input.actionUrl ?? null,
      metadata,
    },
  });
}

export async function grantReward(input: RewardGrantInput) {
  const coins = input.coins ?? 0;
  const walletAmount = input.walletAmount ?? 0;
  const discountAmount = input.discountAmount ?? 0;

  const user = await prisma.user.update({
    where: { id: input.userId },
    data: {
      points: { increment: coins },
      walletBalance: { increment: walletAmount },
    },
    select: {
      id: true,
      points: true,
      walletBalance: true,
      tenantId: true,
    },
  });

  await prisma.rewardLog.create({
    data: {
      userId: input.userId,
      tenantId: input.tenantId ?? user.tenantId ?? null,
      eventType: input.eventType,
      coinsAmount: coins,
      walletAmount,
      discountAmount,
      source: input.source,
      description: input.description,
      referenceId: input.referenceId ?? null,
      metadata: input.metadata ?? Prisma.JsonNull,
    },
  });

  if (walletAmount !== 0) {
    await prisma.walletTransaction.create({
      data: {
        userId: input.userId,
        tenantId: input.tenantId ?? user.tenantId ?? null,
        type: walletAmount >= 0 ? 'credit' : 'debit',
        amount: Math.abs(walletAmount),
        source: input.source,
        description: input.description,
        balanceAfter: user.walletBalance,
        metadata: input.metadata ?? Prisma.JsonNull,
      },
    });
  }

  return user;
}

export async function ensureDefaultMissions(tenantId?: string | null) {
  const missions = [
    {
      key: tenantId ? `tenant:${tenantId}:complete-profile` : 'global:complete-profile',
      title: 'Complete your profile',
      description: 'Add your profile details so buyers and operations teams can trust the account.',
      targetCount: 1,
      rewardCoins: 80,
    },
    {
      key: tenantId ? `tenant:${tenantId}:first-order` : 'global:first-order',
      title: 'Place your first order',
      description: 'Complete the first successful order to unlock your onboarding bonus.',
      targetCount: 1,
      rewardCoins: 120,
    },
    {
      key: tenantId ? `tenant:${tenantId}:multi-order` : 'global:multi-order',
      title: 'Place three orders',
      description: 'Build trust with repeat purchases and unlock a larger loyalty reward.',
      targetCount: 3,
      rewardCoins: 250,
    },
  ];

  for (const mission of missions) {
    await prisma.mission.upsert({
      where: { key: mission.key },
      update: {
        title: mission.title,
        description: mission.description,
        targetCount: mission.targetCount,
        rewardCoins: mission.rewardCoins,
        tenantId: tenantId ?? null,
      },
      create: {
        ...mission,
        tenantId: tenantId ?? null,
      },
    });
  }
}

export async function updateMissionProgress(userId: string, missionKeyIncludes: string, incrementBy = 1) {
  const missions = await prisma.mission.findMany({
    where: {
      key: { contains: missionKeyIncludes },
      isActive: true,
    },
  });

  for (const mission of missions) {
    const existing = await prisma.missionProgress.findUnique({
      where: {
        userId_missionId: {
          userId,
          missionId: mission.id,
        },
      },
    });

    const progress = Math.min((existing?.progress ?? 0) + incrementBy, mission.targetCount);
    await prisma.missionProgress.upsert({
      where: {
        userId_missionId: {
          userId,
          missionId: mission.id,
        },
      },
      update: {
        progress,
        completedAt: progress >= mission.targetCount ? new Date() : existing?.completedAt ?? null,
      },
      create: {
        userId,
        missionId: mission.id,
        progress,
        completedAt: progress >= mission.targetCount ? new Date() : null,
      },
    });
  }
}

export async function claimDailyLoginReward(userId: string, tenantId?: string | null) {
  const today = toDateKey();
  const streak = await prisma.loginStreak.findUnique({ where: { userId } });

  if (streak?.lastClaimedOn && toDateKey(streak.lastClaimedOn) === today) {
    return { alreadyClaimed: true, streak };
  }

  const settings = await ensureTenantSetting(tenantId);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const continues = streak?.lastClaimedOn && toDateKey(streak.lastClaimedOn) === toDateKey(yesterday);
  const currentStreak = continues ? (streak?.currentStreak ?? 0) + 1 : 1;
  const rewardCoins = Math.min(
    (settings?.dailyLoginBaseCoins ?? 10) * currentStreak,
    settings?.dailyLoginMaxCoins ?? 70,
  );

  const updated = await prisma.loginStreak.upsert({
    where: { userId },
    update: {
      currentStreak,
      longestStreak: Math.max(streak?.longestStreak ?? 0, currentStreak),
      lastClaimedOn: new Date(),
      totalClaimedCoins: { increment: rewardCoins },
    },
    create: {
      userId,
      currentStreak,
      longestStreak: currentStreak,
      lastClaimedOn: new Date(),
      totalClaimedCoins: rewardCoins,
    },
  });

  await grantReward({
    userId,
    tenantId,
    eventType: 'daily_login',
    source: 'daily_login',
    description: `Daily login streak reward for day ${currentStreak}`,
    coins: rewardCoins,
    metadata: { currentStreak },
  });

  return { alreadyClaimed: false, streak: updated, rewardCoins };
}

export async function ensureDefaultSpinRewards(tenantId?: string | null) {
  const defaults = [
    { label: '25 Coins', rewardType: 'coins', rewardValue: 25, probability: 0.34, displayOrder: 1 },
    { label: '50 Coins', rewardType: 'coins', rewardValue: 50, probability: 0.25, displayOrder: 2 },
    { label: 'Free Shipping', rewardType: 'free_shipping', rewardValue: 1, probability: 0.16, displayOrder: 3 },
    { label: '5% Discount', rewardType: 'discount', rewardValue: 5, probability: 0.15, displayOrder: 4 },
    { label: '100 Wallet Credit', rewardType: 'wallet_credit', rewardValue: 100, probability: 0.1, displayOrder: 5 },
  ];

  for (const reward of defaults) {
    const existing = await prisma.spinReward.findFirst({
      where: {
        tenantId: tenantId ?? null,
        label: reward.label,
      },
    });

    if (!existing) {
      await prisma.spinReward.create({
        data: {
          tenantId: tenantId ?? null,
          ...reward,
        },
      });
    }
  }
}

export async function runDailySpin(userId: string, tenantId?: string | null) {
  const settings = await ensureTenantSetting(tenantId);
  await ensureDefaultSpinRewards(tenantId);
  const dateKey = toDateKey();

  const alreadySpun = await prisma.spinHistory.findUnique({
    where: {
      userId_dateKey: {
        userId,
        dateKey,
      },
    },
  });

  if (alreadySpun || !settings?.spinEnabled) {
    return { alreadySpun: true, history: alreadySpun };
  }

  const rewards = await prisma.spinReward.findMany({
    where: {
      tenantId: tenantId ?? null,
      isActive: true,
    },
    orderBy: { displayOrder: 'asc' },
  });

  const roll = Math.random();
  let cumulative = 0;
  let selected = rewards[rewards.length - 1] ?? null;

  for (const reward of rewards) {
    cumulative += reward.probability;
    if (roll <= cumulative) {
      selected = reward;
      break;
    }
  }

  if (!selected) {
    throw new Error('No active spin reward configured');
  }

  const history = await prisma.spinHistory.create({
    data: {
      userId,
      tenantId: tenantId ?? null,
      rewardId: selected.id,
      rewardLabel: selected.label,
      rewardType: selected.rewardType,
      rewardValue: selected.rewardValue,
      dateKey,
    },
  });

  if (selected.rewardType === 'coins') {
    await grantReward({
      userId,
      tenantId,
      eventType: 'spin_wheel',
      source: 'spin_wheel',
      description: `Won ${selected.label} from the daily spin wheel`,
      coins: Number(selected.rewardValue),
      referenceId: history.id,
    });
  }

  if (selected.rewardType === 'wallet_credit') {
    await grantReward({
      userId,
      tenantId,
      eventType: 'spin_wheel',
      source: 'spin_wheel',
      description: `Won ${selected.label} from the daily spin wheel`,
      walletAmount: Number(selected.rewardValue),
      referenceId: history.id,
    });
  }

  return { alreadySpun: false, history, reward: selected };
}
