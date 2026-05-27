import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { z } from 'zod';

const SearchSchema = z.object({
  q: z.string().min(1),
  category: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const params = SearchSchema.parse({
      q: searchParams.get('q'),
      category: searchParams.get('category'),
      minPrice: searchParams.get('minPrice'),
      maxPrice: searchParams.get('maxPrice'),
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
    });

    // Build where clause for full-text search
    const where: any = {
      OR: [
        { name: { contains: params.q, mode: 'insensitive' } },
        { description: { contains: params.q, mode: 'insensitive' } },
      ],
    };

    if (params.category) {
      where.category = params.category;
    }

    if (params.minPrice || params.maxPrice) {
      where.price = {};
      if (params.minPrice) where.price.gte = params.minPrice;
      if (params.maxPrice) where.price.lte = params.maxPrice;
    }

    const skip = (params.page - 1) * params.limit;

    const [results, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: params.limit,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          price: true,
          image: true,
          category: true,
          rating: true,
          reviewsCount: true,
        },
      }),
      prisma.product.count({ where }),
    ]);

    // Also search in sellers if query looks like a store name
    const sellerResults = await prisma.user.findMany({
      where: {
        role: 'seller',
        storeName: { contains: params.q, mode: 'insensitive' },
      },
      take: 5,
      select: {
        id: true,
        storeName: true,
        storefrontSlug: true,
        avatarUrl: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        products: results,
        sellers: sellerResults,
      },
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        pages: Math.ceil(total / params.limit),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters', details: error.issues },
        { status: 400 }
      );
    }
    console.error('GET /api/v2/search error:', error);
    return NextResponse.json(
      { success: false, error: 'Search failed' },
      { status: 500 }
    );
  }
}
