import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { getPublicPublishedProductWhere, productSellerInclude, serializeProduct } from '../products/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [products, categories, banners] = await Promise.all([
      prisma.product.findMany({
        where: getPublicPublishedProductWhere(),
        include: productSellerInclude,
        orderBy: { createdAt: 'desc' },
        take: 60,
      }),
      prisma.category.findMany({
        select: {
          id: true,
          name: true,
          icon: true,
        },
        orderBy: { name: 'asc' },
      }).catch(() => []),
      prisma.banner.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          subtitle: true,
          image: true,
          link: true,
          buttonText: true,
        },
      }).catch(() => []),
    ]);

    const productPayload = products.map(serializeProduct);
    const categoryPayload =
      categories.length > 0
        ? categories
        : Array.from(new Set(productPayload.map((product) => product.category).filter(Boolean))).map((name) => ({
            id: String(name).toLowerCase().replace(/\s+/g, '-'),
            name,
            icon: null,
          }));

    return NextResponse.json({
      products: productPayload,
      categories: categoryPayload,
      banners: banners.map((banner) => ({
        id: banner.id,
        title: banner.title,
        subtitle: banner.subtitle ?? '',
        image: banner.image,
        link: banner.link,
        button_text: banner.buttonText,
        buttonText: banner.buttonText,
      })),
    });
  } catch (error) {
    console.error('GET /api/shop-page error:', error);
    return NextResponse.json({ error: 'Failed to load homepage data' }, { status: 500 });
  }
}
