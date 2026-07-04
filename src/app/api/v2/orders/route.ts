import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { z } from 'zod';
import { requireUser } from '@/src/server/next/requireUser';

const CreateOrderSchema = z.object({
  shippingAddressId: z.string(),
  paymentMethod: z.enum(['card', 'bank_transfer', 'mobile_money', 'cash_on_delivery']),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);

    if (user instanceof NextResponse) {
      return user;
    }

    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const status = searchParams.get('status');

    const where: any = { userId: String(user.id) };
    if (status && status !== 'all') {
      where.status = status;
    }
    // Exclude draft orders (carts)
    where.NOT = { status: 'draft' };

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: { product: { select: { name: true, image: true } } },
          },
          shipments: {
            select: {
              id: true,
              status: true,
              trackingId: true,
              courierProvider: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('GET /api/v2/orders error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);

    if (user instanceof NextResponse) {
      return user;
    }

    const body = await request.json();
    const { shippingAddressId, paymentMethod } = CreateOrderSchema.parse(body);

    // Get draft cart
    const cart = await prisma.order.findFirst({
      where: { userId: String(user.id), status: 'draft' },
      include: { items: true },
    });

    if (!cart || cart.items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Cart is empty' },
        { status: 400 }
      );
    }

    // Get shipping address
    const address = await prisma.address.findUnique({
      where: { id: shippingAddressId },
    });

    if (!address || address.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Invalid shipping address' },
        { status: 400 }
      );
    }

    // Generate order code
    const orderCode = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Create order from cart
    const order = await prisma.order.update({
      where: { id: cart.id },
      data: {
        status: 'pending',
        orderCode,
        paymentMethod,
        shippingAddress: address,
      },
      include: {
        items: { include: { product: true } },
      },
    });

    return NextResponse.json(
      { success: true, data: order },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: error.issues },
        { status: 400 }
      );
    }
    console.error('POST /api/v2/orders error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create order' },
      { status: 500 }
    );
  }
}
