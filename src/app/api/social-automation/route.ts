import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireApiUser, requireSellerRole } from '../_compat/shared';
import { getDashboardPayload } from '@/features/social-automation/services/social-automation.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid social automation request', details: error.flatten() }, { status: 400 });
  }

  return NextResponse.json({ error: error instanceof Error ? error.message : 'Social automation request failed' }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  try {
    const payload = await getDashboardPayload(String(user.id));
    return NextResponse.json(payload);
  } catch (error) {
    return apiError(error);
  }
}
