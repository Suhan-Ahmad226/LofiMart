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

  const { skip, take, meta } = buildPrismaPagination(request as any, { maxLimit: 100, defaultLimit: 25 });
  const search = request.nextUrl.searchParams.get('search')?.trim().slice(0, 100) || '';
  const where = search
    ? {
        OR: [
          { id: { contains: search } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { name: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : undefined;
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
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

  return NextResponse.json({
    users: users.map((u) => ({
      ...serializeUser(u),
      verification_status: u.verificationSubmission?.status ?? null,
      risk_flag_count: u.riskFlags.length,
    })),
    pagination: {
      ...meta,
      total,
      totalPages: Math.max(1, Math.ceil(total / take)),
    },
  });
}
