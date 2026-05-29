import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import {
  requireApiUser,
  serializeLoginStreak,
  serializeMissionProgress,
  serializeNotification,
  serializeReferralCode,
  serializeSpinHistory,
  serializeSpinReward,
  serializeTenantSetting,
  toPlainNumber,
} from '../../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const userId = String(user.id);
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      points: true,
      walletBalance: true,
      tenantId: true,
    },
  });
  const tenantId = row?.tenantId ?? null;

  const [streak, referralCode, missions, notifications, tenantSetting, spinRewards, lastSpin] = await Promise.all([
    prisma.loginStreak.findUnique({ where: { userId } }),
    prisma.referralCode.findFirst({
      where: {
        userId,
        ...(tenantId ? { tenantId } : {}),
      },
    }),
    prisma.missionProgress.findMany({
      where: { userId },
      include: { mission: true },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
    prisma.userNotification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    tenantId ? prisma.tenantSetting.findUnique({ where: { tenantId } }) : Promise.resolve(null),
    prisma.spinReward.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        isActive: true,
      },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.spinHistory.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return NextResponse.json({
    points: row?.points ?? 0,
    wallet_balance: toPlainNumber(row?.walletBalance ?? 0),
    streak: serializeLoginStreak(streak),
    referral: referralCode ? serializeReferralCode(referralCode) : null,
    missions: missions.map(serializeMissionProgress),
    notifications: notifications.map(serializeNotification),
    settings: serializeTenantSetting(tenantSetting),
    spin_rewards: spinRewards.map(serializeSpinReward),
    last_spin: lastSpin ? serializeSpinHistory(lastSpin) : null,
  });
}
