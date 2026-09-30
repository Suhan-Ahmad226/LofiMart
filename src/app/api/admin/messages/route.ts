import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireAdminRole, requireApiUser } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serializeContactMessage(message: any) {
  return {
    id: message.id,
    name: message.name,
    email: message.email,
    subject: message.subject,
    message: message.message,
    status: message.status,
    created_at: message.createdAt ? new Date(message.createdAt).toISOString() : undefined,
    updated_at: message.updatedAt ? new Date(message.updatedAt).toISOString() : undefined,
  };
}

async function requireAdmin(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  return requireAdminRole(user) || user;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const messages = await prisma.contactMessage.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(messages.map(serializeContactMessage));
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '').trim();
  const status = String(body.status || '').trim();

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  const allowedStatuses = new Set(['unread', 'in_progress', 'resolved']);
  if (!allowedStatuses.has(status)) {
    return NextResponse.json({ error: 'Invalid message status' }, { status: 400 });
  }

  const message = await prisma.contactMessage.update({
    where: { id },
    data: { status },
  });

  return NextResponse.json(serializeContactMessage(message));
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '').trim();

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  await prisma.contactMessage.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
