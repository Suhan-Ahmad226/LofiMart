import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/server';
import {
  getPublicPublishedProductWhere,
  productSellerInclude,
  serializeProduct,
  toPlainNumber,
} from '@/app/api/products/shared';
import type { Product } from '@/types';

const HOME_PRODUCTS_PAGE_SIZE = 12;
const FLASH_SALE_PAGE_SIZE = 4;

const PUBLIC_CAMPAIGN_STATUSES = ['active', 'published', 'scheduled'];
const PUBLIC_ENTRY_STATUSES = ['approved', 'active', 'published'];

type Category = {
  id: string | number;
  name: string;
  icon?: string | null;
};

type HomeBanner = {
  id: string | number;
  title: string;
  subtitle?: string | null;
  image: string;
  link?: string | null;
  buttonText?: string | null;
  button_text?: string | null;
};

export type HomepageInitialData = {
  products: Product[];
  categories: Category[];
  hasMoreProducts: boolean;
  banners: HomeBanner[];
  flashSaleEndsAt: string | null;
  flashSaleProducts: Product[];
};

function deriveCategoriesFromProducts(products: Array<{ category?: string | null }>): Category[] {
  return Array.from(new Set(products.map((product) => product.category).filter(Boolean))).map((name) => ({
    id: String(name).toLowerCase().replace(/\s+/g, '-'),
    name: String(name),
    icon: null,
  }));
}

async function loadHomepageData(): Promise<HomepageInitialData> {
  const now = new Date();
  const productWhere = getPublicPublishedProductWhere();

  const [products, productTotal, categories, banners, campaign] = await Promise.all([
    prisma.product.findMany({
      where: productWhere,
      include: productSellerInclude,
      orderBy: [{ reviewsCount: 'desc' }, { createdAt: 'desc' }],
      take: HOME_PRODUCTS_PAGE_SIZE,
    }),
    prisma.product.count({ where: productWhere }),
    prisma.category.findMany({
      select: { id: true, name: true, icon: true },
      orderBy: { name: 'asc' },
    }),
    prisma.banner.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, subtitle: true, image: true, link: true, buttonText: true },
    }),
    prisma.flashSaleCampaign.findFirst({
      where: {
        status: { in: PUBLIC_CAMPAIGN_STATUSES },
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      orderBy: { endsAt: 'asc' },
    }),
  ]);

  const flashEntries = campaign
    ? await prisma.flashSaleEntry.findMany({
        where: { campaignId: campaign.id, status: { in: PUBLIC_ENTRY_STATUSES } },
        orderBy: { createdAt: 'asc' },
        take: FLASH_SALE_PAGE_SIZE,
        include: { product: { include: productSellerInclude } },
      })
    : [];

  const productPayload = products.map(serializeProduct);

  const flashSaleProducts = flashEntries
    .map((entry) => {
      if (!entry.product) return null;

      const base = serializeProduct(entry.product);
      const salePrice = toPlainNumber(entry.salePrice);
      const currentPrice = toPlainNumber(entry.product.price);
      if (salePrice === null || salePrice <= 0) return base;

      return {
        ...base,
        old_price: currentPrice ?? base.old_price,
        price: salePrice,
      };
    })
    .filter((product) => product !== null) as unknown as Product[];

  return {
    products: productPayload,
    categories: categories.length > 0 ? categories : deriveCategoriesFromProducts(productPayload),
    hasMoreProducts: productTotal > productPayload.length,
    banners: banners.map((banner) => ({ ...banner, button_text: banner.buttonText })),
    flashSaleEndsAt: campaign?.endsAt ? new Date(campaign.endsAt).toISOString() : null,
    flashSaleProducts,
  };
}

export const getHomepageData = unstable_cache(loadHomepageData, ['homepage-v1'], {
  revalidate: 60,
  tags: ['homepage', 'home-banners'],
});

export const HOMEPAGE_CACHE_TAGS = {
  all: 'homepage',
  banners: 'home-banners',
} as const;