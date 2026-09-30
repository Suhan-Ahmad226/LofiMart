import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, requireSellerRole } from '../../../../_compat/shared';
import { validateSocialAccountConnection } from '@/features/social-automation/services/social-automation.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  try {
    const { id } = await params;
    const result = await validateSocialAccountConnection(String(user.id), id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Facebook connection validation failed.';
    return NextResponse.json(
      { error: message },
      { status: message.includes('not found') ? 404 : 502 },
    );
  }
}