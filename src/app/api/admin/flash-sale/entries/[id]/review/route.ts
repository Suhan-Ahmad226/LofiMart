import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, requireAdminRole } from '../../../../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireAdminRole(user);
  if (roleError) return roleError;

  const { id: entryId } = await params;
  const body = await request.json().catch(() => ({}));
  const status = typeof body.status === 'string' ? body.status.trim() : '';
  const rejectionReason = typeof body.rejectionReason === 'string' ? body.rejectionReason.trim() : '';

  if (!['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid review status' }, { status: 400 });
  }

  try {
    const entry = await prisma.flashSaleEntry.findUnique({ where: { id: entryId } });
    if (!entry) return NextResponse.json({ error: 'Flash sale entry not found' }, { status: 404 });

    await prisma.flashSaleEntry.update({
      where: { id: entryId },
      data: {
        status,
        reviewedById: String(user.id),
        reviewedAt: new Date(),
        rejectionReason: status === 'rejected' ? rejectionReason || 'Rejected by admin' : null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/admin/flash-sale/entries/[id]/review error:', error);
    return NextResponse.json({ error: 'Failed to review flash sale entry' }, { status: 500 });
  }
}