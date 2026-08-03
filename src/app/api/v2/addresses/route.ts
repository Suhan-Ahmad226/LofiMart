import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { z } from 'zod';
import { requireUser } from '../../../../server/next/requireUser';

const AddressSchema = z.object({
  label: z.string().optional(),
  name: z.string(),
  phone: z.string(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  country: z.string().default('Bangladesh'),
  isDefault: z.boolean().default(false),
});

async function getAuthUser(request: NextRequest) {
  const user = await requireUser(request);
  return user instanceof NextResponse ? null : user;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const addresses = await prisma.address.findMany({
      where: { userId: String(user.id) },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: addresses });
  } catch (error) {
    console.error('GET /api/v2/addresses error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch addresses' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const data = AddressSchema.parse(body);

    if (data.isDefault) {
      await prisma.address.updateMany({
        where: { userId: String(user.id), isDefault: true },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.create({
      data: {
        name: data.name,
        phone: data.phone,
        address: data.address,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        country: data.country,
        label: data.label,
        isDefault: data.isDefault,
        userId: String(user.id),
      },
    });

    return NextResponse.json(
      { success: true, data: address },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: error.issues },
        { status: 400 }
      );
    }
    console.error('POST /api/v2/addresses error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create address' },
      { status: 500 }
    );
  }
}
