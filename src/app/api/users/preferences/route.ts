import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, serializeNotificationPreference } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const preference = await prisma.notificationPreference.findUnique({
    where: { userId: String(user.id) },
  });

  if (!preference) {
    return NextResponse.json({
      email: true,
      push: true,
      sms: false,
      orderUpdates: true,
      marketing: false,
      payoutAlerts: true,
      securityAlerts: true,
    });
  }

  return NextResponse.json({
    email: preference.emailEnabled,
    push: preference.smsEnabled, // Note: field mapping
    sms: preference.smsEnabled,
    orderUpdates: preference.orderUpdates,
    marketing: preference.marketingOptIn,
    payoutAlerts: preference.payoutAlerts,
    securityAlerts: preference.securityAlerts,
  });
}

export async function PATCH(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  if ('email' in body) data.emailEnabled = Boolean(body.email);
  if ('sms' in body) data.smsEnabled = Boolean(body.sms);
  if ('orderUpdates' in body) data.orderUpdates = Boolean(body.orderUpdates);
  if ('marketing' in body) data.marketingOptIn = Boolean(body.marketing);
  if ('payoutAlerts' in body) data.payoutAlerts = Boolean(body.payoutAlerts);
  if ('securityAlerts' in body) data.securityAlerts = Boolean(body.securityAlerts);

  const preference = await prisma.notificationPreference.upsert({
    where: { userId: String(user.id) },
    create: {
      userId: String(user.id),
      emailEnabled: data.emailEnabled as boolean ?? true,
      smsEnabled: data.smsEnabled as boolean ?? false,
      orderUpdates: data.orderUpdates as boolean ?? true,
      marketingOptIn: data.marketingOptIn as boolean ?? false,
      payoutAlerts: data.payoutAlerts as boolean ?? true,
      securityAlerts: data.securityAlerts as boolean ?? true,
    },
    update: data,
  });

  return NextResponse.json({
    email: preference.emailEnabled,
    sms: preference.smsEnabled,
    orderUpdates: preference.orderUpdates,
    marketing: preference.marketingOptIn,
    payoutAlerts: preference.payoutAlerts,
    securityAlerts: preference.securityAlerts,
  });
}
