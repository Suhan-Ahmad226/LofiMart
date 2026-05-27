import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { z } from 'zod';

const UpdateAddressSchema = z.object({
  label: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  isDefault: z.boolean().optional(),
});

async function getAuthUser(request: NextRequest) {
  // TODO: Implement your auth logic
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getAuthUser(request);
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const address = await prisma.address.findUnique({
      where: { id },
    });

    if (!address || address.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Address not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: address });
  } catch (error) {
    console.error('GET /api/v2/addresses/[id] error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch address' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getAuthUser(request);
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const data = UpdateAddressSchema.parse(body);

    const address = await prisma.address.findUnique({ where: { id } });

    if (!address || address.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Address not found' },
        { status: 404 }
      );
    }

    if (data.isDefault) {
      await prisma.address.updateMany({
        where: { userId: user.id, NOT: { id } },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.address.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: error.issues },
        { status: 400 }
      );
    }
    console.error('PATCH /api/v2/addresses/[id] error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update address' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getAuthUser(request);
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const address = await prisma.address.findUnique({ where: { id } });

    if (!address || address.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Address not found' },
        { status: 404 }
      );
    }

    await prisma.address.delete({ where: { id } });

    return NextResponse.json({ success: true, message: 'Address deleted' });
  } catch (error) {
    console.error('DELETE /api/v2/addresses/[id] error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete address' },
      { status: 500 }
    );
  }
}
