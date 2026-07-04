import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser } from '../products/shared';
import { serializeAddress } from '../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function booleanFromUnknown(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  return false;
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const addresses = await prisma.address.findMany({
    where: { userId: String(user.id) },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json(addresses.map(serializeAddress));
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || body.fullName || '').trim();
  const phone = String(body.phone || '').trim();
  const addressText = String(body.address || '').trim();
  const city = String(body.city || body.district || '').trim();

  if (!name || !phone || !addressText || !city) {
    return NextResponse.json({ error: 'Name, phone, address, and city are required' }, { status: 400 });
  }

  const isDefault = booleanFromUnknown(body.is_default ?? body.isDefault);

  if (isDefault) {
    await prisma.address.updateMany({
      where: { userId: String(user.id), isDefault: true },
      data: { isDefault: false },
    });
  }

  const address = await prisma.address.create({
    data: {
      userId: String(user.id),
      label: body.label ? String(body.label) : null,
      type: body.type ? String(body.type) : 'shipping',
      name,
      phone,
      alternatePhone: body.alternate_phone ? String(body.alternate_phone) : body.alternatePhone ? String(body.alternatePhone) : null,
      address: addressText,
      line2: body.line2 ? String(body.line2) : null,
      division: body.division ? String(body.division) : null,
      district: body.district ? String(body.district) : null,
      upazila: body.upazila ? String(body.upazila) : null,
      house: body.house ? String(body.house) : null,
      road: body.road ? String(body.road) : null,
      village: body.village ? String(body.village) : null,
      city,
      state: body.state ? String(body.state) : null,
      postalCode: body.postal_code ? String(body.postal_code) : body.postalCode ? String(body.postalCode) : null,
      country: body.country ? String(body.country) : 'Bangladesh',
      isDefault,
    },
  });

  return NextResponse.json(serializeAddress(address), { status: 201 });
}
