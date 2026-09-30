import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireAdminRole, requireApiUser, serializeUser, toPlainNumber } from '../../_compat/shared';
import { buildPrismaPagination } from '@/server/middleware/pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireAdminRole(user);
  if (roleError) return roleError;

  const { skip, take, meta } = buildPrismaPagination(request as any, { maxLimit: 100 });
  const [total, users] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        verificationSubmission: true,
        riskFlags: {
          where: { isActive: true },
        },
      },
    }),
  ]);

  return NextResponse.json(users.map((u) => ({
    ...serializeUser(u),
    verification_status: u.verificationSubmission?.status ?? null,
    risk_flag_count: u.riskFlags.length,
  })));
}
