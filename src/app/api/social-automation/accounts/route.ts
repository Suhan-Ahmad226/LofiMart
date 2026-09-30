import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, requireSellerRole } from '../../_compat/shared';
import { prisma } from '@/lib/server';
import { confirmFacebookPageConnection } from '@/features/social-automation/services/oauth.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SafeAccount = {
  id: string;
  platform: 'facebook';
  accountId: string | null;
  accountName: string | null;
  status: string;
  tokenExpiresAt: Date | null;
  updatedAt: Date;
};

function serializeAccount(account: SafeAccount) {
  return {
    id: account.id,
    platform: account.platform,
    account_id: account.accountId,
    account_name: account.accountName,
    status: account.status,
    connected: account.status === 'CONNECTED',
    token_expires_at: account.tokenExpiresAt?.toISOString() ?? null,
    updated_at: account.updatedAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const accounts = await prisma.socialAccount.findMany({
    where: { sellerId: String(user.id), platform: 'facebook' },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json(accounts.map(serializeAccount));
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const body = (await request.json().catch(() => null)) as { state?: unknown; pageId?: unknown } | null;
  if (typeof body?.state !== 'string' || typeof body.pageId !== 'string' || !body.state || !body.pageId) {
    return NextResponse.json({ error: 'A valid OAuth state and Page selection are required.' }, { status: 400 });
  }

  try {
    const account = await confirmFacebookPageConnection(String(user.id), body.state, body.pageId);
    return NextResponse.json(account, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Facebook Page connection failed.';
    return NextResponse.json(
      { error: message.includes('configured') ? 'Facebook OAuth is not configured.' : message },
      { status: message.includes('invalid or expired') || message.includes('already been used') ? 400 : 502 },
    );
  }
}
