import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { getServerEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function ensureReferralCode(resellerId: string) {
  const existing = await prisma.resellerReferral.findUnique({
    where: { resellerId },
  });
  if (existing) return existing;
  return prisma.resellerReferral.create({
    data: {
      resellerId,
      code: `REF-${resellerId.slice(-6)}-${Date.now().toString(36).toUpperCase()}`,
      clicks: 0,
    },
  });
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireRole(['reseller'])(user);
  if (roleError) return roleError;

  const { code, clicks } = await ensureReferralCode(String(user.id));
  const env = getServerEnv();
  return NextResponse.json({ code, clicks, url: `${env.FRONTEND_URL}/r/${code}` });
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireRole(['reseller'])(user);
  if (roleError) return roleError;

  const codeRow = await ensureReferralCode(String(user.id));
  const env = getServerEnv();
  return NextResponse.json({ code: codeRow.code, url: `${env.FRONTEND_URL}/r/${codeRow.code}` });
}
