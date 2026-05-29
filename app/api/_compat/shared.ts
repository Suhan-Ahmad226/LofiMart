import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { ensureRedis } from '@/src/services/messaging/redis';
import { requireApiUser, toPlainNumber } from '../products/shared';

export { requireApiUser, toPlainNumber };

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
    if (items.length > 0) {
      await redis.set(userCartKey(userId), JSON.stringify(items), 'EX', Number(process.env.SESSION_TTL_SECONDS || 604800));
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

export async function getProfilePayload(userId: string) {
  const [user, notificationPreference, addresses] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.notificationPreference.findUnique({ where: { userId } }).catch(() => null),
    prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  if (!user) return null;

  return {
    user: serializeUser(user),
    notification_preferences: serializeNotificationPreference(notificationPreference),
    verification: null,
    payout_methods: [],
    transaction_history: [],
    privacy_requests: [],
    risk_flags: [],
    addresses: addresses.map(serializeAddress),
  };
}

export function jsonUnauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
