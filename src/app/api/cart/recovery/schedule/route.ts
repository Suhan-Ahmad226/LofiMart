import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '../../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  return NextResponse.json({ success: true, scheduled_in_minutes: 120 });
}
