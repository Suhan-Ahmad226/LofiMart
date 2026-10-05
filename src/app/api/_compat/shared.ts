import { NextResponse } from 'next/server';
import { prisma, requireAdminRole, requireSellerRole, requireRole as requireCanonicalRole, type AuthenticatedUser } from '@/lib/server';
import { ensureRedis } from '../../../features/shared/services/messaging/redis';
import { getServerEnv } from '../../../lib/env';

export { requireApiUser, toPlainNumber } from '../products/shared';
export type { SessionUser } from '../products/shared';
import { toPlainNumber } from '../products/shared';

export function userCartKey(userId: string | number) {
  return `${process.env.REDIS_PREFIX || 'lofimart'}:cart:${userId}`;
}

export async function readUserCart(userId: string | number) {
  try {
    const redis = await ensureRedis();
    const raw = await redis.get(userCartKey(userId));
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export async function writeUserCart(userId: string | number, items: unknown[]) {
  try {
    const redis = await ensureRedis();
    const { SESSION_TTL_SECONDS } = getServerEnv();
    if (items.length > 0) {
      await redis.set(userCartKey(userId), JSON.stringify(items), 'EX', SESSION_TTL_SECONDS);
    } else {
      await redis.del(userCartKey(userId));
    }
  } catch {
    // Cart has a localStorage fallback in the client, so Redis sync failure should not break the page.
  }
}

export function serializeUser(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? undefined,
    alternate_phone: user.alternatePhone ?? null,
    role: user.role,
    avatar_url: user.avatarUrl ?? null,
    bio: user.bio ?? null,
    store_name: user.storeName ?? null,
    storefront_slug: user.storefrontSlug ?? null,
    storefront_banner_url: user.storefrontBannerUrl ?? null,
    storefront_headline: user.storefrontHeadline ?? null,
    storefront_accent_color: user.storefrontAccentColor ?? null,
    storefront_custom_domain: user.storefrontCustomDomain ?? null,
    storefront_published: Boolean(user.storefrontPublished ?? true),
    profile_visibility: user.profileVisibility ?? 'private',
    response_time_hours: user.responseTimeHours ?? null,
    seller_status: user.sellerStatus ?? 'draft',
    points: user.points ?? 0,
    wallet_balance: toPlainNumber(user.walletBalance ?? 0),
    email_verified: user.emailVerified ? 1 : 0,
    phone_verified: user.phoneVerified ? 1 : 0,
    two_factor_enabled: Boolean(user.twoFactorEnabled),
    has_password: Boolean(user.supabaseAuthId),
    created_at: user.createdAt ? new Date(user.createdAt).toISOString() : undefined,
  };
}

export function serializeAddress(address: any) {
  return {
    id: address.id,
    label: address.label ?? null,
    type: address.type ?? 'shipping',
    name: address.name,
    phone: address.phone,
    alternate_phone: address.alternatePhone ?? null,
    address: address.address,
    line2: address.line2 ?? null,
    division: address.division ?? null,
    district: address.district ?? null,
    upazila: address.upazila ?? null,
    house: address.house ?? null,
    road: address.road ?? null,
    village: address.village ?? null,
    city: address.city,
    state: address.state ?? null,
    postal_code: address.postalCode ?? null,
    country: address.country ?? 'Bangladesh',
    is_default: address.isDefault ? 1 : 0,
    created_at: address.createdAt ? new Date(address.createdAt).toISOString() : undefined,
  };
}

export function serializeNotificationPreference(preference: any) {
  return {
    email_enabled: preference?.emailEnabled ?? true,
    sms_enabled: preference?.smsEnabled ?? false,
    order_updates: preference?.orderUpdates ?? true,
    marketing_opt_in: preference?.marketingOptIn ?? false,
    payout_alerts: preference?.payoutAlerts ?? true,
    security_alerts: preference?.securityAlerts ?? true,
  };
}

export function serializeNotification(notification: any) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    action_url: notification.actionUrl ?? null,
    metadata: notification.metadata ?? null,
    read_at: notification.readAt ? new Date(notification.readAt).toISOString() : null,
    created_at: notification.createdAt ? new Date(notification.createdAt).toISOString() : undefined,
  };
}

export function serializeOrder(order: any) {
  return {
    id: order.id,
    order_code: order.orderCode ?? null,
    user_id: order.userId,
    total: toPlainNumber(order.total),
    status: order.status,
    courier_provider: order.courierProvider ?? null,
    tracking_id: order.trackingId ?? null,
    payment_method: order.paymentMethod ?? null,
    payment_provider: order.paymentProvider ?? null,
    payment_status: order.paymentStatus ?? null,
    paid_at: order.paidAt ? new Date(order.paidAt).toISOString() : null,
    shipping_address: order.shippingAddress ?? null,
    shipments: Array.isArray(order.shipments)
      ? order.shipments.map((shipment: any) => ({
          id: shipment.id,
          status: shipment.status,
          courier_provider: shipment.courierProvider ?? null,
          tracking_id: shipment.trackingId ?? null,
          warehouse: shipment.warehouse ?? null,
          created_at: shipment.createdAt ? new Date(shipment.createdAt).toISOString() : undefined,
        }))
      : [],
    created_at: order.createdAt ? new Date(order.createdAt).toISOString() : undefined,
    updated_at: order.updatedAt ? new Date(order.updatedAt).toISOString() : undefined,
  };
}

export function serializeWalletTransaction(transaction: any) {
  return {
    id: transaction.id,
    type: transaction.type,
    amount: toPlainNumber(transaction.amount),
    currency: transaction.currency,
    status: transaction.status,
    source: transaction.source,
    description: transaction.description,
    balance_after: toPlainNumber(transaction.balanceAfter ?? 0),
    metadata: transaction.metadata ?? null,
    created_at: transaction.createdAt ? new Date(transaction.createdAt).toISOString() : undefined,
  };
}

export function serializeLoginStreak(streak: any) {
  return {
    current_streak: streak?.currentStreak ?? 0,
    longest_streak: streak?.longestStreak ?? 0,
    total_claimed_coins: streak?.totalClaimedCoins ?? 0,
    last_claimed_on: streak?.lastClaimedOn ? new Date(streak.lastClaimedOn).toISOString() : null,
  };
}

export function serializeReferralCode(code: any) {
  return {
    id: code.id,
    code: code.code,
    clicks: code.clicks ?? 0,
    successful_referrals: code.successfulReferrals ?? 0,
    earnings: toPlainNumber(code.earnings ?? 0),
    created_at: code.createdAt ? new Date(code.createdAt).toISOString() : undefined,
    updated_at: code.updatedAt ? new Date(code.updatedAt).toISOString() : undefined,
  };
}

export function serializeSpinReward(reward: any) {
  return {
    id: reward.id,
    label: reward.label,
    reward_type: reward.rewardType,
    reward_value: toPlainNumber(reward.rewardValue),
    probability: reward.probability,
    is_active: reward.isActive,
    display_order: reward.displayOrder,
  };
}

export function serializeSpinHistory(history: any) {
  return {
    id: history.id,
    reward_label: history.rewardLabel,
    reward_type: history.rewardType,
    reward_value: toPlainNumber(history.rewardValue),
    date_key: history.dateKey,
    created_at: history.createdAt ? new Date(history.createdAt).toISOString() : undefined,
  };
}

export function serializeMissionProgress(progress: any) {
  return {
    id: progress.id,
    progress: progress.progress,
    completed_at: progress.completedAt ? new Date(progress.completedAt).toISOString() : null,
    claimed_at: progress.claimedAt ? new Date(progress.claimedAt).toISOString() : null,
    mission: progress.mission
      ? {
          id: progress.mission.id,
          key: progress.mission.key,
          title: progress.mission.title,
          description: progress.mission.description,
          target_count: progress.mission.targetCount,
          reward_coins: progress.mission.rewardCoins,
          reward_wallet: toPlainNumber(progress.mission.rewardWallet),
        }
      : null,
  };
}

export function serializeTenantSetting(setting: any) {
  if (!setting) return null;

  return {
    tenant_id: setting.tenantId,
    currency: setting.currency,
    locale: setting.locale,
    free_shipping_threshold: toPlainNumber(setting.freeShippingThreshold),
    cart_recovery_delay_mins: setting.cartRecoveryDelayMins,
    signup_bonus_coins: setting.signupBonusCoins,
    daily_login_base_coins: setting.dailyLoginBaseCoins,
    daily_login_max_coins: setting.dailyLoginMaxCoins,
    order_cashback_bps: setting.orderCashbackBps,
    referral_inviter_coins: setting.referralInviterCoins,
    referral_invitee_coins: setting.referralInviteeCoins,
    surprise_reward_chance: setting.surpriseRewardChance,
    spin_enabled: setting.spinEnabled,
    spin_daily_limit: setting.spinDailyLimit,
  };
}

export async function getProfilePayload(userId: string) {
  const [user, notificationPreference, addresses, verification, payoutMethods] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.notificationPreference.findUnique({ where: { userId } }).catch(() => null),
    prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.verificationSubmission.findUnique({
      where: { userId },
      include: { documents: true },
    }).catch(() => null),
    prisma.payoutMethod.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    }).catch(() => []),
  ]);

  if (!user) return null;

  return {
    user: serializeUser(user),
    notification_preferences: serializeNotificationPreference(notificationPreference),
    verification: verification
      ? {
          id: verification.id,
          role: verification.role,
          status: verification.status,
          document_type: verification.documentType,
          business_name: verification.businessName ?? null,
          business_license_url: verification.businessLicenseUrl ?? null,
          notes: verification.notes ?? null,
          rejection_reason: verification.rejectionReason ?? null,
          risk_score: verification.riskScore ?? 0,
          submitted_at: verification.submittedAt ? new Date(verification.submittedAt).toISOString() : null,
          reviewed_at: verification.reviewedAt ? new Date(verification.reviewedAt).toISOString() : null,
          documents: Array.isArray(verification.documents)
            ? verification.documents.map((document: any) => ({
                id: document.id,
                type: document.type,
                label: document.label,
                url: document.url,
                mime_type: document.mimeType ?? null,
                size_bytes: document.sizeBytes ?? null,
              }))
            : [],
        }
      : null,
    payout_methods: payoutMethods.map((method: any) => ({
      id: method.id,
      type: method.type,
      provider: method.provider,
      account_name: method.accountName ?? null,
      account_number: method.accountNumber ?? null,
      routing_number: method.routingNumber ?? null,
      mobile_number: method.mobileNumber ?? null,
      is_default: Boolean(method.isDefault),
      metadata: method.metadata ?? null,
      created_at: method.createdAt ? new Date(method.createdAt).toISOString() : null,
    })),
    transaction_history: [],
    privacy_requests: [],
    risk_flags: [],
    addresses: addresses.map(serializeAddress),
  };
}

export function jsonUnauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export { requireAdminRole, requireSellerRole };

export function serializeFlashSaleEntry(entry: any) {
  return {
    id: entry.id,
    campaign_id: entry.campaignId,
    seller_id: entry.sellerId,
    product_id: entry.productId,
    sale_price: toPlainNumber(entry.salePrice),
    allocated_stock: entry.allocatedStock ?? 0,
    status: entry.status,
    note: entry.note ?? null,
    rejection_reason: entry.rejectionReason ?? null,
    reviewed_at: entry.reviewedAt ? new Date(entry.reviewedAt).toISOString() : null,
    created_at: entry.createdAt ? new Date(entry.createdAt).toISOString() : undefined,
    updated_at: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : undefined,
    seller_name: entry.seller?.name ?? null,
    reviewed_by_name: entry.reviewedBy?.name ?? null,
    product: entry.product
      ? {
          id: entry.product.id,
          name: entry.product.name,
          slug: entry.product.slug,
          price: toPlainNumber(entry.product.price),
          old_price: toPlainNumber(entry.product.oldPrice ?? entry.product.price),
          image: entry.product.image ?? null,
          category: entry.product.category ?? null,
          stock: entry.product.stock ?? 0,
        }
      : null,
  };
}

export function serializeFlashSaleCampaign(campaign: any) {
  return {
    id: campaign.id,
    title: campaign.title,
    slug: campaign.slug,
    description: campaign.description ?? '',
    banner_image: campaign.bannerImage ?? '',
    starts_at: campaign.startsAt ? new Date(campaign.startsAt).toISOString() : undefined,
    ends_at: campaign.endsAt ? new Date(campaign.endsAt).toISOString() : undefined,
    status: campaign.status,
    created_by_id: campaign.createdById ?? null,
    created_by_name: campaign.createdBy?.name ?? null,
    created_at: campaign.createdAt ? new Date(campaign.createdAt).toISOString() : undefined,
    updated_at: campaign.updatedAt ? new Date(campaign.updatedAt).toISOString() : undefined,
  };
}

export function buildHourlySeriesFromOrders(orders: Array<{ createdAt: Date; total?: unknown }>, days = 7) {
  const bucketCount = Math.max(1, days) * 24;
  const now = Date.now();
  const start = now - bucketCount * 60 * 60 * 1000;
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = start + index * 60 * 60 * 1000;
    return {
      label: new Date(bucketStart).toISOString(),
      total: 0,
      orders: 0,
    };
  });

  for (const order of orders) {
    const timestamp = new Date(order.createdAt).getTime();
    const index = Math.floor((timestamp - start) / (60 * 60 * 1000));
    if (index >= 0 && index < buckets.length) {
      buckets[index].total += Number(order.total ?? 0);
      buckets[index].orders += 1;
    }
  }

  return buckets;
}

export function buildWeeklyHeatmapFromOrders(orders: Array<{ createdAt: Date }>) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = [0, 4, 8, 12, 16, 20];
  const buckets = days.flatMap((day, dayIndex) =>
    hours.map((hour) => ({
      day,
      day_index: dayIndex,
      hour,
      count: 0,
    })),
  );

  for (const order of orders) {
    const date = new Date(order.createdAt);
    const hourBucket = hours.reduce((selected, hour) => (date.getHours() >= hour ? hour : selected), 0);
    const bucket = buckets.find((item) => item.day_index === date.getDay() && item.hour === hourBucket);
    if (bucket) bucket.count += 1;
  }

  return buckets;
}

export function requireRole(allowedRoles: string[]) {
  const roles = allowedRoles.filter((role): role is AuthenticatedUser['role'] =>
    ['guest', 'customer', 'seller', 'reseller', 'admin'].includes(role),
  );
  return (user: AuthenticatedUser): NextResponse | null => requireCanonicalRole(user, roles);
}
