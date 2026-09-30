import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { cleanupApplicationUser } from '@/lib/media/user-cleanup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const roleError = requireRole(['admin'])(user);
  if (roleError) return roleError;

  if (String(user.id) === id) {
    return NextResponse.json({ error: "You cannot delete your own admin account from the admin panel" }, { status: 400 });
  }

  await cleanupApplicationUser({
    userId: id,
    reason: 'admin-user-delete',
    deleteSupabaseUser: true,
  });

  return NextResponse.json({ success: true });
}
