import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const roleError = requireRole(['admin'])(user);
  if (roleError) return roleError;

  await prisma.category.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
