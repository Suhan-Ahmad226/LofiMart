import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { z } from 'zod';
import { requireUser } from '../../../../server/next/requireUser';

const AddToCartSchema = z.object({
  productId: z.string(),
  quantity: z.number().positive(),
  variantSku: z.string().optional(),
});

const UpdateCartItemSchema = z.object({
  quantity: z.number().positive(),
});

// Get user from session/auth
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

    // Get cart items from local storage or session
    // For now, returning empty cart - implement cart storage strategy
    const cartItems = await prisma.order.findFirst({
      where: {
        userId: String(user.id),
        status: 'draft', // Draft orders used as shopping cart
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: cartItems || {
        id: null,
        items: [],
        total: 0,
      },
    });
  } catch (error) {
    console.error('GET /api/v2/cart error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch cart' },
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
    const { productId, quantity, variantSku } = AddToCartSchema.parse(body);

    // Get or create draft order
    let cart = await prisma.order.findFirst({
      where: {
        userId: String(user.id),
        status: 'draft',
      },
    });

    if (!cart) {
      cart = await prisma.order.create({
        data: {
          userId: String(user.id),
          status: 'draft',
          total: 0,
        },
      });
    }

    // Get product price
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { price: true },
    });

    if (!product) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 }
      );
    }

    // Add or update cart item
    const cartItem = await prisma.orderItem.create({
      data: {
        orderId: cart.id,
        productId,
        qty: quantity,
        price: product.price,
        variantSku,
      },
    });

    // Update cart total
    const total = await prisma.orderItem.aggregate({
      where: { orderId: cart.id },
      _sum: { price: true },
    });

    await prisma.order.update({
      where: { id: cart.id },
      data: { total: total._sum.price || 0 },
    });

    return NextResponse.json(
      { success: true, data: cartItem },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: error.issues },
        { status: 400 }
      );
    }
    console.error('POST /api/v2/cart error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add to cart' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const itemId = searchParams.get('itemId');

    if (!itemId) {
      return NextResponse.json(
        { success: false, error: 'itemId is required' },
        { status: 400 }
      );
    }

    await prisma.orderItem.delete({
      where: { id: itemId },
    });

    return NextResponse.json({ success: true, message: 'Item removed from cart' });
  } catch (error) {
    console.error('DELETE /api/v2/cart error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove item' },
      { status: 500 }
    );
  }
}
