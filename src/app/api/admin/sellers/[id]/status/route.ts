import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireAdminRole, requireApiUser } from '../../../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

async function requireAdmin(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  return requireAdminRole(user) || user;
}

export async function POST(request: NextRequest, context: { params: Params }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const status = String(body.status || '').trim();

  const allowedStatuses = new Set(['approved', 'rejected', 'suspended', 'under_review', 'draft']);
  if (!allowedStatuses.has(status)) {
    return NextResponse.json({ error: 'Invalid seller status' }, { status: 400 });
  }

  const data: Record<string, unknown> = { sellerStatus: status };
  if (status === 'rejected' || status === 'suspended') {
    const reason = body.reason ? String(body.reason).trim() : '';
    if (reason.length < 5) {
      return NextResponse.json(
        { error: 'A reason of at least 5 characters is required for rejected or suspended sellers' },
        { status: 400 },
      );
    }
    data.rejectionReason = reason;
  }

  await prisma.user.update({
    where: { id },
    data,
  });

  return NextResponse.json({ success: true });
}