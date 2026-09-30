import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireApiUser, requireSellerRole } from '../../_compat/shared';
import { createPostOrAutomation } from '@/features/social-automation/services/social-automation.service';
import { SocialAutomationPublishError } from '@/features/social-automation/services/publishing.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function publishStatus(message: string) {
  if (message.includes('not found')) return 404;
  if (message.includes('out of stock')) return 409;
  if (message.includes('not connected') || message.includes('not configured')) return 409;
  return 502;
}

function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid post request', details: error.flatten() }, { status: 400 });
  }

  const message = error instanceof Error ? error.message : 'Failed to create social post';

  if (error instanceof SocialAutomationPublishError) {
    return NextResponse.json({ error: message }, { status: publishStatus(message) });
  }

  const status = message.includes('not found') ? 404 : message.includes('not connected') ? 409 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  try {
    const body = await request.json();
    const result = await createPostOrAutomation(String(user.id), body);

    if (result.kind === 'post' && result.post.status === 'FAILED') {
      return NextResponse.json(
        { error: result.post.error_message || 'Facebook publishing failed. Please try again.' },
        { status: 502 },
      );
    }

    if (result.kind === 'post' && result.duplicate) {
      return NextResponse.json(result, { status: 200 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
