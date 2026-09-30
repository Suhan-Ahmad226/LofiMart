import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '../../../_compat/shared';
import { cancelCartRecovery } from '../../../../../workers/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  try {
    await cancelCartRecovery(String(user.id));
  } catch {
    // The job may already be running or completed; nothing actionable client-side.
  }

  return NextResponse.json({ success: true });
}