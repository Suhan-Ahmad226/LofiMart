import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireAdminRole, requireApiUser } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serializeSubsubcategory(subsubcategory: any) {
  return {
    id: subsubcategory.id,
    subcategory_id: subsubcategory.subcategoryId,
    name: subsubcategory.name,
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

  const rows = await prisma.subsubcategory.findMany({
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(rows.map(serializeSubsubcategory));
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => ({}));
  const subcategoryId = String(body.subcategory_id ?? '').trim();
  const name = String(body.name ?? '').trim();

  if (!subcategoryId) {
    return NextResponse.json({ error: 'Parent subcategory is required' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'Sub-subcategory name is required' }, { status: 400 });
  }

  const subcategory = await prisma.subcategory.findUnique({
    where: { id: subcategoryId },
    select: { id: true },
  });

  if (!subcategory) {
    return NextResponse.json({ error: 'Selected parent subcategory was not found' }, { status: 400 });
  }

  const subsubcategory = await prisma.subsubcategory.create({
    data: {
      subcategoryId,
      name,
    },
  });

  return NextResponse.json(serializeSubsubcategory(subsubcategory), { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '').trim();

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  await prisma.subsubcategory.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
