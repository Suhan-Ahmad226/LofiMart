import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { readUserCart, requireApiUser, userCartKey } from '../../../_compat/shared';
import { enqueueCartRecovery } from '../../../../../workers/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_RECOVERY_DELAY_MINS = 120;

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const items = await readUserCart(user.id);
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ success: true, scheduled: false, reason: 'empty_cart' });
  }

  if (!user.email) {
    return NextResponse.json({ success: false, scheduled: false, reason: 'no_email' });
  }

  let delayMins = DEFAULT_RECOVERY_DELAY_MINS;
  try {
    const setting = await prisma.tenantSetting.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { cartRecoveryDelayMins: true },
    });
    if (setting?.cartRecoveryDelayMins) {
      delayMins = setting.cartRecoveryDelayMins;
    }
  } catch {
    // Fall back to the default recovery delay on config read failure.
  }

  try {
    await enqueueCartRecovery({
      userId: String(user.id),
      email: user.email,
      name: user.name ?? null,
      tenantId: user.tenantId ?? null,
      cartKey: userCartKey(user.id),
      cartRecoveryDelayMins: delayMins,
    });
  } catch (error) {
    console.error('POST /api/cart/recovery/schedule error:', error);
    return NextResponse.json({ success: false, scheduled: false }, { status: 503 });
  }

  return NextResponse.json({ success: true, scheduled: true, scheduled_in_minutes: delayMins });
}