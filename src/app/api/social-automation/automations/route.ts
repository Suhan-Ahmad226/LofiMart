import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireApiUser, requireSellerRole } from '../../_compat/shared';
import { createPostOrAutomation, listAutomations } from '@/features/social-automation/services/social-automation.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid automation request', details: error.flatten() }, { status: 400 });
  }

  const message = error instanceof Error ? error.message : 'Automation request failed';
  const status = message.includes('not found') ? 404 : message.includes('not connected') ? 409 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  try {
    return NextResponse.json(await listAutomations(String(user.id)));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  try {
    const body = await request.json();
    const result = await createPostOrAutomation(String(user.id), { ...body, postingType: 'recurring' });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
