import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireAdminRole, requireApiUser } from '../../_compat/shared';
import { serializeCategory } from '@/server/serializers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  return requireAdminRole(user) || user;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(categories.map(serializeCategory));
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const icon = body.icon ? String(body.icon).trim() : null;

  if (!name) {
    return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
  }

  const category = await prisma.category.create({
    data: {
      name,
      icon: icon || null,
    },
  });

  return NextResponse.json(serializeCategory(category), { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '').trim();

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  await prisma.category.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
