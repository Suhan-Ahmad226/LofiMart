import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, requireSellerRole } from '../../_compat/shared';
import { getProductsPayload } from '@/features/social-automation/services/social-automation.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  try {
    return NextResponse.json(await getProductsPayload(String(user.id)));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load social automation products' },
      { status: 400 },
    );
  }
}
