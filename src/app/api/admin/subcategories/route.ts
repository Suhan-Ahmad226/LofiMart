import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireAdminRole, requireApiUser } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serializeSubcategory(subcategory: any) {
  return {
    id: subcategory.id,
    category_id: subcategory.categoryId,
    name: subcategory.name,
    icon: subcategory.icon ?? null,
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

  const rows = await prisma.subcategory.findMany({
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(rows.map(serializeSubcategory));
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => ({}));
  const categoryId = String(body.category_id ?? '').trim();
  const name = String(body.name ?? '').trim();
  const icon = body.icon ? String(body.icon).trim() : null;

  if (!categoryId) {
    return NextResponse.json({ error: 'Parent category is required' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'Subcategory name is required' }, { status: 400 });
  }

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });

  if (!category) {
    return NextResponse.json({ error: 'Selected parent category was not found' }, { status: 400 });
  }

  const subcategory = await prisma.subcategory.create({
    data: {
      categoryId,
      name,
      icon: icon || null,
    },
  });

  return NextResponse.json(serializeSubcategory(subcategory), { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '').trim();

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  await prisma.subcategory.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
