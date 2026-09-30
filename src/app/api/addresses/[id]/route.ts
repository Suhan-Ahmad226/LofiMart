import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser } from '../../products/shared';
import { serializeAddress } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

function booleanFromUnknown(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  return false;
}

export async function PATCH(request: NextRequest, context: { params: Params }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  const existing = await prisma.address.findFirst({
    where: { id, userId: String(user.id) },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Address not found' }, { status: 404 });
  }

  const isDefault = booleanFromUnknown(body.is_default ?? body.isDefault);

  if (isDefault) {
    await prisma.address.updateMany({
      where: { userId: String(user.id) },
      data: { isDefault: false },
    });
  }

  const address = await prisma.address.update({
    where: { id },
    data: {
      label: body.label !== undefined ? (body.label ? String(body.label) : null) : undefined,
      type: body.type !== undefined ? String(body.type) : undefined,
      name: body.name !== undefined ? String(body.name) : undefined,
      phone: body.phone !== undefined ? String(body.phone) : undefined,
      alternatePhone: body.alternate_phone !== undefined ? (body.alternate_phone ? String(body.alternate_phone) : null) : undefined,
      address: body.address !== undefined ? String(body.address) : undefined,
      line2: body.line2 !== undefined ? (body.line2 ? String(body.line2) : null) : undefined,
      division: body.division !== undefined ? String(body.division) : undefined,
      district: body.district !== undefined ? String(body.district) : undefined,
      upazila: body.upazila !== undefined ? String(body.upazila) : undefined,
      house: body.house !== undefined ? String(body.house) : undefined,
      road: body.road !== undefined ? String(body.road) : undefined,
      village: body.village !== undefined ? String(body.village) : undefined,
      city: body.city !== undefined ? String(body.city) : undefined,
      state: body.state !== undefined ? String(body.state) : undefined,
      postalCode: body.postal_code !== undefined ? String(body.postal_code) : undefined,
      country: body.country !== undefined ? String(body.country) : undefined,
      isDefault,
    },
  });

  return NextResponse.json({ success: true, address: serializeAddress(address) });
}

export async function DELETE(request: NextRequest, context: { params: Params }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await context.params;

  const existing = await prisma.address.findFirst({
    where: { id, userId: String(user.id) },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Address not found' }, { status: 404 });
  }

  await prisma.address.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
