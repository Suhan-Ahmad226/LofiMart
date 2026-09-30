import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireApiUser, requireSellerRole } from '../../../_compat/shared';
import { deleteAutomation, updateAutomation } from '@/features/social-automation/services/social-automation.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid automation request', details: error.flatten() }, { status: 400 });
  }

  const message = error instanceof Error ? error.message : 'Automation request failed';
  return NextResponse.json({ error: message }, { status: message.includes('not found') ? 404 : 400 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  try {
    const { id } = await params;
    const body = await request.json();
    return NextResponse.json(await updateAutomation(String(user.id), id, body));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  try {
    const { id } = await params;
    await deleteAutomation(String(user.id), id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
